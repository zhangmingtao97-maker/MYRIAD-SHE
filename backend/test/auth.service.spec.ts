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
