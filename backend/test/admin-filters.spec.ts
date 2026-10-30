import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PoolClient } from 'pg';
import { AuditService } from '../src/admin/audit.service';
import { AdminManagementController } from '../src/admin/admin-management.controller';
import { AdminAuditController } from '../src/admin/admin-audit.controller';
import { AdminObservationController } from '../src/admin/admin-observation.controller';
import { AdminPrivacyController } from '../src/admin/admin-privacy.controller';
import { DatabaseService } from '../src/database/database.service';
import { DataEncryptionService } from '../src/security/data-encryption.service';
import { PrivacyService } from '../src/privacy/privacy.service';
import { parseDatabaseCount } from '../src/pagination';

test('admin observation filters reject unknown status and stale values', async () => {
  const controller = new AdminObservationController(
    {} as DatabaseService,
    {} as DataEncryptionService,
    {} as AuditService,
    {} as ConfigService,
  );

  await assert.rejects(controller.list('deleted'), BadRequestException);
  await assert.rejects(controller.list(undefined, undefined, 'yes'), BadRequestException);
  await assert.rejects(controller.list(undefined, undefined, undefined, undefined, undefined, 'unknown'), BadRequestException);
});

test('member details mask phone numbers for support and audit super-admin disclosure', async () => {
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-member-profile-encryption-key' }));
  const phoneNumber = '+8613800138000';
  const auditActions: string[] = [];
  const member = {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    nickname: 'Mira',
    avatarObjectKey: null,
    phoneEncrypted: encryption.encryptJson(phoneNumber, 'user.phone'),
    phoneLast4: '8000',
    openId: 'openid-full-member-1234',
    maskedUnionId: null,
    observationCount: 0,
    privacyRequests: [],
  };
  const database = {
    withTransaction: async <T>(callback: (client: { query: () => Promise<{ rows: unknown[] }> }) => Promise<T>) => callback({
      query: async () => ({ rows: [member] }),
    }),
  } as unknown as DatabaseService;
  const audit = { record: async (entry: { action: string }) => { auditActions.push(entry.action); } } as unknown as AuditService;
  const controller = new AdminManagementController(database, audit, {} as JwtService, new ConfigService({}), undefined, encryption);

  const support = await controller.member(member.id, { user: { sub: 'admin:support', role: 'support_readonly' } } as never);
  assert.equal(support.phoneMasked, '***-****-8000');
  assert.equal(support.openId, member.openId);
  assert.equal('maskedOpenId' in support, false);
  assert.equal('phoneNumber' in support, false);
  assert.equal('phoneEncrypted' in support, false);

  const superAdmin = await controller.member(member.id, { user: { sub: 'admin:owner', role: 'super_admin' } } as never);
  assert.equal(superAdmin.phoneNumber, phoneNumber);
  assert.equal(superAdmin.openId, member.openId);
  assert.equal(auditActions.filter((action) => action === 'member.phone.viewed').length, 1);
});

