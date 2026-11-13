// Run against a migrated PostgreSQL database with RUN_WECHAT_PROFILE_DB_TESTS=1.
// Every fixture and audit event is rolled back; no existing account is used.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { Pool } = require('pg');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { AuthService } = require(resolve('dist/auth/auth.service'));
const { AuditService } = require(resolve('dist/admin/audit.service'));
const { DataEncryptionService } = require(resolve('dist/security/data-encryption.service'));

test('WeChat onboarding uses the migrated token table for login, avatar upload, completion and replay rejection', {
  skip: process.env.RUN_WECHAT_PROFILE_DB_TESTS !== '1',
}, async () => {
  const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  });
  const client = await pool.connect();
  const originalFetch = globalThis.fetch;
  let savepoint = 0;
  let identity = '';
  const deletedObjects = [];
  const database = {
    query: (sql, values) => client.query(sql, values),
    withTransaction: async (callback) => {
      const name = `profile_test_${++savepoint}`;
      await client.query(`savepoint ${name}`);
      try {
        const result = await callback(client);
        await client.query(`release savepoint ${name}`);
        return result;
      } catch (error) {
        await client.query(`rollback to savepoint ${name}`);
        await client.query(`release savepoint ${name}`);
        throw error;
      }
    },
  };
  const jwt = new JwtService({ secret: randomUUID() });
  const storage = {
    saveUserAvatar: async (userId) => `users/avatars/${userId}/${randomUUID()}.png`,
    deleteObject: async (key) => { deletedObjects.push(key); },
  };
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: randomUUID() }));
  const auth = new AuthService(new ConfigService({
    WECHAT_MINI_APP_ID: 'postgres-test-app',
    WECHAT_MINI_APP_SECRET: 'postgres-test-secret',
    WECHAT_OPEN_API_BASE_URL: 'https://wechat.invalid',
  }), jwt, database, new AuditService(database), storage, encryption);
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'wechat.invalid');
    if (String(url).includes('/cgi-bin/token?')) return new Response(JSON.stringify({ access_token: 'fixture-app-token', expires_in: 7200 }));
    if (String(url).includes('/wxa/business/getuserphonenumber?')) {
      assert.equal(JSON.parse(options.body).code, 'fixture-phone-code');
      return new Response(JSON.stringify({ errcode: 0, phone_info: { phoneNumber: '+8613800138000' } }));
    }
    return new Response(JSON.stringify({ openid: identity }), { status: 200 });
  };
  try {
    await client.query('begin');
    await client.query("set local statement_timeout = '10s'");
    for (const mode of ['phone-only', 'existing-avatar', 'new-avatar']) {
      const upload = mode === 'new-avatar';
      identity = `profile-regression-${randomUUID()}`;
      const challenge = await auth.wechatLogin('fixture-code');
      assert.equal(challenge.needProfile, true);
      assert.equal(challenge.accessToken, undefined);
      const authorization = `Bearer ${challenge.profileToken}`;
      const userId = jwt.verify(challenge.profileToken).sub;
      await assert.rejects(auth.completeWechatProfile(authorization, {}), /请授权手机号/);
      await assert.rejects(auth.completeWechatProfile(authorization, { nickname: '无头像' }), /请授权手机号/);
      const oldAvatar = `users/avatars/${userId}/existing.png`;
      if (mode !== 'phone-only') await client.query('update users set avatar_object_key = $1 where id = $2', [oldAvatar, userId]);
      const originalNickname = (await client.query('select nickname from users where id = $1', [userId])).rows[0].nickname;
      let selectedAvatar = mode === 'phone-only' ? null : oldAvatar;
      if (upload) {
        const result = await auth.wechatProfileAvatar(authorization, {
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pAAAAABJRU5ErkJggg==', 'base64'),
          mimetype: 'image/png',
        });
        selectedAvatar = result.avatarObjectKey;
        const saved = await client.query('select avatar_object_key from wechat_profile_tokens where user_id = $1', [userId]);
        assert.equal(saved.rows[0].avatar_object_key, selectedAvatar);
      }
      const session = mode === 'phone-only'
        ? await auth.wechatLogin('fresh-login-code', 'fixture-phone-code')
        : await auth.completeWechatProfile(authorization, { ...(upload ? { nickname: '资料回归验证' } : {}), phoneCode: 'fixture-phone-code' });
      assert.equal(session.needProfile, false);
      assert.equal(jwt.verify(session.accessToken).scope, 'user');
      const user = (await client.query('select nickname, avatar_object_key, profile_completed_at from users where id = $1', [userId])).rows[0];
      assert.equal(user.nickname, upload ? '资料回归验证' : originalNickname);
      assert.equal(user.avatar_object_key, selectedAvatar);
      assert.ok(user.profile_completed_at);
      const phone = (await client.query('select phone_encrypted, phone_last4, phone_verified_at from users where id = $1', [userId])).rows[0];
      {
        assert.equal(encryption.decryptJson(phone.phone_encrypted, 'user.phone'), '+8613800138000');
        assert.equal(phone.phone_last4, '8000');
        assert.ok(phone.phone_verified_at);
        assert.equal(JSON.stringify(phone.phone_encrypted).includes('13800138000'), false);
      }
      assert.equal(deletedObjects.includes(oldAvatar), upload, 'preserved avatars must remain available');
      await assert.rejects(auth.completeWechatProfile(authorization, { phoneCode: 'fixture-phone-code' }), /资料补充已过期/);
      const returning = await auth.wechatLogin('fixture-code');
      assert.equal(returning.needProfile, false);
      assert.equal(returning.userId, userId);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await client.query('rollback');
    client.release();
    await pool.end();
  }
});
