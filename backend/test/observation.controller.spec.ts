import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AdminObservationController } from '../src/admin/admin-observation.controller';
import { AuditService } from '../src/admin/audit.service';
import { DatabaseService } from '../src/database/database.service';
import { ObservationController } from '../src/observation/observation.controller';
import { DataEncryptionService } from '../src/security/data-encryption.service';

const userId = '11111111-1111-4111-8111-111111111111';
const observationId = '22222222-2222-4222-8222-222222222222';
const request = { user: { sub: userId } } as Request & { user: { sub: string } };
const completeReality = { situation: '现实', body: '身体', need: '需要', nextAction: '一小步' };
const completeSeason = { birthDate: '1990-01-01', experience: '经验', season: '秋', sevenDayAction: '行动' };

interface TestRow {
  id: string;
  revision: number;
  method: 'reality' | 'season';
  status: 'draft' | 'saved' | 'deleted';
  issueCode: string | null;
  issueLabel: string | null;
  issueQuestion: string | null;
  clientDraftId: string | null;
  answers: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// In-process persistence double: no database connection, server, or Docker.
// Real answer encryption and the real AuditService are used by these tests.
function harness(input: { status?: TestRow['status']; method?: TestRow['method']; answers?: Record<string, string>; empty?: boolean; published?: boolean; userExists?: boolean } = {}) {
  const config = new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-observation-encryption-secret-32-bytes', SEASON_SAVE_BIRTH_DATE: 'false' });
  const encryption = new DataEncryptionService(config);
  const state = {
    row: input.empty ? null : {
      id: observationId, revision: 1, method: input.method ?? 'reality', status: input.status ?? 'draft',
      issueCode: 'issue-02', issueLabel: '原期刊标签', issueQuestion: '原本的问题', clientDraftId: 'draft-key',
      answers: encryption.encryptJson(input.answers ?? completeReality),
      createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    } as TestRow | null,
    ownerId: userId,
    published: input.published ?? true,
    statements: [] as string[],
    audits: [] as Array<{ action: string; metadata: unknown }>,
    writes: 0,
    issueReads: 0,
  };
  const query = async (sql: string, values: unknown[] = []) => {
    state.statements.push(sql);
    if (sql.includes('set transaction isolation level repeatable read')) return { rows: [] };
    if (sql.includes('select id from users where id = $1 for share') || sql.includes('select id from users where id = $1 for update')) {
      return { rows: input.userExists === false ? [] : [{ id: state.ownerId }] };
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('insert into audit_logs')) {
      state.audits.push({ action: String(values[2]), metadata: JSON.parse(String(values[5])) });
      return { rows: [] };
    }
    if (sql.includes('from content_issues')) {
      state.issueReads += 1;
      return { rows: state.published && values[0] === 'issue-02' ? [{ label: '最新期刊标签', question: '更新后的问题' }] : [] };
    }
    if (sql.includes('select count(*)::text as total from observations')) {
      return { rows: [{ total: state.row && state.row.status !== 'deleted' ? '1' : '0' }] };
    }
    if (sql.includes('from observations') && sql.includes('limit') && sql.includes('offset')) {
      return { rows: state.row && state.row.status !== 'deleted' ? [structuredClone(state.row)] : [] };
    }
    if (sql.includes('from observations o where o.id = $1')) {
      return { rows: state.row && values[0] === state.row.id && state.row.status !== 'deleted' ? [structuredClone(state.row)] : [] };
    }
    if (sql.includes('select') && sql.includes('from observations')) {
      const byClientId = sql.includes('client_draft_id = $2');
      const matches = state.row && (byClientId
        ? values[0] === state.ownerId && values[1] === state.row.clientDraftId
        : values[0] === state.row.id && values[1] === state.ownerId && state.row.status !== 'deleted');
      return { rows: matches ? [structuredClone(state.row)] : [] };
    }
    if (sql.includes('insert into observations')) {
      if (state.row) return { rows: [] };
      state.writes += 1;
      state.row = {
        id: observationId, revision: 1, method: values[1] as TestRow['method'], status: values[6] as TestRow['status'],
        issueCode: values[2] as string | null, issueLabel: values[3] as string | null,
        issueQuestion: values[4] as string | null, clientDraftId: values[5] as string | null,
        answers: JSON.parse(String(values[7])), createdAt: new Date('2026-10-03T00:00:00.000Z'), updatedAt: new Date('2026-10-03T00:00:00.000Z'),
      };
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('update observations')) {
      assert.ok(state.row);
      state.writes += 1;
      if (values[0]) state.row.status = values[0] as TestRow['status'];
      if (values[1]) state.row.answers = JSON.parse(String(values[1]));
      state.row.revision += 1;
      state.row.updatedAt = new Date('2026-10-04T00:00:00.000Z');
      return { rows: [structuredClone(state.row)] };
    }
    throw new Error(`Unexpected test query: ${sql}`);
  };
  const database = {
    query,
    withTransaction: async (callback: (client: PoolClient) => Promise<unknown>) => callback({ query } as unknown as PoolClient),
  } as unknown as DatabaseService;
  const controller = new ObservationController(database, new AuditService(database), config, encryption);
  const adminController = new AdminObservationController(database, encryption, new AuditService(database), config);
  return { controller, adminController, state, encryption };
}

test('admin observation lifecycle reports method totals without loading answer bodies', async () => {
  const statements: string[] = [];
  const database = {
    query: async (sql: string) => {
      statements.push(sql);
      return {
        rows: [{
          draftCount: '2', savedCount: '3', realityCount: '4', seasonCount: '1',
          wellFormedEnvelopeCount: '3', legacyPlaintextCount: '1', invalidEnvelopeCount: '1',
          staleDraftCount: '1', oldestDraftAt: '2026-10-01T00:00:00.000Z',
        }],
      };
    },
  } as unknown as DatabaseService;
  const controller = new AdminObservationController(
    database,
    {} as DataEncryptionService,
    {} as AuditService,
    new ConfigService({ OBSERVATION_DRAFT_RETENTION_DAYS: '90' }),
  );

  const result = await controller.lifecycle();
  assert.equal(result.realityCount, 4);
  assert.equal(result.seasonCount, 1);
  assert.equal(result.draftCount, 2);
  assert.equal(result.oldestDraftAt, '2026-10-01T00:00:00.000Z');
  assert.equal(statements.length, 1);
  assert.match(statements[0] ?? '', /count\(\*\) filter \(where method = 'reality'\)/);
  assert.doesNotMatch(statements[0] ?? '', /select\s+answers/i);
});

test('admin observation lifecycle keeps the 90-day read-only governance default', async () => {
  const values: unknown[][] = [];
  const database = {
    query: async (sql: string, queryValues: unknown[] = []) => {
      values.push(queryValues);
      return { rows: [{ draftCount: '0', savedCount: '0', realityCount: '0', seasonCount: '0', wellFormedEnvelopeCount: '0', legacyPlaintextCount: '0', invalidEnvelopeCount: '0', staleDraftCount: '0', oldestDraftAt: null }] };
    },
  } as unknown as DatabaseService;
  const controller = new AdminObservationController(
    database,
    {} as DataEncryptionService,
    {} as AuditService,
    new ConfigService({}),
  );

  const result = await controller.lifecycle();

  assert.equal(result.retentionDays, 90);
  assert.deepEqual(values, [[90]]);
});

test('create retry recovers original snapshot even after its issue is archived', async () => {
  const { controller, state } = harness({ published: false });
  const result = await controller.create(request, { method: 'reality', answers: { situation: '最新输入' }, issueCode: 'issue-02', clientDraftId: 'draft-key' });
  assert.equal(result.created, false);
  assert.equal(result.issueQuestion, '原本的问题');
  assert.equal(result.id, observationId);
  assert.equal(state.issueReads, 0);
  assert.equal(state.writes, 0);
  assert.equal(state.audits.length, 0);
  assert.ok(state.statements.some((statement) => statement.includes('pg_advisory_xact_lock')));
});

test('create normalizes issue and client draft identifiers before idempotent recovery', async () => {
  const { controller, state } = harness({ empty: true });
  const created = await controller.create(request, { method: 'reality', answers: { situation: '输入' }, issueCode: ' issue-02 ', clientDraftId: ' draft-key ' });

  assert.equal(created.created, true);
  assert.equal(state.row?.issueCode, 'issue-02');
  assert.equal(state.row?.clientDraftId, 'draft-key');

  state.published = false;
  const recovered = await controller.create(request, { method: 'reality', answers: { situation: '重试' }, issueCode: ' issue-02 ', clientDraftId: ' draft-key ' });
  assert.equal(recovered.created, false);
  assert.equal(state.writes, 1);
  assert.equal(state.issueReads, 1);
});

test('new drafts still require a published issue', async () => {
  const { controller, state } = harness({ empty: true, published: false });
  await assert.rejects(controller.create(request, { method: 'reality', answers: {}, issueCode: 'issue-02', clientDraftId: 'new-key' }), BadRequestException);
  assert.equal(state.writes, 0);
});

test('lost final create responses recover the already completed record without writes', async () => {
  const { controller, state } = harness({ status: 'saved', published: false });
  const result = await controller.create(request, { method: 'reality', answers: completeReality, issueCode: 'issue-02', clientDraftId: 'draft-key' });
  assert.equal(result.created, false);
  assert.equal(result.status, 'saved');
  assert.equal(state.issueReads, 0);
  assert.equal(state.writes, 0);
  assert.equal(state.audits.length, 0);
});

test('a key pointing at a deleted record cannot revive that record', async () => {
  const { controller, state } = harness({ status: 'deleted' });
  await assert.rejects(controller.create(request, { method: 'reality', answers: {}, issueCode: 'issue-02', clientDraftId: 'draft-key' }), ConflictException);
  assert.equal(state.writes, 0);
});

test('a client draft key cannot be reused for another method or issue', async () => {
  const { controller } = harness();
  await assert.rejects(controller.create(request, { method: 'season', answers: {}, issueCode: 'issue-02', clientDraftId: 'draft-key' }), ConflictException);
  await assert.rejects(controller.create(request, { method: 'reality', answers: {}, issueCode: 'issue-03', clientDraftId: 'draft-key' }), ConflictException);
});

test('new create, detail, and update responses contain the full record contract', async () => {
  const { controller } = harness({ empty: true });
  const created = await controller.create(request, { method: 'reality', answers: { situation: '输入' }, issueCode: 'issue-02', clientDraftId: 'draft-key' });
  assert.equal(created.created, true);
  const detail = await controller.detail(request, created.id);
  const updated = await controller.update(request, created.id, { revision: created.revision, status: 'draft', answers: completeReality });
  for (const result of [created, detail, updated]) {
    assert.ok(result);
    for (const field of ['id', 'method', 'status', 'issueCode', 'issueLabel', 'issueQuestion', 'clientDraftId', 'revision', 'answers', 'createdAt', 'updatedAt']) {
      assert.ok(Object.prototype.hasOwnProperty.call(result, field), `${field} must be returned`);
    }
    assert.equal(result.issueQuestion, '更新后的问题');
  }
});

test('user and admin lists retain the observation issue snapshot', async () => {
  const { controller, adminController, state } = harness();
  const userList = await controller.list(request, '30', '0');
  assert.equal(state.statements[0], 'set transaction isolation level repeatable read');
  assert.equal(userList.items[0]?.issueLabel, '原期刊标签');
  assert.equal(userList.items[0]?.issueQuestion, '原本的问题');
  assert.equal(userList.items[0]?.preview, '现实');
  assert.equal(Object.prototype.hasOwnProperty.call(userList.items[0], 'answers'), false);
  const adminList = await adminController.list(undefined, undefined, undefined, '50', '0');
  assert.equal(adminList.items[0]?.issueLabel, '原期刊标签');
  assert.equal(adminList.items[0]?.issueQuestion, '原本的问题');
});

test('admin can view a decrypted observation through the audited management detail route', async () => {
  const { adminController, state } = harness({ status: 'saved' });

  const result = await adminController.detail(request, observationId);

  assert.equal(result?.id, observationId);
  assert.deepEqual(result?.answers, completeReality);
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0]?.action, 'observation.admin.viewed');
});

