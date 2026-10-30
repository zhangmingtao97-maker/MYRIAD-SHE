import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database/database.service';
import { StorageService } from './storage/storage.service';
import { RedisService } from './cache/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private dependencyTimeoutMs() {
    const configured = Number(this.config.get('HEALTHCHECK_TIMEOUT_MS', 3000));
    return Number.isFinite(configured) && configured > 0
      ? Math.min(Math.max(Math.floor(configured), 100), 10_000)
      : 3000;
  }

  private withTimeout<T>(operation: Promise<T>, dependency: string) {
    const timeoutMs = this.dependencyTimeoutMs();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        reject(new Error(`${dependency}_healthcheck_timeout`));
      }, timeoutMs);
      operation.then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      }, (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async check() {
    const [database, objectStorage, redis] = await Promise.allSettled([
      this.withTimeout(this.database.query('select 1'), 'database'),
      this.withTimeout(this.storage.healthCheck(), 'object_storage'),
      this.withTimeout(this.redis.healthCheck(), 'redis'),
    ]);
    const dependencies = {
      database: database.status === 'fulfilled' ? 'ok' : 'error',
      objectStorage: objectStorage.status === 'fulfilled' ? 'ok' : 'error',
      redis: redis.status === 'fulfilled' ? 'ok' : 'error',
    } as const;
    const response = {
      status: database.status === 'fulfilled' && objectStorage.status === 'fulfilled' && redis.status === 'fulfilled' ? 'ok' : 'degraded',
      service: 'myriad-she-api',
      dependencies,
      timestamp: new Date().toISOString(),
    };
    if (response.status !== 'ok') throw new ServiceUnavailableException(response);
    return response;
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    const [database, objectStorage] = await Promise.allSettled([
      this.withTimeout(this.database.query('select 1'), 'database'),
      this.withTimeout(this.storage.healthCheck(), 'object_storage'),
    ]);
    const response = {
      status: database.status === 'fulfilled' && objectStorage.status === 'fulfilled' ? 'ok' : 'degraded',
      service: 'myriad-she-api',
      dependencies: {
        database: database.status === 'fulfilled' ? 'ok' : 'error',
        objectStorage: objectStorage.status === 'fulfilled' ? 'ok' : 'error',
      },
      timestamp: new Date().toISOString(),
    } as const;
    if (response.status !== 'ok') throw new ServiceUnavailableException(response);
    return response;
  }
}
