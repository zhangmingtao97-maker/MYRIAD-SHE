import { BadRequestException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { verifyAdminPassword } from './admin-password';

interface AdminLoginSource {
  ip?: string;
}

interface AdminLoginFailureState {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private readonly adminLoginFailures = new Map<string, AdminLoginFailureState>();
  private wechatAccessToken: { value: string; expiresAt: number } | null = null;
  private wechatAccessTokenPromise: Promise<string> | null = null;

  private loginPolicy() {
    const maxAttempts = Number(this.config.get('ADMIN_LOGIN_MAX_ATTEMPTS', 5));
    const lockSeconds = Number(this.config.get('ADMIN_LOGIN_LOCK_SECONDS', 900));
    return {
      maxAttempts: Number.isInteger(maxAttempts) && maxAttempts > 0 ? Math.min(maxAttempts, 20) : 5,
      lockMs: Number.isInteger(lockSeconds) && lockSeconds > 0 ? Math.min(lockSeconds, 86_400) * 1000 : 900_000,
    };
  }

  private loginKeys(username: string, source?: AdminLoginSource) {
    return [
      `account:${username.slice(0, 128)}`,
      `source:${(source?.ip || 'unknown').slice(0, 64)}`,
    ];
  }

  private activeLoginState(key: string, now: number) {
    const state = this.adminLoginFailures.get(key);
    if (state?.lockedUntil && state.lockedUntil <= now) {
      this.adminLoginFailures.delete(key);
      return undefined;
    }
    return state;
  }

  private pruneLoginFailures(now: number) {
    for (const [key, state] of this.adminLoginFailures) {
      if (state.lockedUntil <= now && now - state.lastFailureAt > 86_400_000) this.adminLoginFailures.delete(key);
    }
    if (this.adminLoginFailures.size <= 2_000) return;
    const oldest = [...this.adminLoginFailures.entries()]
      .sort(([, left], [, right]) => left.lastFailureAt - right.lastFailureAt)
      .slice(0, this.adminLoginFailures.size - 2_000);
    for (const [key] of oldest) this.adminLoginFailures.delete(key);
  }

  private async recordAdminLoginAudit(action: 'admin.auth.login_succeeded' | 'admin.auth.login_failed', username: string, metadata: Record<string, unknown> = {}) {
    try {
      await this.audit.record({
        actorType: action === 'admin.auth.login_succeeded' ? 'admin' : 'system',
        actorId: action === 'admin.auth.login_succeeded' ? `admin:${username}` : undefined,
        action,
        resourceType: 'admin_login',
        metadata: { username: username.slice(0, 128), ...metadata },
      });
    } catch {
      // Authentication must remain available if the audit store is temporarily unavailable.
    }
  }

  private sessionTtlSeconds(key: string, fallback: number) {
    const configured = Number(this.config.get(key, fallback));
    // Keep browser/API sessions bounded even if an environment value is
    // accidentally expressed in milliseconds or an otherwise valid but
    // unreasonably large number.
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 30 * 24 * 60 * 60) : fallback;
  }

  private upstreamTimeoutMs() {
    const configured = Number(this.config.get('WECHAT_OPEN_API_TIMEOUT_MS', 8_000));
    return Number.isInteger(configured) && configured >= 100
      ? Math.min(configured, 30_000)
      : 8_000;
  }

  async adminLogin(username: string, password: string, source?: AdminLoginSource) {
    const normalizedUsername = username.trim();
    const now = Date.now();
    this.pruneLoginFailures(now);
    const keys = this.loginKeys(normalizedUsername, source);
    const states = keys.map((key) => this.activeLoginState(key, now));
    if (states.some((state) => state !== undefined && state.lockedUntil > now)) {
      await this.recordAdminLoginAudit('admin.auth.login_failed', normalizedUsername, { reason: 'locked' });
      throw new HttpException('登录尝试过多，请稍后重试', HttpStatus.TOO_MANY_REQUESTS);
    }
    const expectedUser = String(this.config.get('ADMIN_DEV_USERNAME', 'admin')).trim();
    const expectedPassword = this.config.get('ADMIN_DEV_PASSWORD', 'change-me-admin-password');
    const isLegacyValid = normalizedUsername === expectedUser && password === expectedPassword;
    const staff = isLegacyValid ? null : await this.database.query<{ id: string; role: string; passwordHash: string; passwordChangeRequired: boolean }>(
      `select id, role, password_hash as "passwordHash", password_change_required as "passwordChangeRequired" from admin_accounts where username = $1 and status = 'active'`, [normalizedUsername],
    );
    const staffAccount = staff?.rows[0];
    const isStaffValid = staffAccount ? await verifyAdminPassword(password, staffAccount.passwordHash) : false;
    if (!isStaffValid && !isLegacyValid) {
      const policy = this.loginPolicy();
      let locked = false;
      let failures = 0;
      for (const [index, key] of keys.entries()) {
        const next: AdminLoginFailureState = {
          failures: (states[index]?.failures ?? 0) + 1,
          lastFailureAt: now,
          lockedUntil: 0,
        };
        if (next.failures >= policy.maxAttempts) next.lockedUntil = now + policy.lockMs;
        this.adminLoginFailures.set(key, next);
        failures = Math.max(failures, next.failures);
        locked ||= next.lockedUntil > now;
      }
      await this.recordAdminLoginAudit('admin.auth.login_failed', normalizedUsername, {
        reason: 'invalid_credentials',
        failures,
        locked,
      });
      if (locked) throw new HttpException('登录尝试过多，请稍后重试', HttpStatus.TOO_MANY_REQUESTS);
      throw new UnauthorizedException('用户名或密码错误');
    }
    for (const key of keys) this.adminLoginFailures.delete(key);
    const expiresIn = this.sessionTtlSeconds('ADMIN_SESSION_TTL_SECONDS', 86400);
    const loginId = staffAccount?.id ?? `admin:${normalizedUsername}`;
    const role = (staffAccount?.role ?? 'super_admin') as 'super_admin' | 'content_editor' | 'support_readonly';
    if (staffAccount) await this.database.query('update admin_accounts set last_login_at = now() where id = $1', [staffAccount.id]);
    const token = await this.jwt.signAsync({ sub: loginId, role, ...(staffAccount ? { passwordChangeRequired: staffAccount.passwordChangeRequired === true } : {}) }, { expiresIn });
    await this.recordAdminLoginAudit('admin.auth.login_succeeded', normalizedUsername);
    return { accessToken: token, expiresIn };
  }

  async wechatLogin(code: string) {
    const normalizedCode = code.trim();
    if (!normalizedCode) throw new UnauthorizedException('缺少微信登录凭证');
    const appId = this.config.get<string>('WECHAT_MINI_APP_ID');
    const secret = this.config.get<string>('WECHAT_MINI_APP_SECRET');
    if (!appId || !secret) throw new UnauthorizedException('微信小程序配置未完成');

    const query = new URLSearchParams({ appid: appId, secret, js_code: normalizedCode, grant_type: 'authorization_code' });
    const controller = new AbortController();
    const timeoutMs = this.upstreamTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.config.get('WECHAT_OPEN_API_BASE_URL', 'https://api.weixin.qq.com')}/sns/jscode2session?${query}`, { signal: controller.signal });
    } catch {
      clearTimeout(timeout);
      throw new UnauthorizedException('微信登录服务暂时不可用');
    }
    if (!response.ok) {
      clearTimeout(timeout);
      throw new UnauthorizedException('微信登录服务暂时不可用');
    }
    let result: { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
    try {
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_wechat_response');
      result = parsed as { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') throw new UnauthorizedException('微信登录服务暂时不可用');
      throw new UnauthorizedException('微信登录服务返回无效数据');
    }
    clearTimeout(timeout);
    const openid = typeof result.openid === 'string' ? result.openid.trim() : '';
    const unionid = typeof result.unionid === 'string' ? result.unionid.trim() : null;
    const errorMessage = typeof result.errmsg === 'string' && result.errmsg.trim() ? result.errmsg.slice(0, 512) : '微信登录失败';
    if (!openid || openid.length > 256 || (unionid !== null && unionid.length > 256)) throw new UnauthorizedException(errorMessage);

    const user = await this.database.query<{ id: string }>(
      `insert into users (wechat_openid, wechat_unionid) values ($1, $2)
       on conflict (wechat_openid) do update set wechat_unionid = coalesce(excluded.wechat_unionid, users.wechat_unionid), updated_at = now()
       returning id`,
      [openid, unionid || null],
    );
    const expiresIn = this.sessionTtlSeconds('JWT_ACCESS_TTL_SECONDS', 3600);
    const token = await this.jwt.signAsync({ sub: user.rows[0].id, role: 'user' }, { expiresIn });
    return { accessToken: token, userId: user.rows[0].id, expiresIn };
  }

  private async getWechatAccessToken() {
    if (this.wechatAccessToken && this.wechatAccessToken.expiresAt > Date.now() + 60_000) return this.wechatAccessToken.value;
    if (this.wechatAccessTokenPromise) return this.wechatAccessTokenPromise;
    const pending = (async () => {
      const appId = this.config.get<string>('WECHAT_MINI_APP_ID');
      const secret = this.config.get<string>('WECHAT_MINI_APP_SECRET');
      if (!appId || !secret) throw new ServiceUnavailableException('微信手机号服务配置未完成');
      const query = new URLSearchParams({ grant_type: 'client_credential', appid: appId, secret });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.upstreamTimeoutMs());
      try {
        const response = await fetch(`${this.config.get('WECHAT_OPEN_API_BASE_URL', 'https://api.weixin.qq.com')}/cgi-bin/token?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error('wechat_token_request_failed');
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('wechat_token_response_invalid');
        const tokenResult = result as { access_token?: unknown; expires_in?: unknown; errcode?: unknown };
        if (typeof tokenResult.access_token !== 'string' || !tokenResult.access_token
          || typeof tokenResult.expires_in !== 'number' || !Number.isSafeInteger(tokenResult.expires_in) || tokenResult.expires_in <= 60) {
          throw new Error('wechat_token_response_invalid');
        }
        this.wechatAccessToken = { value: tokenResult.access_token, expiresAt: Date.now() + (tokenResult.expires_in - 60) * 1000 };
        return tokenResult.access_token;
      } catch {
        throw new ServiceUnavailableException('微信手机号服务暂时不可用');
      } finally {
        clearTimeout(timeout);
      }
    })();
    this.wechatAccessTokenPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.wechatAccessTokenPromise === pending) this.wechatAccessTokenPromise = null;
    }
  }

  async wechatPhoneNumber(code: string) {
    const normalizedCode = code.trim();
    if (!normalizedCode || normalizedCode.length > 256) throw new BadRequestException('微信手机号授权凭证无效，请重新授权');
    const accessToken = await this.getWechatAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.upstreamTimeoutMs());
    let result: unknown;
    try {
      const response = await fetch(
        `${this.config.get('WECHAT_OPEN_API_BASE_URL', 'https://api.weixin.qq.com')}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: normalizedCode }), signal: controller.signal },
      );
      if (!response.ok) throw new Error('wechat_phone_request_failed');
      result = await response.json();
    } catch {
      throw new ServiceUnavailableException('微信手机号服务暂时不可用');
    } finally {
      clearTimeout(timeout);
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ServiceUnavailableException('微信手机号服务返回无效数据');
    const phoneResult = result as { errcode?: unknown; phone_info?: { phoneNumber?: unknown; purePhoneNumber?: unknown } };
    if (phoneResult.errcode !== 0) throw new BadRequestException('微信未完成手机号授权，请重新操作');
    const phoneNumber = typeof phoneResult.phone_info?.phoneNumber === 'string'
      ? phoneResult.phone_info.phoneNumber.trim()
      : typeof phoneResult.phone_info?.purePhoneNumber === 'string' ? phoneResult.phone_info.purePhoneNumber.trim() : '';
    if (!/^\+?\d{6,20}$/.test(phoneNumber)) throw new ServiceUnavailableException('微信手机号服务返回无效数据');
    return phoneNumber;
  }
}
