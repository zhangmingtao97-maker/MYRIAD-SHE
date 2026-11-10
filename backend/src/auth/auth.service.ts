import { randomBytes } from 'crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { hashAdminPassword, verifyAdminPassword } from './admin-password';

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
  private readonly adminWecomStates = new Map<string, number>();
  private wechatAccessToken: { value: string; expiresAt: number } | null = null;
  private wechatAccessTokenPromise: Promise<string> | null = null;
  private wecomAccessToken: { value: string; expiresAt: number } | null = null;
  private wecomAccessTokenPromise: Promise<string> | null = null;

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

  private adminWecomSettings() {
    const enabledValue = String(this.config.get('ADMIN_WECOM_LOGIN_ENABLED', 'false')).trim().toLowerCase();
    const corpId = String(this.config.get('ADMIN_WECOM_CORP_ID', '') || '').trim();
    const agentId = String(this.config.get('ADMIN_WECOM_AGENT_ID', '') || '').trim();
    const secret = String(this.config.get('ADMIN_WECOM_APP_SECRET', '') || '').trim();
    const redirectUri = String(
      this.config.get('ADMIN_WECOM_REDIRECT_URI', '') || this.config.get('ADMIN_WECOM_CALLBACK_URL', '') || '',
    ).trim();
    let validRedirect = false;
    try {
      validRedirect = new URL(redirectUri).protocol === 'https:';
    } catch {
      validRedirect = false;
    }
    return {
      enabled: ['1', 'true', 'yes'].includes(enabledValue)
        && Boolean(corpId)
        && /^\d{1,20}$/.test(agentId)
        && Boolean(secret)
        && validRedirect,
      corpId,
      agentId,
      secret,
      redirectUri,
    };
  }

  private pruneAdminWecomStates(now = Date.now()) {
    for (const [state, expiresAt] of this.adminWecomStates) {
      if (expiresAt <= now) this.adminWecomStates.delete(state);
    }
    if (this.adminWecomStates.size <= 5_000) return;
    const oldest = [...this.adminWecomStates.entries()]
      .sort(([, left], [, right]) => left - right)
      .slice(0, this.adminWecomStates.size - 5_000);
    for (const [state] of oldest) this.adminWecomStates.delete(state);
  }

  private adminWecomTimeoutMs() {
    const configured = Number(this.config.get('ADMIN_WECOM_API_TIMEOUT_MS', 8_000));
    return Number.isInteger(configured) && configured >= 100 ? Math.min(configured, 30_000) : 8_000;
  }

  private async adminWecomRequest(path: string, query: Record<string, string>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.adminWecomTimeoutMs());
    try {
      const url = new URL(`${String(this.config.get('ADMIN_WECOM_API_BASE_URL', 'https://qyapi.weixin.qq.com')).replace(/\/+$/, '')}${path}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new ServiceUnavailableException('企业微信服务暂时不可用');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new ServiceUnavailableException('企业微信服务返回无效数据');
      }
      return result as Record<string, unknown>;
    } catch (caught) {
      if (caught instanceof HttpException) throw caught;
      throw new ServiceUnavailableException('企业微信服务暂时不可用');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAdminWecomAccessToken() {
    if (this.wecomAccessToken && this.wecomAccessToken.expiresAt > Date.now() + 60_000) return this.wecomAccessToken.value;
    if (this.wecomAccessTokenPromise) return this.wecomAccessTokenPromise;
    const pending = (async () => {
      const settings = this.adminWecomSettings();
      if (!settings.enabled) throw new ServiceUnavailableException('企业微信扫码登录未启用');
      const result = await this.adminWecomRequest('/cgi-bin/gettoken', {
        corpid: settings.corpId,
        corpsecret: settings.secret,
      });
      const errcode = Number(result.errcode ?? 0);
      const accessToken = typeof result.access_token === 'string' ? result.access_token : '';
      const expiresIn = Number(result.expires_in);
      if (errcode !== 0 || !accessToken
        || !Number.isSafeInteger(expiresIn) || expiresIn <= 60) {
        throw new ServiceUnavailableException('企业微信应用凭证配置无效');
      }
      this.wecomAccessToken = {
        value: accessToken,
        expiresAt: Date.now() + (expiresIn - 60) * 1000,
      };
      return accessToken;
    })();
    this.wecomAccessTokenPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.wecomAccessTokenPromise === pending) this.wecomAccessTokenPromise = null;
    }
  }

  private async getAdminWecomUserId(code: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accessToken = await this.getAdminWecomAccessToken();
      const result = await this.adminWecomRequest('/cgi-bin/auth/getuserinfo', {
        access_token: accessToken,
        code,
      });
      const errcode = Number(result.errcode ?? 0);
      if ([40001, 40014, 42001].includes(errcode) && attempt === 0) {
        this.wecomAccessToken = null;
        continue;
      }
      if (errcode !== 0) throw new UnauthorizedException('企业微信扫码凭证无效或已过期，请重新扫码');
      const rawUserId = typeof result.userid === 'string'
        ? result.userid
        : typeof result.UserId === 'string' ? result.UserId : '';
      const userId = rawUserId.trim();
      if (!userId) throw new UnauthorizedException('仅支持企业微信内部成员扫码登录');
      if (userId.length > 128 || /[\u0000-\u001f\u007f]/.test(userId)) {
        throw new UnauthorizedException('企业微信成员身份无效');
      }
      return userId;
    }
    throw new ServiceUnavailableException('企业微信服务暂时不可用');
  }

  private adminWecomAutoProvision() {
    const value = String(this.config.get('ADMIN_WECOM_AUTO_PROVISION', 'true')).trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(value);
  }

  /** 自动建号时尽量取企业微信里的姓名，取不到就退回 UserID。 */
  private async adminWecomDisplayName(accessToken: string, userId: string) {
    try {
      const result = await this.adminWecomRequest('/cgi-bin/user/get', { access_token: accessToken, userid: userId });
      if (Number(result.errcode ?? 0) !== 0) return '';
      const name = typeof result.name === 'string' ? result.name.trim() : '';
      return name.slice(0, 80);
    } catch {
      return '';
    }
  }

  /**
   * 扫码登录时自动创建后台账号：角色为超级管理员，密码是随机生成、谁都不知道的值，
   * 因此该账号只能通过企业微信扫码进入。能发起登录的人受企业微信应用「可见范围」约束。
   */
  private async provisionAdminFromWecom(userId: string, auditMetadata: Record<string, unknown>) {
    const accessToken = await this.getAdminWecomAccessToken();
    const displayName = (await this.adminWecomDisplayName(accessToken, userId)) || userId;
    const base = `wecom_${userId.replace(/[^A-Za-z0-9_.-]/g, '_')}`.slice(0, 56) || 'wecom_member';
    const passwordHash = await hashAdminPassword(randomBytes(32).toString('base64url'));
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const username = attempt === 0 ? base : `${base}_${randomBytes(2).toString('hex')}`;
      try {
        const inserted = await this.database.query<{ id: string; role: string; passwordChangeRequired: boolean }>(
          `insert into admin_accounts
             (username, display_name, password_hash, role, password_change_required, wecom_user_id)
           values ($1, $2, $3, 'super_admin', false, $4)
           returning id, role, password_change_required as "passwordChangeRequired"`,
          [username, displayName, passwordHash, userId],
        );
        const account = inserted.rows[0];
        try {
          await this.audit.record({
            actorType: 'system',
            action: 'admin.auth.provisioned',
            resourceType: 'admin_account',
            resourceId: account.id,
            metadata: { ...auditMetadata, username, displayName, role: 'super_admin' },
          });
        } catch {
          // 建号成功即应允许登录，审计失败不阻塞。
        }
        return account;
      } catch (caught) {
        lastError = caught;
        // 并发扫码或账号名冲突时，重新按企业微信绑定关系取已有账号。
        const existing = await this.database.query<{ id: string; role: string; passwordChangeRequired: boolean }>(
          `select id, role, password_change_required as "passwordChangeRequired"
           from admin_accounts
           where status = 'active' and (wecom_user_id = $1 or lower(username) = lower($2))
           order by case when wecom_user_id = $1 then 0 else 1 end, created_at
           limit 1`,
          [userId, username],
        ).catch(() => ({ rows: [] as { id: string; role: string; passwordChangeRequired: boolean }[] }));
        if (existing.rows[0]) return existing.rows[0];
      }
    }
    throw lastError instanceof HttpException
      ? lastError
      : new ServiceUnavailableException('企业微信账号自动创建失败，请稍后重试');
  }

  async adminWecomConfig() {
    const settings = this.adminWecomSettings();
    if (!settings.enabled) return { enabled: false };
    const now = Date.now();
    this.pruneAdminWecomStates(now);
    let state = '';
    do {
      state = randomBytes(24).toString('base64url');
    } while (this.adminWecomStates.has(state));
    const expiresIn = 300;
    this.adminWecomStates.set(state, now + expiresIn * 1000);
    const qrParams = new URLSearchParams({
      appid: settings.corpId,
      agentid: settings.agentId,
      redirect_uri: settings.redirectUri,
      state,
    });
    return {
      enabled: true,
      appid: settings.corpId,
      agentid: settings.agentId,
      redirectUri: settings.redirectUri,
      state,
      expiresIn,
      qrConnectUrl: `https://open.work.weixin.qq.com/wwopen/sso/qrConnect?${qrParams.toString()}`,
    };
  }

  async adminWecomLogin(code: string, state: string, source?: AdminLoginSource) {
    const normalizedCode = typeof code === 'string' ? code.trim() : '';
    const normalizedState = typeof state === 'string' ? state.trim() : '';
    if (!normalizedCode || normalizedCode.length > 256 || !normalizedState || normalizedState.length > 256) {
      throw new BadRequestException('企业微信扫码参数无效');
    }
    const settings = this.adminWecomSettings();
    if (!settings.enabled) throw new ServiceUnavailableException('企业微信扫码登录未启用');
    const stateExpiresAt = this.adminWecomStates.get(normalizedState);
    this.adminWecomStates.delete(normalizedState);
    if (!stateExpiresAt) throw new UnauthorizedException('扫码登录状态已失效，请重新扫码');
    if (stateExpiresAt <= Date.now()) throw new UnauthorizedException('扫码登录已过期，请重新扫码');

    const wecomUserId = await this.getAdminWecomUserId(normalizedCode);
    const auditMetadata: Record<string, unknown> = {
      method: 'wecom',
      wecomUserId: wecomUserId.slice(0, 128),
      ...(source?.ip ? { ip: source.ip.slice(0, 64) } : {}),
    };
    const staff = await this.database.query<{ id: string; role: string; passwordChangeRequired: boolean }>(
      `select id, role, password_change_required as "passwordChangeRequired"
       from admin_accounts
       where status = 'active' and (wecom_user_id = $1 or lower(username) = lower($1))
       order by case when wecom_user_id = $1 then 0 else 1 end, created_at
       limit 1`,
      [wecomUserId],
    );
    let staffAccount = staff.rows[0];
    const legacyUsername = String(this.config.get('ADMIN_DEV_USERNAME', '')).trim();
    const allowedUserIds = String(this.config.get('ADMIN_WECOM_SUPER_ADMIN_USER_IDS', ''))
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const isLegacyOwner = Boolean(legacyUsername)
      && legacyUsername.toLowerCase() === wecomUserId.toLowerCase();
    const isExplicitlyAllowed = allowedUserIds.includes(wecomUserId.toLowerCase());
    if (!staffAccount && !isLegacyOwner && !isExplicitlyAllowed && this.adminWecomAutoProvision()) {
      staffAccount = await this.provisionAdminFromWecom(wecomUserId, auditMetadata);
    }
    let loginId: string;
    let role: 'super_admin' | 'content_editor' | 'support_readonly';
    if (staffAccount) {
      if (!['super_admin', 'content_editor', 'support_readonly'].includes(staffAccount.role)) {
        throw new UnauthorizedException('企业微信成员权限无效');
      }
      loginId = staffAccount.id;
      role = staffAccount.role as 'super_admin' | 'content_editor' | 'support_readonly';
      await this.database.query(
        `update admin_accounts
         set last_login_at = now(), password_change_required = false, updated_at = now()
         where id = $1`,
        [staffAccount.id],
      );
    } else {
      if (!isLegacyOwner && !isExplicitlyAllowed) {
        await this.recordAdminLoginAudit('admin.auth.login_failed', wecomUserId, {
          ...auditMetadata,
          reason: 'wecom_unbound',
        });
        throw new UnauthorizedException(`该企业微信账号未绑定管理后台（UserID: ${wecomUserId.slice(0, 128)}），请联系超级管理员`);
      }
      loginId = `admin:wecom:${wecomUserId}`;
      role = 'super_admin';
    }

    const expiresIn = this.sessionTtlSeconds('ADMIN_SESSION_TTL_SECONDS', 86400);
    const token = await this.jwt.signAsync({ sub: loginId, role, passwordChangeRequired: false }, { expiresIn });
    await this.recordAdminLoginAudit('admin.auth.login_succeeded', wecomUserId, {
      ...auditMetadata,
      role,
      ...(staffAccount ? { accountId: staffAccount.id } : { legacy: true }),
    });
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

    const user = await this.database.query<{ id: string; created: boolean }>(
      `insert into users (wechat_openid, wechat_unionid) values ($1, $2)
       on conflict (wechat_openid) do update set wechat_unionid = coalesce(excluded.wechat_unionid, users.wechat_unionid), updated_at = now()
       returning id, (xmax = 0) as created`,
      [openid, unionid || null],
    );
    const currentUser = user.rows[0];
    if (!currentUser) throw new UnauthorizedException('微信登录服务返回无效数据');
    if (currentUser.created) {
      try {
        await this.audit.record({
          actorType: 'user',
          actorId: currentUser.id,
          action: 'user.created',
          resourceType: 'user',
          resourceId: currentUser.id,
        });
      } catch {
        // 新用户通知失败不能阻止正常登录。
      }
    }
    const expiresIn = this.sessionTtlSeconds('JWT_ACCESS_TTL_SECONDS', 3600);
    const token = await this.jwt.signAsync({ sub: currentUser.id, role: 'user' }, { expiresIn });
    return { accessToken: token, userId: currentUser.id, expiresIn };
  }

  async getWechatAccessToken(forceRefresh = false) {
    if (forceRefresh) {
      this.wechatAccessToken = null;
      if (this.wechatAccessTokenPromise) {
        await this.wechatAccessTokenPromise.catch(() => undefined);
        this.wechatAccessToken = null;
      }
    } else {
      if (this.wechatAccessToken && this.wechatAccessToken.expiresAt > Date.now() + 60_000) return this.wechatAccessToken.value;
      if (this.wechatAccessTokenPromise) return this.wechatAccessTokenPromise;
    }
    const pending = (async () => {
      const appId = this.config.get<string>('WECHAT_MINI_APP_ID');
      const secret = this.config.get<string>('WECHAT_MINI_APP_SECRET');
      if (!appId || !secret) throw new ServiceUnavailableException('微信服务配置未完成');
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
        throw new ServiceUnavailableException('微信服务暂时不可用');
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
