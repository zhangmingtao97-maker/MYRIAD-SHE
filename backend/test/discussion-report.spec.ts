import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AdminDiscussionReportController } from '../src/admin/admin-discussion-report.controller';
import { AuditService } from '../src/admin/audit.service';
import { defaultDiscussionContent } from '../src/content/discussion-content';
import { DatabaseService } from '../src/database/database.service';
import { DiscussionReportController } from '../src/discussion/discussion-report.controller';
import { DataEncryptionService } from '../src/security/data-encryption.service';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '33333333-3333-4333-8333-333333333333';
const adminId = '44444444-4444-4444-8444-444444444444';
const reportId = '55555555-5555-4555-8555-555555555555';
type Status = 'pending' | 'handled' | 'dismissed';

interface ReportRow {
  id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null;
  threadBody: string | null; reason: string; detail: string | null; status: Status;
  createdAt: Date; updatedAt: Date; userId: string;
}

function harness() {
  const state = { row: null as ReportRow | null, inserts: 0, audits: [] as Array<{ action: string; metadata: Record<string, unknown> }> };
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('select id from users where id = $1 for share')) return { rows: [{ id: String(values[0]) }] };
    if (sql.includes('from content_issues issue')) {
      return values[0] === 'issue-02'
        ? { rows: [{ issueCode: 'issue-02', issueLabel: 'ISSUE 02', discussion: defaultDiscussionContent() }] }
        : { rows: [] };
    }
    if (sql.includes('from discussion_contributions contribution') && sql.includes("publication_status = 'published'")) return { rows: [] };
    if (sql.includes('insert into audit_logs')) {
      state.audits.push({ action: String(values[2]), metadata: JSON.parse(String(values[5])) as Record<string, unknown> });
      return { rows: [] };
    }
    if (sql.includes('insert into discussion_reports')) {
      state.inserts += 1;
      state.row = {
        id: reportId, revision: (state.row?.revision ?? 0) + 1, issueCode: String(values[1]), issueLabel: String(values[2]),
        threadId: String(values[3]), threadAuthor: values[4] as string | null, threadBody: values[5] as string | null,
        reason: String(values[6]), detail: (values[7] as string | null) ?? null, status: 'pending',
        createdAt: state.row?.createdAt ?? new Date('2026-11-01T00:00:00.000Z'), updatedAt: new Date('2026-11-02T00:00:00.000Z'),
        userId: String(values[0]),
      };
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('select status, count(*)::text as total from discussion_reports group by status')) {
      return { rows: state.row ? [{ status: state.row.status, total: '1' }] : [] };
    }
    if (sql.includes('count(*)::text as total from discussion_reports')) return { rows: [{ total: state.row ? '1' : '0' }] };
    if (sql.includes('update discussion_reports')) {
      assert.ok(state.row);
      state.row.status = values[0] as Status;
      state.row.revision += 1;
      state.row.updatedAt = new Date('2026-11-03T00:00:00.000Z');
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('from discussion_reports')) {
      if (sql.includes('where id = $1')) return state.row && state.row.id === values[0] ? { rows: [structuredClone(state.row)] } : { rows: [] };
      if (sql.includes('where user_id = $1 and issue_code = $2')) return state.row && state.row.userId === values[0] && state.row.issueCode === values[1] ? { rows: [structuredClone(state.row)] } : { rows: [] };
      if (sql.includes('where user_id = $1')) return state.row && state.row.userId === values[0] ? { rows: [structuredClone(state.row)] } : { rows: [] };
      return state.row ? { rows: [structuredClone(state.row)] } : { rows: [] };
    }
    throw new Error(`Unexpected test query: ${sql}`);
  };
  const client = { query } as unknown as PoolClient;
  const database = {
    query,
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const audit = new AuditService(database);
  return {
    state,
    user: new DiscussionReportController(database, audit, new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-discussion-encryption-secret-32-bytes' }))),
    admin: new AdminDiscussionReportController(database, audit),
  };
}

const asUser = (sub: string) => ({ user: { sub } }) as Request & { user: { sub: string } };

test('a user report snapshots the published thread and lands in the admin queue as pending', async () => {
  const { user, state } = harness();
  const saved = await user.save(asUser(userId), { issueCode: 'issue-02', threadId: 'lan', reason: 'inappropriate', detail: '  语气让人不适  ' });

  assert.equal(saved.status, 'pending');
  assert.equal(saved.threadAuthor, '岚');
  assert.ok(saved.threadBody && saved.threadBody.length > 0);
  assert.equal(saved.detail, '语气让人不适');
  assert.equal(state.inserts, 1);
  assert.equal(state.audits[0]?.action, 'discussion_report.created');
  assert.deepEqual(state.audits[0]?.metadata, { issueCode: 'issue-02', threadId: 'lan', reason: 'inappropriate' });
  assert.equal(JSON.stringify(state.audits[0]?.metadata).includes('语气让人不适'), false);
});

test('a report against a thread absent from the published discussion is rejected', async () => {
  const { user, state } = harness();
  await assert.rejects(user.save(asUser(userId), { issueCode: 'issue-02', threadId: 'not-a-thread', reason: 'spam' }), BadRequestException);
  assert.equal(state.inserts, 0);
});

test('reports are scoped to the authenticated owner and can be listed per issue', async () => {
  const { user } = harness();
  await user.save(asUser(userId), { issueCode: 'issue-02', threadId: 'lan', reason: 'privacy' });

  assert.equal((await user.mine(asUser(otherUserId), 'issue-02')).length, 0);
  const mine = await user.mine(asUser(userId), 'issue-02');
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.threadId, 'lan');
  assert.equal((await user.mine(asUser(userId), 'issue-01')).length, 0);
});

test('staff can read the report queue with status summary and process a report with revision protection', async () => {
  const { user, admin, state } = harness();
  await user.save(asUser(userId), { issueCode: 'issue-02', threadId: 'lan', reason: 'spam' });

  const page = await admin.list('pending', undefined, undefined, undefined);
  assert.equal(page.items.length, 1);
  assert.equal(page.total, 1);
  assert.equal(page.summary.pending, 1);
  assert.equal(page.items[0]?.reason, 'spam');

  const handled = await admin.updateStatus(asUser(adminId), reportId, { status: 'handled', revision: 1 });
  assert.equal(handled?.status, 'handled');
  assert.equal(handled?.revision, 2);
  await assert.rejects(admin.updateStatus(asUser(adminId), reportId, { status: 'dismissed', revision: 1 }), ConflictException);
  assert.equal(state.audits.some((entry) => entry.action === 'discussion_report.status.updated'), true);
});

test('an invalid status filter is rejected before touching the database', async () => {
  const { admin } = harness();
  await assert.rejects(admin.list('unknown'), BadRequestException);
});
