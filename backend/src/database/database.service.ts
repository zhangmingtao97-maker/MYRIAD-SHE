import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { parseIntegerConfig } from '../config/environment';

interface MigrationCandidate {
  name: string;
  version: number;
  path: string;
}

interface MigrationFile extends MigrationCandidate {
  checksum: string;
}

interface AppliedMigration {
  version: string;
  checksum: string;
  appliedAt: string;
}

const LEGACY_MIGRATION_CHECKSUMS: Readonly<Record<string, ReadonlySet<string>>> = {
  // The local development database was provisioned with this historical 030
  // migration before its source file was restored. Keep the ledger immutable;
  // the follow-up migration reapplies the current idempotent schema intent.
  '030_practice_directory_enable_toggle.sql': new Set([
    'c3c7c9ee7dd23a705c82514ae2e4a4d48cefbd5e2bd9bd2180caa27ad27f17be',
  ]),
  // This local development database also recorded the original 033 migration
  // name before the compatibility copy was restored under its current name.
  '033_practice_directory_constraints.sql': new Set([
    '1c2d817caa14a304f42a04192be61bd3a2d22e683462694014b76c3615e4618e',
  ]),
};

function isAcceptedLegacyChecksum(version: string, checksum: string) {
  return LEGACY_MIGRATION_CHECKSUMS[version]?.has(checksum) ?? false;
}