test('user observation list rejects malformed pagination before querying data', async () => {
  const { controller, state } = harness();

  await assert.rejects(controller.list(request, 'not-a-number', '0'), BadRequestException);
  await assert.rejects(controller.list(request, '30', '-1'), BadRequestException);
  await assert.rejects(controller.list(request, '1.5', '0'), BadRequestException);
  assert.equal(state.statements.length, 0);
});

test('user observation list keeps defaults and caps the requested page size', async () => {
  const { controller } = harness();

  const defaultPage = await controller.list(request);
  assert.equal(defaultPage.limit, 30);
  assert.equal(defaultPage.offset, 0);

  const cappedPage = await controller.list(request, '100', '0');
  assert.equal(cappedPage.limit, 50);
  assert.equal(cappedPage.offset, 0);
});

test('observation endpoints return a stable deleted-account error after guard race', async () => {
  const { controller } = harness({ userExists: false });

  await assert.rejects(controller.create(request, { method: 'reality', answers: {} }), UnauthorizedException);
  await assert.rejects(controller.list(request, '30', '0'), UnauthorizedException);
  await assert.rejects(controller.detail(request, observationId), UnauthorizedException);
  await assert.rejects(controller.update(request, observationId, { revision: 1, status: 'saved', answers: completeReality }), UnauthorizedException);
  await assert.rejects(controller.remove(request, observationId), UnauthorizedException);
});

