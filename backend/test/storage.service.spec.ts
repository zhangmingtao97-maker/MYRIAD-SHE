import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/storage/storage.service';

test('storage service closes both S3 clients during module shutdown', () => {
  const service = new StorageService(new ConfigService({
    MINIO_ENDPOINT: 'minio', MINIO_PORT: '9000', MINIO_PUBLIC_ENDPOINT: 'http://media.invalid:61025',
    MINIO_ACCESS_KEY: 'access', MINIO_SECRET_KEY: 'secret', MINIO_BUCKET: 'myriad-she',
  }));
  let destroyed = 0;
  const clients = service as unknown as { client: { destroy: () => void }; presignClient: { destroy: () => void } };
  clients.client = { destroy: () => { destroyed += 1; } };
  clients.presignClient = { destroy: () => { destroyed += 1; } };

  service.onModuleDestroy();

  assert.equal(destroyed, 2);
});

test('storage service rejects an invalid fallback endpoint port', () => {
  assert.throws(() => new StorageService(new ConfigService({
    MINIO_ENDPOINT: 'minio', MINIO_PORT: '70000', MINIO_PUBLIC_ENDPOINT: 'http://media.invalid:61025',
    MINIO_ACCESS_KEY: 'access', MINIO_SECRET_KEY: 'secret', MINIO_BUCKET: 'myriad-she',
  })), /MINIO_PORT must be an integer between 1 and 65535/);
});

test('storage service rejects an invalid explicit public endpoint port', () => {
  assert.throws(() => new StorageService(new ConfigService({
    MINIO_ENDPOINT: 'minio', MINIO_PORT: '9000', MINIO_PUBLIC_ENDPOINT: 'http://media.invalid:0',
    MINIO_ACCESS_KEY: 'access', MINIO_SECRET_KEY: 'secret', MINIO_BUCKET: 'myriad-she',
  })), /MINIO_PUBLIC_ENDPOINT port must be an integer between 1 and 65535/);
});