export function summarizeMigrationStatus(
  migrations: ReadonlyArray<Pick<MigrationFile, 'name' | 'checksum'>>,
  applied: ReadonlyArray<AppliedMigration>,
) {
  const available = new Map(migrations.map((migration) => [migration.name, migration]));
  const pending = migrations
    .filter((migration) => !applied.some((row) => row.version === migration.name))
    .map((migration) => migration.name);
  const missing = applied
    .filter((row) => !available.has(row.version) && !isAcceptedLegacyChecksum(row.version, row.checksum))
    .map((row) => row.version);
  const modified = applied
    .filter((row) => {
      const migration = available.get(row.version);
      return Boolean(migration && migration.checksum !== row.checksum && !isAcceptedLegacyChecksum(row.version, row.checksum));
    })
    .map((row) => row.version);
  return {
    consistent: pending.length === 0 && missing.length === 0 && modified.length === 0,
    availableCount: migrations.length,
    appliedCount: applied.length,
    pending,
    missing,
    modified,
    latestAvailable: migrations[migrations.length - 1]?.name ?? null,
    latestApplied: applied[applied.length - 1]
      ? { name: applied[applied.length - 1].version, appliedAt: applied[applied.length - 1].appliedAt }
      : null,
  };
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.get<string>('DATABASE_URL')?.trim();
    const connection = connectionString
      ? { connectionString }
      : {
        host: this.config.get<string>('DB_HOST', 'localhost'),
        port: parseIntegerConfig(this.config.get('DB_PORT'), 'DB_PORT', 5432, 1, 65_535),
        database: this.config.get<string>('POSTGRES_DB'),
        user: this.config.get<string>('POSTGRES_USER'),
        password: this.config.get<string>('POSTGRES_PASSWORD'),
      };
    const poolMax = parseIntegerConfig(this.config.get('DB_POOL_MAX'), 'DB_POOL_MAX', 10, 1, 100);
    const poolMin = parseIntegerConfig(this.config.get('DB_POOL_MIN'), 'DB_POOL_MIN', 2, 0, 100);
    if (poolMin > poolMax) throw new Error('DB_POOL_MIN must not exceed DB_POOL_MAX');
    const connectionTimeoutMs = parseIntegerConfig(this.config.get('DB_CONNECTION_TIMEOUT_MS'), 'DB_CONNECTION_TIMEOUT_MS', 5000, 100, 30_000);
    const idleTimeoutMs = parseIntegerConfig(this.config.get('DB_IDLE_TIMEOUT_MS'), 'DB_IDLE_TIMEOUT_MS', 10_000, 100, 10 * 60 * 1000);
    this.pool = new Pool({
      ...connection,
      max: poolMax,
      min: poolMin,
      connectionTimeoutMillis: connectionTimeoutMs,
      idleTimeoutMillis: idleTimeoutMs,
      ssl: this.config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }

  async onModuleInit() {
    await this.pool.query('select 1');
    await this.applyMigrations();
  }

  private async migrationFiles(): Promise<MigrationFile[]> {
    const directory = resolve(__dirname, '../../sql');
    const entries = await readdir(directory, { withFileTypes: true });
    const migrations = entries.flatMap((entry) => {
      const match = /^(\d+)_.*\.sql$/i.exec(entry.name);
      return entry.isFile() && match
        ? [{ name: entry.name, version: Number(match[1]), path: resolve(directory, entry.name) }]
        : [];
    }).sort((left, right) => left.version - right.version || left.name.localeCompare(right.name));
    if (!migrations.length) throw new Error(`No SQL migrations found in ${directory}`);
    if (new Set(migrations.map((migration) => migration.version)).size !== migrations.length) {
      throw new Error('Database migration versions must be unique');
    }
    return Promise.all(migrations.map(async (migration) => ({
      ...migration,
      checksum: createHash('sha256').update(await readFile(migration.path, 'utf8')).digest('hex'),
    })));
  }

  private async applyMigrations() {
    const migrations = await this.migrationFiles();
    const appliedMigrations = await this.withTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, ['myriad-she-schema-migrations']);
      await client.query(
        `create table if not exists app_schema_migrations (
           version text primary key,
           checksum text not null,
           applied_at timestamptz not null default now()
         )`,
      );
      const result = await client.query<AppliedMigration>(`select version, checksum, applied_at as "appliedAt" from app_schema_migrations`);
      return result.rows;
    });
    const availableMigrations = new Set(migrations.map((migration) => migration.name));
    const missingMigrations = appliedMigrations.filter((row) => !availableMigrations.has(row.version) && !isAcceptedLegacyChecksum(row.version, row.checksum));
    if (missingMigrations.length) {
      throw new Error(`Applied database migration files are missing: ${missingMigrations.map((row) => row.version).join(', ')}`);
    }

    for (const migration of migrations) {
      const applied = await this.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext($1))`, ['myriad-she-schema-migrations']);
        const previous = await client.query<{ checksum: string }>(
          `select checksum from app_schema_migrations where version = $1`, [migration.name],
        );
        if (previous.rows[0]) {
          if (previous.rows[0].checksum !== migration.checksum) {
            if (!isAcceptedLegacyChecksum(migration.name, previous.rows[0].checksum)) {
              throw new Error(`Applied database migration was modified: ${migration.name}`);
            }
            this.logger.warn(`Using legacy checksum for applied database migration ${migration.name}`);
          }
          return false;
        }
        await client.query(await readFile(migration.path, 'utf8'));
        await client.query(
          `insert into app_schema_migrations (version, checksum) values ($1, $2)`,
          [migration.name, migration.checksum],
        );
        return true;
      });
      if (applied) this.logger.log(`Applied database migration ${migration.name}`);
    }
  }

  async migrationStatus() {
    const migrations = await this.migrationFiles();
    const result = await this.pool.query<AppliedMigration>(
      `select version, checksum, applied_at as "appliedAt"
       from app_schema_migrations order by applied_at asc, version asc`,
    );
    return summarizeMigrationStatus(migrations, result.rows);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    return this.pool.query<T>(text, values);
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      return await this.withClientTransaction(client, callback);
    } finally {
      client.release();
    }
  }

  async withClientTransaction<T>(client: PoolClient, callback: (client: PoolClient) => Promise<T>) {
    await client.query('begin');
    try {
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  async withSessionAdvisoryLock<T>(key: string, callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    let acquired = false;
    try {
      await client.query('select pg_advisory_lock(hashtext($1))', [key]);
      acquired = true;
      return await callback(client);
    } finally {
      let releaseError: Error | undefined = acquired ? undefined : new Error('Advisory lock acquisition was not confirmed');
      if (acquired) {
        try {
          await client.query('select pg_advisory_unlock(hashtext($1))', [key]);
        } catch (error) {
          releaseError = error instanceof Error ? error : new Error('Failed to release advisory lock');
        }
      }
      client.release(releaseError);
    }
  }
}
