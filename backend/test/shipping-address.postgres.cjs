// Opt in against the migrated LOCAL database. Fixtures and audit events are rolled back.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { ShippingAddressService } = require('../dist/user/shipping-address.service');
const { ShippingAddressController } = require('../dist/user/shipping-address.controller');
const { DataEncryptionService } = require('../dist/security/data-encryption.service');
const { DatabaseService } = require('../dist/database/database.service');
const { UserAuthGuard } = require('../dist/auth/user-auth.guard');
const { AuditService } = require('../dist/admin/audit.service');

test('address HTTP API preserves ownership, encryption, versions, defaults and legacy compatibility', {
  skip: process.env.RUN_ADDRESS_DB_TESTS !== '1',
}, async () => {
  const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
  });
  const client = await pool.connect();
  let application, savepoint = 0;
  const database = {
    query: (sql, values) => client.query(sql, values),
    withTransaction: async callback => {
      const name = `address_test_${++savepoint}`;
      await client.query(`savepoint ${name}`);
      try { const result = await callback(client); await client.query(`release savepoint ${name}`); return result; }
      catch (error) { await client.query(`rollback to savepoint ${name}`); await client.query(`release savepoint ${name}`); throw error; }
    },
  };
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: randomUUID() }));
  const service = new ShippingAddressService(database, encryption, new AuditService(database));
  const jwt = new JwtService({ secret: randomUUID() });
  const userId = randomUUID(), otherUser = randomUUID();
  const token = id => jwt.sign({ sub: id, role: 'user', scope: 'user' }, { expiresIn: '10m' });
  const address = { userName: '地址回归测试', telNumber: '13800138000', provinceName: '浙江省', cityName: '杭州市', countyName: '西湖区', detailInfo: '测试路 1 号', postalCode: '', nationalCode: '' };
  try {
    await client.query('begin');
    await client.query("set local statement_timeout = '10s'");
    for (const id of [userId, otherUser]) await client.query('insert into users(id, wechat_openid) values ($1, $2)', [id, `address-test-${id}`]);
    class TestModule {}
    Module({ controllers: [ShippingAddressController], providers: [
      { provide: ShippingAddressService, useValue: service },
      { provide: DatabaseService, useValue: database },
      { provide: JwtService, useValue: jwt },
      UserAuthGuard,
    ] })(TestModule);
    application = await NestFactory.create(TestModule, { logger: false });
    application.setGlobalPrefix('api');
    application.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await application.listen(0, '127.0.0.1');
    const base = await application.getUrl();
    const call = async (path = '', method = 'GET', data, identity = userId, status = 200) => {
      const response = await fetch(`${base}/api/me/addresses${path}`, { method, headers: {
        Authorization: `Bearer ${token(identity)}`, 'Content-Type': 'application/json',
      }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
      if (status < 300) assert.equal(response.headers.get('cache-control'), 'no-store');
      return body;
    };
    let book = await call(); assert.deepEqual(book, { items: [], version: 0, limit: 10 });
    await call('', 'POST', { version: 0, address, isDefault: true, injected: 'bad' }, userId, 400);
    await call('', 'POST', { version: 0, address: { ...address, userId: otherUser }, isDefault: true }, userId, 400);
    await call('', 'POST', { version: 0, address: { ...address, telNumber: 'bad' }, isDefault: true }, userId, 400);
    await call('', 'POST', { version: 0, address: { ...address, telNumber: '+++++' }, isDefault: true }, userId, 400);
    await call('', 'POST', { address, isDefault: true }, userId, 400);
    book = await call('', 'POST', { version: 0, address, isDefault: false }, userId, 201);
    const first = book.savedId; assert.equal(book.items[0].isDefault, true);
    book = await call('', 'POST', { version: book.version, address: { ...address, detailInfo: '测试路 2 号' }, isDefault: false }, userId, 201);
    const second = book.savedId; assert.equal(book.items.filter(item => item.isDefault).length, 1);
    await call(`/${first}`, 'PATCH', { version: 0, address, isDefault: true }, userId, 409);
    await call(`/${first}`, 'PATCH', { version: 0, address, isDefault: true }, otherUser, 404);
    assert.equal((await call('', 'GET', undefined, otherUser)).items.length, 0);
    await call('/not-a-uuid', 'DELETE', { version: book.version }, userId, 400);
    book = await call(`/${second}/default`, 'PATCH', { version: book.version });
    assert.equal(book.items.find(item => item.id === second).isDefault, true);
    const encryptedRows = (await client.query('select address_encrypted from user_shipping_addresses where user_id = $1', [userId])).rows;
    assert.equal(encryptedRows.length, 2);
    assert.equal(JSON.stringify(encryptedRows).includes(address.telNumber), false);
    assert.equal(JSON.stringify(encryptedRows).includes(address.userName), false);
    let legacy = (await client.query('select shipping_address_encrypted from users where id = $1', [userId])).rows[0].shipping_address_encrypted;
    assert.equal(encryption.decryptJson(legacy, 'user.address').detailInfo, '测试路 2 号');
    await service.replaceLegacy(userId, { ...address, detailInfo: '旧版客户端更新' });
    book = await call(); assert.equal(book.items.length, 2);
    assert.equal(book.items.find(item => item.id === second).detailInfo, '旧版客户端更新');
    book = await call(`/${second}`, 'DELETE', { version: book.version });
    assert.equal(book.items[0].id, first); assert.equal(book.items[0].isDefault, true);
    for (let n = book.items.length; n < 10; n++) book = await call('', 'POST', { version: book.version, address, isDefault: false }, userId, 201);
    await call('', 'POST', { version: book.version, address, isDefault: false }, userId, 400);
    assert.equal((await call()).version, book.version);
    for (const item of [...book.items]) book = await call(`/${item.id}`, 'DELETE', { version: book.version });
    assert.equal(book.items.length, 0);
    legacy = (await client.query('select shipping_address_encrypted from users where id = $1', [userId])).rows[0].shipping_address_encrypted;
    assert.equal(legacy, null);
    const audit = (await client.query('select metadata from audit_logs where actor_id = $1', [userId])).rows;
    assert.ok(audit.length > 0); assert.equal(JSON.stringify(audit).includes(address.telNumber), false);
    book = await call('', 'POST', { version: book.version, address, isDefault: true }, userId, 201);
    await client.query('delete from users where id = $1', [userId]);
    assert.equal((await client.query('select count(*)::int as count from user_shipping_addresses where user_id = $1', [userId])).rows[0].count, 0);
    await call('', 'GET', undefined, userId, 401);
  } finally {
    if (application) await application.close();
    await client.query('rollback'); client.release(); await pool.end();
  }
});
