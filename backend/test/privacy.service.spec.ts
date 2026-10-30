import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AuditService } from '../src/admin/audit.service';
import { DatabaseService } from '../src/database/database.service';
import { PrivacyService } from '../src/privacy/privacy.service';
import { DataEncryptionService } from '../src/security/data-encryption.service';
import { UserController } from '../src/user/user.controller';

function failedDeletionHarness(attemptCount: number, maxAttempts: number) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const auditActions: string[] = [];
  let transactionCount = 0;
  const database = {
    withTransaction: async <T>(callback: (client: PoolClient) => Promise<T>) => {
      transactionCount += 1;
      const client = {
        query: async (sql: string, values: unknown[] = []) => {
          statements.push({ sql, values });
          if (sql.includes('from privacy_requests') && sql.includes('where id = $1')) {
            return { rows: [{ id: 'request:test', user_id: 'user:test', status: 'pending', attempt_count: attemptCount, due: true }] };
          }
          if (sql.includes('from users where id = $1 for update')) return { rows: [{ id: 'user:test' }] };
          if (transactionCount === 1 && sql.includes('delete from observations')) throw new Error('database_unavailable');
          if (sql.includes('attempt_count = attempt_count + 1')) {
            const nextAttemptCount = attemptCount + 1;
            return { rows: [{ attemptCount: nextAttemptCount, status: nextAttemptCount >= maxAttempts ? 'failed' : 'pending' }] };
          }
          return { rows: [] };
        },
      } as unknown as PoolClient;
      return callback(client);
    },
  } as unknown as DatabaseService;
  const audit = {
    record: async (entry: { action: string }) => { auditActions.push(entry.action); },
  } as unknown as AuditService;
  const config = new ConfigService({ ACCOUNT_DELETION_MAX_ATTEMPTS: String(maxAttempts) });
  return { service: new PrivacyService(database, audit, config), statements, auditActions };
}

test('account deletion anonymizes audit rows after deleting the user', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('from privacy_requests') && sql.includes('where id = $1')) {
        return { rows: [{ id: 'request:test', user_id: 'user:test', status: 'pending', attempt_count: 0, due: true }] };
      }
      if (sql.includes('from users where id = $1 for update')) return { rows: [{ id: 'user:test' }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const service = new PrivacyService(database, {} as AuditService, new ConfigService({}));

  const result = await service.processById('request:test');

  assert.deepEqual(result, { outcome: 'completed', processed: true });
  const deleteUserIndex = statements.findIndex((sql) => sql.includes('delete from users'));
  const lockUserIndex = statements.findIndex((sql) => sql.includes('from users where id = $1 for update'));
  const deleteObservationsIndex = statements.findIndex((sql) => sql.includes('delete from observations'));
  const anonymizeAuditIndex = statements.findIndex((sql) => sql.includes('update audit_logs set actor_id = null'));
  assert.ok(lockUserIndex >= 0);
  assert.ok(deleteObservationsIndex > lockUserIndex);
  const lockObservationsIndex = statements.findIndex((sql) => sql.includes('from observations where user_id = $1 for update'));
  const lockRequestIndex = statements.findIndex((sql) => sql.includes('from privacy_requests where id = $1 for update'));
  assert.ok(lockObservationsIndex > lockUserIndex);
  assert.ok(lockRequestIndex > lockObservationsIndex);
  assert.ok(deleteObservationsIndex > lockRequestIndex);
  assert.ok(deleteUserIndex >= 0);
  assert.ok(anonymizeAuditIndex > deleteUserIndex);
});

test('data export holds the account lock while recording its audit event', async () => {
  const statements: string[] = [];
  const events: string[] = [];
  let inTransaction = false;
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('from users')) {
        return { rows: [{ settings: {}, createdAt: '2026-01-01T00:00:00.000Z' }] };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => {
      inTransaction = true;
      try { return await callback(client); }
      finally { inTransaction = false; }
    },
  } as unknown as DatabaseService;
  const audit = {
    record: async () => {
      assert.equal(inTransaction, true);
      events.push('audit:recorded');
    },
  } as unknown as AuditService;
  const controller = new UserController(database, audit, new ConfigService({}), {} as DataEncryptionService);

  await controller.exportData({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });

  assert.match(statements[0], /set transaction isolation level repeatable read/i);
  assert.ok(statements.some((statement) => /from users where id = \$1 for share/i.test(statement)));
  assert.ok(statements.some((statement) => /from observations where user_id = \$1[\s\S]*for share/i.test(statement)));
  assert.ok(statements.some((statement) => /from discussion_contributions where user_id = \$1[\s\S]*for share/i.test(statement)));
  assert.ok(statements.some((statement) => /from privacy_requests where user_id = \$1 order by requested_at desc, id desc limit 1/i.test(statement)));
  assert.deepEqual(events, ['audit:recorded']);
});