test('final save retry is a no-op and records completion only once', async () => {
  const { controller, state } = harness();
  const first = await controller.update(request, observationId, { revision: 1, status: 'saved', answers: completeReality });
  const ciphertext = JSON.stringify(state.row?.answers);
  const repeated = await controller.update(request, observationId, { revision: 1, status: 'saved', answers: { nextAction: '一小步', need: '需要', body: '身体', situation: '现实' } });
  assert.equal(repeated?.status, 'saved');
  assert.equal(first?.revision, 2);
  assert.equal(repeated?.revision, 2);
  assert.deepEqual(repeated?.updatedAt, first?.updatedAt);
  assert.equal(JSON.stringify(state.row?.answers), ciphertext);
  assert.equal(state.writes, 1);
  assert.equal(state.audits.filter((entry) => entry.action === 'observation.saved').length, 1);
});

test('saved records accept version-checked edits and reject incomplete or stale edit requests', async () => {
  const { controller, state } = harness({ status: 'saved' });
  const changed = { ...completeReality, need: '修改需要' };
  const result = await controller.update(request, observationId, { revision: 1, status: 'saved', answers: changed });
  assert.equal(result?.status, 'saved');
  assert.equal(result?.revision, 2);
  assert.deepEqual(result?.answers, changed);
  await assert.rejects(controller.update(request, observationId, { revision: 1, answers: completeReality }), ConflictException);
  await assert.rejects(controller.update(request, observationId, { revision: 1, status: 'draft' }), ConflictException);
  await assert.rejects(controller.update(request, observationId, { revision: 1, status: 'saved', answers: completeReality }), (error: unknown) => {
    assert.ok(error instanceof ConflictException);
    assert.equal((error.getResponse() as { code?: string }).code, 'observation_changed');
    return true;
  });
  assert.equal(state.writes, 1);
  assert.equal(state.audits.filter((entry) => entry.action === 'observation.updated').length, 1);
});

