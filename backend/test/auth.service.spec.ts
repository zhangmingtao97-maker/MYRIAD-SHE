import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import type { AuditService } from '../src/admin/audit.service';
import type { DatabaseService } from '../src/database/database.service';
import { DataEncryptionService } from '../src/security/data-encryption.service';

function wechatAuth(jwt: JwtService, database: DatabaseService, audit: AuditService) {
  return new AuthService(
    new ConfigService({
      WECHAT_MINI_APP_ID: 'mini-app',
      WECHAT_MINI_APP_SECRET: 'mini-secret',
      WECHAT_OPEN_API_BASE_URL: 'https://wechat.invalid',
      WECHAT_PROFILE_TOKEN_TTL_SECONDS: '600',
      JWT_ACCESS_TTL_SECONDS: '3600',
    }),
    jwt,
    database,
    audit,
    undefined,
    new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'phone-login-unit-test-key-at-least-32-bytes' })),
  );
}

test('admin login uses the normalized username in the session subject', async () => {
  const payloads: object[] = [];
  const jwt = {
    signAsync: async (payload: object) => {
      payloads.push(payload);
      return 'admin-token';
    },
  } as unknown as JwtService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const auth = new AuthService(
    new ConfigService({ ADMIN_DEV_USERNAME: 'admin', ADMIN_DEV_PASSWORD: 'secret', ADMIN_SESSION_TTL_SECONDS: '3600' }),
    jwt,
    {} as DatabaseService,
    audit,
  );

  const result = await auth.adminLogin('  admin  ', 'secret', { ip: '127.0.0.1' });

  assert.deepEqual(result, { accessToken: 'admin-token', expiresIn: 3600 });
  assert.deepEqual(payloads, [{ sub: 'admin:admin', role: 'super_admin' }]);
});

test('admin session lifetime is capped when configuration is too large', async () => {
  const payloads: object[] = [];
  const jwt = {
    signAsync: async (payload: object) => {
      payloads.push(payload);
      return 'admin-token';
    },
  } as unknown as JwtService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const auth = new AuthService(
    new ConfigService({ ADMIN_DEV_USERNAME: 'admin', ADMIN_DEV_PASSWORD: 'secret', ADMIN_SESSION_TTL_SECONDS: '999999999' }),
    jwt,
    {} as DatabaseService,
    audit,
  );

  const result = await auth.adminLogin('admin', 'secret', { ip: '127.0.0.1' });

  assert.equal(result.expiresIn, 30 * 24 * 60 * 60);
  assert.deepEqual(payloads, [{ sub: 'admin:admin', role: 'super_admin' }]);
});