test('data export decrypts the user-owned discussion experiences', async () => {
  const client = {
    query: async (sql: string) => {
      if (sql.includes('from users')) return { rows: [{ settings: {}, createdAt: '2026-01-01T00:00:00.000Z' }] };
      if (sql.includes('from discussion_contributions')) return { rows: [{
        id: 'contribution:test', issueCode: 'issue-02', issueLabel: 'ISSUE 02', threadId: '', threadAuthor: null,
        body: { encrypted: true }, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = { withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client) } as unknown as DatabaseService;
  const encryption = { decryptJson: () => ({ body: '一段私人经历' }) } as unknown as DataEncryptionService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const controller = new UserController(database, audit, new ConfigService({}), encryption);

  const result = await controller.exportData({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });

  assert.equal(result.discussionContributions[0]?.body, '一段私人经历');
  assert.equal(result.discussionContributions[0]?.status, 'pending');
});

test('data export strips unknown answer fields and rejects oversized known fields', async () => {
  let answer: Record<string, unknown> = { situation: '处境', ignored: '不应导出' };
  const client = {
    query: async (sql: string) => {
      if (sql.includes('from users')) return { rows: [{ settings: { notificationsEnabled: true, legacyField: '不应导出' }, createdAt: '2026-01-01T00:00:00.000Z' }] };
      if (sql.includes('from observations')) return { rows: [{
        id: 'observation:test', method: 'reality', status: 'draft', issueCode: null, issueLabel: null, issueQuestion: null,
        answers: answer, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = { withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client) } as unknown as DatabaseService;
  const encryption = { decryptJson: (value: unknown) => value } as unknown as DataEncryptionService;
  const exportAudit = { record: async () => undefined } as unknown as AuditService;
  const controller = new UserController(database, exportAudit, new ConfigService({}), encryption);
  const exported = await controller.exportData({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });
  assert.deepEqual(exported.settings, { notificationsEnabled: true, analyticsEnabled: false, preferences: {} });
  assert.deepEqual(exported.observations[0]?.answers, { situation: '处境' });

  answer = { situation: 'x'.repeat(1001) };
  await assert.rejects(
    controller.exportData({ user: { sub: 'user:test' } } as Request & { user: { sub: string } }),
    /观察数据暂时无法导出/,
  );

  answer = { birthDate: 'x'.repeat(5000), experience: '仍可导出的内容' };
  const seasonClient = {
    query: async (sql: string) => {
      if (sql.includes('from users')) return { rows: [{ settings: {}, createdAt: '2026-01-01T00:00:00.000Z' }] };
      if (sql.includes('from observations')) return { rows: [{
        id: 'observation:season', method: 'season', status: 'draft', issueCode: null, issueLabel: null, issueQuestion: null,
        answers: answer, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const seasonDatabase = { withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(seasonClient) } as unknown as DatabaseService;
  const seasonController = new UserController(seasonDatabase, exportAudit, new ConfigService({}), encryption);
  const seasonExport = await seasonController.exportData({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });
  assert.deepEqual(seasonExport.observations[0]?.answers, { experience: '仍可导出的内容' });
});

test('data encryption rejects oversized plaintext and encoded payloads before processing', () => {
  const encryption = new DataEncryptionService(new ConfigService({
    DATA_ENCRYPTION_KEY: 'unit-test-observation-encryption-secret-32-bytes',
  }));
  assert.throws(
    () => encryption.encryptJson({ answer: 'x'.repeat(70_000) }),
    /加密数据明文载荷过大/,
  );
  const oversized = { _encrypted: true, v: 2 as const, data: 'A'.repeat(256 * 1024 + 1) };
  assert.equal(encryption.reencryptionState(oversized), 'invalid');
  assert.throws(() => encryption.decryptJson(oversized), /加密数据载荷过大/);
});

test('privacy settings default to opt-out when stored values are missing', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      return sql.includes('from users') ? { rows: [{ settings: { preferences: { display: 'compact' } } }] } : { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const controller = new UserController(database, {} as AuditService, new ConfigService({}), {} as DataEncryptionService);

  const settings = await controller.settings({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });

  assert.match(statements[0], /from users where id = \$1 for share/i);
  assert.deepEqual(settings, {
    notificationsEnabled: false,
    analyticsEnabled: false,
    preferences: { display: 'compact' },
  });
});

test('privacy settings normalize a corrupt non-object root without exposing it', async () => {
  const client = {
    query: async () => ({ rows: [{ settings: ['unexpected'], createdAt: '2026-01-01T00:00:00.000Z' }] }),
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const controller = new UserController(database, {} as AuditService, new ConfigService({}), {} as DataEncryptionService);

  const settings = await controller.settings({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });

  assert.deepEqual(settings, { notificationsEnabled: false, analyticsEnabled: false, preferences: {} });
});

test('privacy settings hide oversized stored preferences from the public contract', async () => {
  const controller = new UserController(
    { withTransaction: async (callback: (client: PoolClient) => Promise<unknown>) => callback({ query: async () => ({ rows: [{ settings: { preferences: { note: 'x'.repeat(17 * 1024) } } }] }) } as unknown as PoolClient) } as unknown as DatabaseService,
    {} as AuditService,
    new ConfigService({}),
    {} as DataEncryptionService,
  );

  const settings = await controller.settings({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });

  assert.deepEqual(settings, { notificationsEnabled: false, analyticsEnabled: false, preferences: {} });
});

test('privacy settings return account_deleted when the locked account no longer exists', async () => {
  const client = { query: async () => ({ rows: [] }) } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const controller = new UserController(database, {} as AuditService, new ConfigService({}), {} as DataEncryptionService);

  await assert.rejects(
    controller.settings({ user: { sub: 'user:deleted' } } as Request & { user: { sub: string } }),
    (error: unknown) => {
      if (!error || typeof error !== 'object' || !('getResponse' in error)) return false;
      const response = (error as { getResponse: () => unknown }).getResponse();
      return Boolean(response && typeof response === 'object' && (response as { code?: unknown }).code === 'account_deleted');
    },
  );
});

test('privacy settings update locks the account before writing and auditing', async () => {
  const statements: string[] = [];
  const events: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('select id from users where id = $1 for update')) return { rows: [{ id: 'user:test' }] };
      if (sql.includes('update users set settings')) return { rows: [{ settings: { notificationsEnabled: true, legacyField: 'internal', preferences: { layout: 'compact' } } }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const audit = {
    record: async (_entry: unknown, transactionClient?: PoolClient) => {
      assert.equal(transactionClient, client);
      events.push('audit:recorded');
    },
  } as unknown as AuditService;
  const controller = new UserController(database, audit, new ConfigService({}), {} as DataEncryptionService);

  const settings = await controller.updateSettings(
    { user: { sub: 'user:test' } } as Request & { user: { sub: string } },
    { notificationsEnabled: true },
  );

  assert.deepEqual(settings, { notificationsEnabled: true, analyticsEnabled: false, preferences: { layout: 'compact' } });
  assert.ok(statements.findIndex((statement) => /select id from users where id = \$1 for update/i.test(statement)) < statements.findIndex((statement) => /update users set settings/i.test(statement)));
  assert.deepEqual(events, ['audit:recorded']);
});

test('deletion request endpoints lock the account before touching request state', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('from users where id = $1 for share')) return { rows: [{ id: 'user:test' }] };
      if (sql.includes('from users where id = $1 for update')) return { rows: [{ id: 'user:test' }] };
      if (sql.includes('insert into privacy_requests')) return { rows: [{ id: 'request:test', status: 'pending' }] };
      if (sql.includes('update privacy_requests')) return { rows: [{ id: 'request:test', status: 'cancelled' }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    query: async () => ({ rows: [] }),
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const controller = new UserController(database, audit, new ConfigService({}), {} as DataEncryptionService);

  await controller.deletionRequest({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });
  assert.match(statements[0], /from users where id = \$1 for share/i);
  statements.length = 0;
  await controller.requestDeletion({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });
  assert.match(statements[0], /from users where id = \$1 for share/i);
  statements.length = 0;
  await controller.cancelDeletion({ user: { sub: 'user:test' } } as Request & { user: { sub: string } });
  assert.match(statements[0], /from users where id = \$1 for update/i);
});

test('deletion failures schedule exponential retry without persisting the raw error', async () => {
  const { service, statements, auditActions } = failedDeletionHarness(2, 5);

  const result = await service.processById('request:test');

  assert.deepEqual(result, { outcome: 'retry_scheduled', processed: false, attemptCount: 3 });
  const retry = statements.find(({ sql }) => sql.includes('set next_attempt_at = now()'));
  assert.deepEqual(retry?.values, ['request:test', 120]);
  const retryState = statements.find(({ sql }) => sql.includes("last_error = 'processing_failed'"));
  assert.ok(retryState);
  assert.equal(retryState?.sql.includes('database_unavailable'), false);
  assert.deepEqual(auditActions, ['privacy.deletion.failed']);
});

test('overlapping deletion polls on one instance are coalesced', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let queryCount = 0;
  const database = {
    query: async () => {
      queryCount += 1;
      await gate;
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const service = new PrivacyService(database, {} as AuditService, new ConfigService({}));

  const first = service.processDue();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(await service.processDue(), { processed: 0 });
  release();

  assert.deepEqual(await first, { processed: 0 });
  assert.equal(queryCount, 1);
});

test('privacy worker shutdown waits for an in-flight deletion poll', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const database = {
    query: async () => {
      await gate;
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const service = new PrivacyService(database, {} as AuditService, new ConfigService({}));

  const poll = service.processDue();
  await new Promise<void>((resolve) => setImmediate(resolve));
  let shutdownFinished = false;
  const shutdown = service.onModuleDestroy().then(() => { shutdownFinished = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(shutdownFinished, false);

  release();
  await poll;
  await shutdown;
  assert.equal(shutdownFinished, true);
});

test('privacy worker does not start a new poll after shutdown begins', async () => {
  let queryCount = 0;
  const database = {
    query: async () => {
      queryCount += 1;
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const service = new PrivacyService(database, {} as AuditService, new ConfigService({}));

  await service.onModuleDestroy();

  assert.deepEqual(await service.processDue(), { processed: 0 });
  assert.equal(queryCount, 0);
});

test('deletion failures stop at the configured retry limit', async () => {
  const { service, auditActions } = failedDeletionHarness(4, 5);

  const result = await service.processById('request:test');

  assert.deepEqual(result, { outcome: 'failed', processed: false, attemptCount: 5 });
  assert.deepEqual(auditActions, ['privacy.deletion.failed']);
});

test('pending deletion requests without an account converge to anonymous completion', async () => {
  const statements: string[] = [];
  const auditActions: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('from privacy_requests') && sql.includes('where id = $1')) {
        return { rows: [{ id: 'request:orphan', user_id: null, status: 'pending', attempt_count: 0, due: true }] };
      }
      if (sql.includes("set status = 'completed'")) return { rows: [{ id: 'request:orphan' }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const audit = {
    record: async (entry: { action: string }) => { auditActions.push(entry.action); },
  } as unknown as AuditService;
  const service = new PrivacyService(database, audit, new ConfigService({}));

  const result = await service.processById('request:orphan');

  assert.deepEqual(result, { outcome: 'completed', processed: true });
  assert.equal(statements.some((sql) => sql.includes('delete from users')), false);
  assert.equal(statements.some((sql) => sql.includes('set status = \'completed\', user_id = null')), true);
  assert.deepEqual(auditActions, ['privacy.deletion.orphan_reconciled']);
});

test('deletion rechecks a request after locking the account and observations', async () => {
  const statements: string[] = [];
  let lockedRequest = false;
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('from privacy_requests') && sql.includes('where id = $1')) {
        if (sql.includes('for update')) {
          lockedRequest = true;
          return { rows: [{ id: 'request:cancelled', user_id: 'user:test', status: 'cancelled', attempt_count: 0, due: true }] };
        }
        return { rows: [{ id: 'request:cancelled', user_id: 'user:test', status: 'pending', attempt_count: 0, due: true }] };
      }
      if (sql.includes('from users where id = $1 for update')) return { rows: [{ id: 'user:test' }] };
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const service = new PrivacyService(database, {} as AuditService, new ConfigService({}));

  const result = await service.processById('request:cancelled');

  assert.deepEqual(result, { outcome: 'not_ready', processed: false });
  assert.equal(lockedRequest, true);
  assert.equal(statements.some((sql) => sql.includes('delete from observations')), false);
  assert.equal(statements.some((sql) => sql.includes('delete from users')), false);
});

test('manual deletion does not take an active processing lease', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('from privacy_requests') && sql.includes('where id = $1')) {
        return { rows: [{ id: 'request:leased', user_id: 'user:test', status: 'pending', attempt_count: 1, due: false }] };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const service = new PrivacyService(
    database,
    {} as AuditService,
    new ConfigService({ ACCOUNT_DELETION_PROCESSING_LEASE_SECONDS: '300' }),
  );

  const result = await service.processById('request:leased');

  assert.deepEqual(result, { outcome: 'not_ready', processed: false });
  assert.deepEqual(statements[0]?.values, ['request:leased', 300]);
  assert.match(statements[0]?.sql ?? '', /processing_started_at is null or processing_started_at <= now\(\) - make_interval\(secs => \$2\)/);
  assert.equal(statements.some(({ sql }) => sql.includes('delete from observations')), false);
});

test('manual deletion retry resets the failed request and records the admin action transactionally', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  let auditRecordedWithClient = false;
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('from privacy_requests') && sql.includes('for update')) {
        return { rows: [{ id: 'request:failed', status: 'failed', attemptCount: 7 }] };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const audit = {
    record: async (entry: { action: string }, transactionClient?: PoolClient) => {
      auditRecordedWithClient = Boolean(transactionClient);
      assert.equal(entry.action, 'privacy.deletion.retry_requested');
    },
  } as unknown as AuditService;
  const service = new PrivacyService(database, audit, new ConfigService({}));

  const retried = await service.retryFailedById('request:failed', { actorType: 'admin', actorId: 'admin:test' });

  assert.equal(retried, true);
  assert.equal(auditRecordedWithClient, true);
  const reset = statements.find(({ sql }) => sql.includes("set status = 'pending'"));
  assert.deepEqual(reset?.values, ['request:failed']);
});

test('disabled account deletion performs no database writes', async () => {
  const database = {
    query: async () => { throw new Error('database_should_not_be_called'); },
    withTransaction: async () => { throw new Error('database_should_not_be_called'); },
  } as unknown as DatabaseService;
  const service = new PrivacyService(database, {} as AuditService, new ConfigService({ ACCOUNT_DELETION_ENABLED: 'false' }));

  assert.deepEqual(await service.processDue(), { processed: 0 });
  assert.deepEqual(await service.processById('request:test'), { outcome: 'disabled', processed: false });
  assert.equal(await service.retryFailedById('request:test', { actorType: 'admin', actorId: 'admin:test' }), false);
});

test('phone updates persist encrypted account data and audit only the last four digits', async () => {
  const phoneNumber = '+8613800138000';
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-member-profile-encryption-key' }));
  const auditEntries: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  let storedPhone: unknown = null;
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('update users set phone_encrypted')) {
        storedPhone = JSON.parse(String(values[0])) as unknown;
        return { rows: [{ id: 'user:test' }] };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
    query: async () => ({ rows: [{ nickname: 'Mira', avatarObjectKey: null, phoneEncrypted: storedPhone }] }),
  } as unknown as DatabaseService;
  const audit = {
    record: async (entry: { action: string; metadata?: Record<string, unknown> }) => { auditEntries.push(entry); },
  } as unknown as AuditService;
  const auth = { wechatPhoneNumber: async (code: string) => {
    assert.equal(code, 'wechat-one-time-code');
    return phoneNumber;
  } };
  const controller = new UserController(database, audit, new ConfigService({}), encryption, auth as never);

  const profile = await controller.updatePhoneNumber(
    { user: { sub: 'user:test' } } as Request & { user: { sub: string } },
    { code: 'wechat-one-time-code' },
  );

  assert.deepEqual(profile, { nickname: 'Mira', avatarUrl: null, phoneNumber });
  assert.equal(encryption.decryptJson(storedPhone, 'user.phone'), phoneNumber);
  assert.equal(JSON.stringify(storedPhone).includes(phoneNumber), false);
  assert.equal(auditEntries[0]?.action, 'user.phone_number.updated');
  assert.deepEqual(auditEntries[0]?.metadata, { last4: '8000' });
  assert.equal(JSON.stringify(auditEntries).includes(phoneNumber), false);
});
