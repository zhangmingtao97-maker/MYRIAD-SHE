import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { DatabaseService, summarizeMigrationStatus } from '../src/database/database.service';

type PoolOptions = { port?: number; min?: number; max?: number; connectionTimeoutMillis?: number; idleTimeoutMillis?: number };

async function poolOptions(values: Record<string, unknown> = {}) {
  const service = new DatabaseService(new ConfigService(values));
  const options = (service as unknown as { pool: { options: PoolOptions } }).pool.options;
  await service.onModuleDestroy();
  return options;
}

test('database connection settings use bounded defaults and configured pool sizes', async () => {
  const options = await poolOptions({ DB_PORT: '61023', DB_POOL_MIN: '2', DB_POOL_MAX: '20', DB_CONNECTION_TIMEOUT_MS: '7000', DB_IDLE_TIMEOUT_MS: '15000' });

  assert.equal(options.port, 61023);
  assert.equal(options.min, 2);
  assert.equal(options.max, 20);
  assert.equal(options.connectionTimeoutMillis, 7000);
  assert.equal(options.idleTimeoutMillis, 15000);
});

test('database connection settings reject invalid numeric values', () => {
  assert.throws(() => new DatabaseService(new ConfigService({ DB_PORT: 'not-a-port' })), /DB_PORT must be an integer/);
  assert.throws(() => new DatabaseService(new ConfigService({ DB_POOL_MAX: '0' })), /DB_POOL_MAX must be an integer/);
  assert.throws(() => new DatabaseService(new ConfigService({ DB_POOL_MIN: '9', DB_POOL_MAX: '8' })), /DB_POOL_MIN must not exceed DB_POOL_MAX/);
  assert.throws(() => new DatabaseService(new ConfigService({ DB_CONNECTION_TIMEOUT_MS: '99' })), /DB_CONNECTION_TIMEOUT_MS must be an integer/);
});

test('migration status identifies pending, missing, and modified ledger entries', () => {
  const status = summarizeMigrationStatus(
    [
      { name: '001_init.sql', checksum: 'a' },
      { name: '002_content.sql', checksum: 'b' },
      { name: '003_privacy.sql', checksum: 'c' },
    ],
    [
      { version: '001_init.sql', checksum: 'a', appliedAt: '2026-10-16T00:00:00.000Z' },
      { version: '002_content.sql', checksum: 'changed', appliedAt: '2026-10-16T00:01:00.000Z' },
      { version: '000_legacy.sql', checksum: 'legacy', appliedAt: '2026-10-16T00:02:00.000Z' },
      { version: '033_practice_directory_constraints.sql', checksum: '1c2d817caa14a304f42a04192be61bd3a2d22e683462694014b76c3615e4618e', appliedAt: '2026-10-16T00:03:00.000Z' },
    ],
  );

  assert.equal(status.consistent, false);
  assert.deepEqual(status.pending, ['003_privacy.sql']);
  assert.deepEqual(status.missing, ['000_legacy.sql']);
  assert.deepEqual(status.modified, ['002_content.sql']);
  assert.equal(status.latestAvailable, '003_privacy.sql');
  assert.deepEqual(status.latestApplied, { name: '033_practice_directory_constraints.sql', appliedAt: '2026-10-16T00:03:00.000Z' });
});