test('WeChat phone exchange caches the app token and uses the one-time user code', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body?: string }> = [];
  const mockFetch = async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    const payload = url.includes('/cgi-bin/token?')
      ? { access_token: 'server-only-token', expires_in: 7200 }
      : { errcode: 0, phone_info: { phoneNumber: '+8613800138000' } };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  try {
    const auth = new AuthService(
      new ConfigService({
        WECHAT_MINI_APP_ID: 'test-app',
        WECHAT_MINI_APP_SECRET: 'test-secret',
        WECHAT_OPEN_API_BASE_URL: 'https://wechat.invalid',
      }),
      {} as JwtService,
      {} as DatabaseService,
      {} as AuditService,
    );

    assert.equal(await auth.wechatPhoneNumber('first-code'), '+8613800138000');
    assert.equal(await auth.wechatPhoneNumber('second-code'), '+8613800138000');
    assert.equal(requests.filter((request) => request.url.includes('/cgi-bin/token?')).length, 1);
    assert.deepEqual(requests.filter((request) => request.body).map((request) => JSON.parse(request.body!)), [
      { code: 'first-code' },
      { code: 'second-code' },
    ]);
    assert.equal(requests.some((request) => request.url.includes('server-only-token')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a returning WeChat user receives a normal user session directly', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ openid: 'openid-1' }), { status: 200 })) as typeof fetch;
  const payloads: object[] = [];
  const jwt = {
    signAsync: async (payload: object) => {
      payloads.push(payload);
      return 'user-token';
    },
  } as unknown as JwtService;
  const database = {
    query: async () => ({
      rows: [{ id: '11111111-1111-4111-8111-111111111111', created: false, status: 'active', nickname: '已有昵称', avatarObjectKey: 'users/avatars/existing.png', profileCompletedAt: '2026-01-01T00:00:00.000Z', phoneVerifiedAt: '2026-01-01T00:00:00.000Z' }],
    }),
  } as unknown as DatabaseService;
  try {
    const result = await wechatAuth(jwt, database, { record: async () => undefined } as unknown as AuditService)
      .wechatLogin('returning-code');
    assert.deepEqual(result, {
      needProfile: false,
      accessToken: 'user-token',
      userId: '11111111-1111-4111-8111-111111111111',
      expiresIn: 3600,
    });
    assert.deepEqual(payloads, [{
      sub: '11111111-1111-4111-8111-111111111111', role: 'user', scope: 'user',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a new WeChat user receives only a short-lived profile completion challenge', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ openid: 'openid-1' }), { status: 200 })) as typeof fetch;
  const payloads: Array<Record<string, unknown>> = [];
  const tokenQueries: Array<{ sql: string; params: unknown[] }> = [];
  let currentUser = { id: '22222222-2222-4222-8222-222222222222', created: true, status: 'active', profileCompletedAt: null as string | null, nickname: null as string | null, avatarObjectKey: null as string | null, phoneVerifiedAt: null as string | null };
  const jwt = {
    signAsync: async (payload: Record<string, unknown>) => {
      payloads.push(payload);
      return 'profile-token';
    },
  } as unknown as JwtService;
  const database = {
    query: async () => ({
      rows: [currentUser],
    }),
    withTransaction: async (callback: (client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<void>) => callback({
      query: async (sql: string, params: unknown[]) => {
        tokenQueries.push({ sql, params });
        return { rows: [] };
      },
    }),
  } as unknown as DatabaseService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  try {
    const result = await wechatAuth(jwt, database, audit).wechatLogin('new-code');
    assert.deepEqual(result, { needProfile: true, profileToken: 'profile-token', expiresIn: 600 });
    assert.equal(payloads[0]?.scope, 'profile:complete');
    assert.equal(typeof payloads[0]?.jti, 'string');
    assert.equal(tokenQueries.length, 2);
    assert.match(tokenQueries[0]!.sql, /consumed_at/);
    assert.match(tokenQueries[1]!.sql, /insert into wechat_profile_tokens/);
    assert.deepEqual(tokenQueries[1]!.params.slice(1), ['22222222-2222-4222-8222-222222222222', 600]);
    for (const fields of [
      { nickname: '微信用户2222', avatarObjectKey: null },
      { nickname: '已选昵称', avatarObjectKey: null },
      { nickname: null, avatarObjectKey: 'users/avatars/existing.png' },
    ]) {
      currentUser = { ...currentUser, created: false, profileCompletedAt: '2026-01-01T00:00:00Z', ...fields };
      const incomplete = await wechatAuth(jwt, database, audit).wechatLogin('another-one-time-code');
      assert.equal(incomplete.needProfile, true, 'profile details cannot replace verified phone consent');
      assert.equal('accessToken' in incomplete, false);
    }
    currentUser = { ...currentUser, nickname: null, avatarObjectKey: null, phoneVerifiedAt: '2026-11-13T00:00:00Z' };
    const phoneOnly = await wechatAuth(jwt, database, audit).wechatLogin('returning-phone-user');
    assert.equal(phoneOnly.needProfile, false, 'verified phone user needs no nickname or avatar');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('phone authorization completes login without nickname or avatar and cannot be replayed', async () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  let active = true;
  let avatar: string | null = null;
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const database = {
    query: async () => ({ rows: active ? [{ avatarObjectKey: avatar }] : [] }),
    withTransaction: async (callback: (client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<void>) => callback({
      query: async (sql: string, params: unknown[]) => {
        updates.push({ sql, params });
        if (/from wechat_profile_tokens/.test(sql)) {
          return { rows: active ? [{ avatarObjectKey: avatar }] : [] };
        }
        if (/from users/.test(sql)) return { rows: [{ avatarObjectKey: null, status: 'active' }] };
        if (/update users/.test(sql)) return { rows: [{ id: userId }] };
        if (/update wechat_profile_tokens/.test(sql)) { active = false; return { rows: [] }; }
        return { rows: [] };
      },
    }),
  } as unknown as DatabaseService;
  const jwt = {
    verifyAsync: async () => ({
      sub: userId,
      role: 'user',
      scope: 'profile:complete',
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
    signAsync: async () => 'user-token',
  } as unknown as JwtService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const auth = wechatAuth(jwt, database, audit);

  await assert.rejects(auth.completeWechatProfile('Bearer profile-token', {}), /请授权手机号/);
  await assert.rejects(auth.completeWechatProfile('Bearer profile-token', { nickname: '真实昵称' }), /请授权手机号/);
  await assert.rejects(auth.completeWechatProfile('Bearer profile-token', { nickname: '长'.repeat(33), phoneCode: 'phone-code' }), /昵称最多/);
  auth.wechatPhoneNumber = async (code: string) => { assert.equal(code, 'phone-code'); return '+8613800138000'; };
  const result = await auth.completeWechatProfile('Bearer profile-token', { phoneCode: 'phone-code' });
  assert.deepEqual(result, { needProfile: false, accessToken: 'user-token', userId, expiresIn: 3600 });
  const userUpdate = updates.find((query) => /update users/.test(query.sql));
  assert.equal(userUpdate?.params[0], null);
  assert.equal(userUpdate?.params[1], null);
  assert.ok(userUpdate?.params[2]);
  assert.equal(userUpdate?.params[3], '+8613800138000');
  assert.match(userUpdate!.sql, /nickname = coalesce/);
  await assert.rejects(auth.completeWechatProfile('Bearer profile-token', { phoneCode: 'phone-code' }), /资料补充已过期/);
});

test('wecom scan auto-provisions an unbound member as super admin', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const auditEvents: { action: string }[] = [];
  const payloads: object[] = [];
  const jwt = {
    signAsync: async (payload: object) => {
      payloads.push(payload);
      return 'wecom-token';
    },
  } as unknown as JwtService;
  const audit = {
    record: async (event: { action: string }) => {
      auditEvents.push(event);
    },
  } as unknown as AuditService;
  const database = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/insert into admin_accounts/.test(sql)) {
        return { rows: [{ id: 'acc-wecom-1', role: 'super_admin', passwordChangeRequired: false }] };
      }
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const auth = new AuthService(
    new ConfigService({
      ADMIN_WECOM_LOGIN_ENABLED: 'true',
      ADMIN_WECOM_CORP_ID: 'ww1234567890',
      ADMIN_WECOM_AGENT_ID: '100001',
      ADMIN_WECOM_APP_SECRET: 'secret',
      ADMIN_WECOM_REDIRECT_URI: 'https://www.myriadshe.com/admin/wecom/callback',
    }),
    jwt,
    database,
    audit,
  );
  const wecom = auth as unknown as {
    adminWecomRequest(path: string): Promise<Record<string, unknown>>;
  };
  wecom.adminWecomRequest = async (path: string) => {
    if (path === '/cgi-bin/gettoken') return { errcode: 0, access_token: 'token', expires_in: 7200 };
    if (path === '/cgi-bin/auth/getuserinfo') return { errcode: 0, userid: 'CaoYuChen' };
    if (path === '/cgi-bin/user/get') return { errcode: 0, name: '曹宇辰' };
    return { errcode: 0 };
  };

  const config = await auth.adminWecomConfig() as { state: string };
  const result = await auth.adminWecomLogin('scan-code', config.state);

  assert.deepEqual(result, { accessToken: 'wecom-token', expiresIn: 86400 });
  const insert = queries.find((query) => /insert into admin_accounts/.test(query.sql));
  assert.ok(insert, 'expected a provisioned admin account insert');
  assert.equal(insert.params[0], 'wecom_CaoYuChen');
  assert.equal(insert.params[1], '曹宇辰');
  assert.match(String(insert.params[2]), /^scrypt\$/);
  assert.equal(insert.params[3], 'CaoYuChen');
  assert.deepEqual(payloads, [{ sub: 'acc-wecom-1', role: 'super_admin', passwordChangeRequired: false }]);
  assert.deepEqual(auditEvents.map((event) => event.action), ['admin.auth.provisioned', 'admin.auth.login_succeeded']);
});

test('wecom scan still rejects unbound members when auto provisioning is disabled', async () => {
  const auditEvents: string[] = [];
  const database = { query: async () => ({ rows: [] }) } as unknown as DatabaseService;
  const auth = new AuthService(
    new ConfigService({
      ADMIN_WECOM_LOGIN_ENABLED: 'true',
      ADMIN_WECOM_CORP_ID: 'ww1234567890',
      ADMIN_WECOM_AGENT_ID: '100001',
      ADMIN_WECOM_APP_SECRET: 'secret',
      ADMIN_WECOM_REDIRECT_URI: 'https://www.myriadshe.com/admin/wecom/callback',
      ADMIN_WECOM_AUTO_PROVISION: 'off',
    }),
    { signAsync: async () => 'unused' } as unknown as JwtService,
    database,
    { record: async (event: { action: string }) => { auditEvents.push(event.action); } } as unknown as AuditService,
  );
  const wecom = auth as unknown as {
    adminWecomRequest(path: string): Promise<Record<string, unknown>>;
  };
  wecom.adminWecomRequest = async (path: string) => {
    if (path === '/cgi-bin/gettoken') return { errcode: 0, access_token: 'token', expires_in: 7200 };
    if (path === '/cgi-bin/auth/getuserinfo') return { errcode: 0, userid: 'CaoYuChen' };
    return { errcode: 0 };
  };

  const config = await auth.adminWecomConfig() as { state: string };
  await assert.rejects(auth.adminWecomLogin('scan-code', config.state), /未绑定管理后台/);
  assert.deepEqual(auditEvents, ['admin.auth.login_failed']);
});
