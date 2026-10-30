import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { HealthController } from '../src/health.controller';
import { RedisService } from '../src/cache/redis.service';
import { StorageService } from '../src/storage/storage.service';
import { ConfigService } from '@nestjs/config';

function controller(input: { database?: () => Promise<unknown>; storage?: () => Promise<unknown>; redis?: () => Promise<unknown> } = {}) {
  return new HealthController(
    { query: input.database ?? (async () => ({ rows: [{ '?column?': 1 }] })) } as unknown as DatabaseService,
    { healthCheck: input.storage ?? (async () => ({ status: 'ok' })) } as unknown as StorageService,
    { healthCheck: input.redis ?? (async () => ({ status: 'ok' })) } as unknown as RedisService,
    new ConfigService({ HEALTHCHECK_TIMEOUT_MS: 100 }),
  );
}

test('readiness succeeds when Redis is unavailable because it is an optional cache dependency', async () => {
  const health = controller({ redis: async () => { throw new Error('redis_unavailable'); } });

  const result = await health.ready();

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.dependencies, { database: 'ok', objectStorage: 'ok' });
});

test('full health reports Redis degradation separately', async () => {
  const health = controller({ redis: async () => { throw new Error('redis_unavailable'); } });

  await assert.rejects(health.check(), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailableException);
    const response = error.getResponse() as { status?: string; dependencies?: { redis?: string } };
    assert.equal(response.status, 'degraded');
    assert.equal(response.dependencies?.redis, 'error');
    return true;
  });
});

test('readiness returns a dependency error when a check does not finish in time', async () => {
  const health = controller({ database: () => new Promise(() => undefined) });

  await assert.rejects(health.ready(), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailableException);
    const response = error.getResponse() as { status?: string; dependencies?: { database?: string; objectStorage?: string } };
    assert.equal(response.status, 'degraded');
    assert.equal(response.dependencies?.database, 'error');
    assert.equal(response.dependencies?.objectStorage, 'ok');
    return true;
  });
});
