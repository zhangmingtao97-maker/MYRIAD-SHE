import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import type { AuditService } from '../src/admin/audit.service';
import type { DatabaseService } from '../src/database/database.service';

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