test('member directory searches nickname, ID, and phone suffix while keeping support phone data masked', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    withTransaction: async <T>(callback: (client: PoolClient) => Promise<T>) => callback({
      query: async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes('count(*)::text as total')) return { rows: [{ total: '1' }] };
        if (sql.includes('count(o.id)')) return { rows: [{
          id: '00000000-0000-4000-8000-000000000001', status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          nickname: 'Mira', avatarObjectKey: null, phoneLast4: '8000', observationCount: 2,
        }] };
        return { rows: [] };
      },
    } as unknown as PoolClient),
  } as unknown as DatabaseService;
  const audit = { record: async () => undefined } as unknown as AuditService;
  const controller = new AdminManagementController(database, audit, {} as JwtService, new ConfigService({}));

  const result = await controller.members('50', '0', undefined, undefined, undefined, { user: { sub: 'admin:support', role: 'support_readonly' } } as never, 'Mira');

  const firstMember = result.items[0] as unknown as Record<string, unknown>;
  assert.equal(firstMember.nickname, 'Mira');
  assert.equal(firstMember.phoneMasked, '***-****-8000');
  assert.equal('phoneNumber' in firstMember, false);
  const memberQuery = statements.find(({ sql }) => sql.includes('count(o.id)'));
  assert.match(memberQuery?.sql ?? '', /position\(lower\(\$1\) in lower\(coalesce\(u\.nickname/);
  assert.match(memberQuery?.sql ?? '', /u\.phone_last4/);
  assert.doesNotMatch(memberQuery?.sql ?? '', /phone_encrypted/);
  assert.deepEqual(memberQuery?.values, ['Mira', 50, 0]);
});

test('super-admin member directory returns and audits full phone numbers', async () => {
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-member-profile-encryption-key' }));
  const phoneNumber = '+8613800138000';
  const statements: string[] = [];
  const auditActions: string[] = [];
  const member = {
    id: '00000000-0000-4000-8000-000000000001', status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    nickname: 'Mira', avatarObjectKey: null, phoneLast4: '8000',
    phoneEncrypted: encryption.encryptJson(phoneNumber, 'user.phone'), observationCount: 2,
  };
  const database = {
    withTransaction: async <T>(callback: (client: PoolClient) => Promise<T>) => callback({
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('count(*)::text as total')) return { rows: [{ total: '1' }] };
        if (sql.includes('count(o.id)')) return { rows: [member] };
        return { rows: [] };
      },
    } as unknown as PoolClient),
  } as unknown as DatabaseService;
  const audit = { record: async (entry: { action: string }) => { auditActions.push(entry.action); } } as unknown as AuditService;
  const controller = new AdminManagementController(database, audit, {} as JwtService, new ConfigService({}), undefined, encryption);

  const result = await controller.members('50', '0', undefined, undefined, undefined, { user: { sub: 'admin:owner', role: 'super_admin' } } as never);

  const firstMember = result.items[0] as unknown as Record<string, unknown>;
  assert.equal(firstMember.phoneNumber, phoneNumber);
  assert.equal('phoneMasked' in firstMember, false);
  assert.equal('phoneEncrypted' in firstMember, false);
  assert.equal(auditActions.filter((action) => action === 'member.phone.viewed').length, 1);
  assert.match(statements.find((sql) => sql.includes('count(o.id)')) ?? '', /u\.phone_encrypted/);
});

test('admin observation method filter is accepted and bound to the query', async () => {
  const values: unknown[] = [];
  const database = {
    query: async (sql: string, queryValues: unknown[] = []) => {
      values.push(...queryValues);
      return { rows: sql.includes('count(*)') ? [{ total: '0' }] : [] };
    },
    withTransaction: async (callback: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
      const client = {
        query: async (sql: string, queryValues: unknown[] = []) => {
          values.push(...queryValues);
          return { rows: sql.includes('count(*)') ? [{ total: '0' }] : [] };
        },
      };
      return callback(client);
    },
  } as unknown as DatabaseService;
  const controller = new AdminObservationController(
    database,
    {} as DataEncryptionService,
    {} as AuditService,
    new ConfigService({}),
  );

  const result = await controller.list(undefined, undefined, undefined, '10', '0', 'season');

  assert.equal(result.total, 0);
  assert.deepEqual(values, ['season', 10, 0, 'season']);
  assert.equal(values.length, 4);
});

test('admin observation issue filter rejects oversized values', async () => {
  const controller = new AdminObservationController(
    {} as DatabaseService,
    {} as DataEncryptionService,
    {} as AuditService,
    {} as ConfigService,
  );

  await assert.rejects(controller.list(undefined, 'x'.repeat(65)), BadRequestException);
});

test('admin privacy filters reject unknown request status', async () => {
  const controller = new AdminPrivacyController({} as DatabaseService, {} as PrivacyService, {} as AuditService);

  await assert.rejects(controller.list(undefined, undefined, 'processing'), BadRequestException);
});