test('read-like PATCH calls do not reset content timestamps', async () => {
  for (const status of ['draft', 'saved'] as const) {
    const { controller, state } = harness({ status });
    const before = state.row?.updatedAt;
    const result = await controller.update(request, observationId, {});
    assert.deepEqual(result?.updatedAt, before);
    assert.equal(state.writes, 0);
  }
});

test('a stale cloud draft revision is rejected without overwriting newer answers', async () => {
  const { controller, state } = harness({ answers: completeReality });
  const previousAnswers = structuredClone(state.row?.answers);

  await assert.rejects(controller.update(request, observationId, {
    revision: 2,
    status: 'draft',
    answers: { ...completeReality, need: '本机旧回答' },
  }), (error: unknown) => {
    assert.ok(error instanceof ConflictException);
    assert.equal((error.getResponse() as { code?: string }).code, 'observation_changed');
    return true;
  });
  assert.equal(state.writes, 0);
  assert.deepEqual(state.row?.answers, previousAnswers);
  assert.equal(state.row?.revision, 1);
});

test('season final retry works without persisting or returning birthDate', async () => {
  const { controller, state, encryption } = harness({ method: 'season', answers: {} });
  const first = await controller.update(request, observationId, { revision: 1, status: 'saved', answers: completeSeason });
  const repeated = await controller.update(request, observationId, { revision: 1, status: 'saved', answers: completeSeason });
  assert.ok(first && repeated);
  assert.equal(Object.prototype.hasOwnProperty.call(first.answers, 'birthDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(encryption.decryptJson(state.row?.answers), 'birthDate'), false);
  assert.deepEqual(repeated.updatedAt, first.updatedAt);
  assert.equal(state.writes, 1);
});

test('season final save still requires the transient birthDate answer', async () => {
  const { controller, state } = harness({ method: 'season', answers: {} });
  await assert.rejects(controller.update(request, observationId, {
    revision: 1,
    status: 'saved',
    answers: { ...completeSeason, birthDate: '' },
  }), BadRequestException);
  assert.equal(state.row?.status, 'draft');
  assert.equal(state.writes, 0);
});

test('season final save rejects an invalid calendar birthDate', async () => {
  const { controller, state } = harness({ method: 'season', answers: {} });
  await assert.rejects(controller.update(request, observationId, {
    revision: 1,
    status: 'saved',
    answers: { ...completeSeason, birthDate: '1990-02-30' },
  }), BadRequestException);
  assert.equal(state.row?.status, 'draft');
  assert.equal(state.writes, 0);
});

test('season final save rejects a future birthDate', async () => {
  const { controller, state } = harness({ method: 'season', answers: {} });
  await assert.rejects(controller.update(request, observationId, {
    revision: 1,
    status: 'saved',
    answers: { ...completeSeason, birthDate: '2999-01-01' },
  }), BadRequestException);
  assert.equal(state.row?.status, 'draft');
  assert.equal(state.writes, 0);
});

test('season status-only finalization validates legacy birthday then removes it from storage', async () => {
  const { controller, state, encryption } = harness({ method: 'season', answers: completeSeason });
  const first = await controller.update(request, observationId, { revision: 1, status: 'saved' });
  assert.ok(first);
  assert.equal(first.status, 'saved');
  assert.equal(Object.prototype.hasOwnProperty.call(first.answers, 'birthDate'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(encryption.decryptJson(state.row?.answers), 'birthDate'), false);
  assert.equal(state.writes, 1);
});

test('incomplete observations cannot become saved', async () => {
  const { controller, state } = harness();
  await assert.rejects(controller.update(request, observationId, { revision: 1, status: 'saved', answers: { ...completeReality, need: '  ' } }), BadRequestException);
  assert.equal(state.row?.status, 'draft');
  assert.equal(state.writes, 0);
});

test('another user cannot recover a private record by its draft key or id', async () => {
  const { controller, state } = harness({ published: false });
  const otherUser = { user: { sub: '33333333-3333-4333-8333-333333333333' } } as Request & { user: { sub: string } };
  await assert.rejects(controller.create(otherUser, { method: 'reality', answers: {}, issueCode: 'issue-02', clientDraftId: 'draft-key' }), BadRequestException);
  assert.equal(await controller.detail(otherUser, observationId), null);
  assert.equal(await controller.update(otherUser, observationId, { revision: 1, status: 'saved', answers: completeReality }), null);
  assert.equal(state.writes, 0);
});

test('reencryption pagination preserves PostgreSQL microseconds between batches', async () => {
  const config = new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-observation-encryption-secret-32-bytes', SEASON_SAVE_BIRTH_DATE: 'false' });
  const encryption = new DataEncryptionService(config);
  const firstId = '44444444-4444-4444-8444-444444444444';
  const secondId = '55555555-5555-4555-8555-555555555555';
  const firstTimestamp = '2026-10-15T12:00:00.123456Z';
  const secondTimestamp = '2026-10-15T12:00:00.123457Z';
  const rows = [
    { id: firstId, method: 'reality' as const, answers: encryption.encryptJson(completeReality), updatedAt: firstTimestamp },
    { id: secondId, method: 'reality' as const, answers: encryption.encryptJson(completeReality), updatedAt: secondTimestamp },
  ];
  const cursorValues: Array<string | null> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('from observations')) {
        const cursor = values[0] as string | null;
        cursorValues.push(cursor);
        if (cursor === null) return { rows };
        return { rows: cursor === firstTimestamp ? [rows[1]] : rows };
      }
      if (sql.includes('insert into audit_logs')) return { rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      throw new Error(`Unexpected reencryption query: ${sql}`);
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const controller = new AdminObservationController(database, encryption, new AuditService(database), config);

  const firstPage = await controller.reencrypt(request, '1');
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextCursor?.updatedAt, firstTimestamp);

  const secondPage = await controller.reencrypt(request, '1', firstPage.nextCursor?.updatedAt, firstPage.nextCursor?.id);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextCursor, null);
  assert.deepEqual(cursorValues, [null, firstTimestamp]);
});

test('reencryption rejects an invalid batch size before opening the migration transaction', async () => {
  const { adminController, state } = harness();

  await assert.rejects(adminController.reencrypt(request, 'many'), BadRequestException);
  assert.equal(state.statements.length, 0);
});