test('admin privacy list returns lifecycle summary with safe database counts', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      if (sql.includes('count(*) filter')) {
        return { rows: [{ pendingCount: '4', duePendingCount: '1', leasedCount: '1', expiredLeaseCount: '2', failedCount: '3', completedCount: '4', cancelledCount: '5', oldestPendingAt: '2026-10-01T00:00:00.000Z', nextDueAt: '2026-10-02T00:00:00.000Z' }] };
      }
      if (sql.includes('count(*)::text as total')) return { rows: [{ total: '14' }] };
      return { rows: [] };
    },
    withTransaction: async (callback: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
      const client = {
        query: async (sql: string, values: unknown[] = []) => {
          statements.push({ sql, values });
          if (sql.includes('count(*) filter')) {
            return { rows: [{ pendingCount: '4', duePendingCount: '1', leasedCount: '1', expiredLeaseCount: '2', failedCount: '3', completedCount: '4', cancelledCount: '5', oldestPendingAt: '2026-10-01T00:00:00.000Z', nextDueAt: '2026-10-02T00:00:00.000Z' }] };
          }
          if (sql.includes('count(*)::text as total')) return { rows: [{ total: '14' }] };
          return { rows: [] };
        },
      };
      return callback(client);
    },
  } as unknown as DatabaseService;
  const privacy = { processingLeaseSeconds: () => 300 } as unknown as PrivacyService;
  const controller = new AdminPrivacyController(database, privacy, { record: async () => undefined } as unknown as AuditService);

  const result = await controller.list('50', '0', 'failed');

  assert.equal(result.total, 14);
  assert.deepEqual(result.summary, {
    pendingCount: 4,
    duePendingCount: 1,
    leasedCount: 1,
    expiredLeaseCount: 2,
    failedCount: 3,
    completedCount: 4,
    cancelledCount: 5,
    oldestPendingAt: '2026-10-01T00:00:00.000Z',
    nextDueAt: '2026-10-02T00:00:00.000Z',
  });
  const summaryQuery = statements.find(({ sql }) => sql.includes('count(*) filter'));
  assert.ok(summaryQuery);
  assert.deepEqual(summaryQuery.values, [300]);
  assert.ok(summaryQuery.sql.includes('greatest(scheduled_for, coalesce(next_attempt_at, scheduled_for))'));
  assert.ok(summaryQuery.sql.includes('processing_started_at + make_interval(secs => $1)'));
  assert.ok(statements.some(({ sql }) => sql.includes('set transaction isolation level repeatable read')));
});

test('admin audit list keeps page and total on one repeatable-read snapshot', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const database = {
    withTransaction: async (callback: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => callback({
      query: async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes('count(*)::text as total')) return { rows: [{ total: '1' }] };
        return { rows: [{ id: 'audit:test' }] };
      },
    }),
  } as unknown as DatabaseService;
  const service = new AuditService(database);

  const result = await service.list(20, 0, 'admin', 'content.issue.updated');

  assert.equal(result.total, 1);
  assert.equal(result.limit, 20);
  assert.equal(result.offset, 0);
  assert.equal(statements[0]?.sql, 'set transaction isolation level repeatable read');
  assert.deepEqual(statements[1]?.values, ['admin', 'content.issue.updated', 20, 0]);
  assert.deepEqual(statements[2]?.values, ['admin', 'content.issue.updated']);
});

test('admin audit filters reject unknown actor type', async () => {
  const controller = new AdminAuditController({} as AuditService);

  await assert.rejects(controller.list(undefined, undefined, 'operator'), BadRequestException);
});

test('admin audit filters reject oversized action values instead of truncating them', async () => {
  const controller = new AdminAuditController({} as AuditService);

  await assert.rejects(controller.list(undefined, undefined, undefined, 'x'.repeat(121)), BadRequestException);
});

test('admin observation, privacy, and audit lists reject malformed pagination', async () => {
  const observations = new AdminObservationController(
    {} as DatabaseService,
    {} as DataEncryptionService,
    {} as AuditService,
    {} as ConfigService,
  );
  const privacy = new AdminPrivacyController({} as DatabaseService, {} as PrivacyService, {} as AuditService);
  const audit = new AdminAuditController({} as AuditService);

  await assert.rejects(observations.list(undefined, undefined, undefined, 'many', '0'), BadRequestException);
  await assert.rejects(privacy.list('50', '-1'), BadRequestException);
  await assert.rejects(audit.list('1.5', '0'), BadRequestException);
});

test('database pagination counts reject invalid or unsafe values', () => {
  assert.equal(parseDatabaseCount('0'), 0);
  assert.equal(parseDatabaseCount('9007199254740991'), Number.MAX_SAFE_INTEGER);
  assert.throws(() => parseDatabaseCount('not-a-count'));
  assert.throws(() => parseDatabaseCount('9007199254740992'));
});
