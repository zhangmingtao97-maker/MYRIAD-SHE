import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AdminDiscussionContributionController } from '../src/admin/admin-discussion-contribution.controller';
import { AuditService } from '../src/admin/audit.service';
import { DiscussionContributionController } from '../src/discussion/discussion-contribution.controller';
import { defaultDiscussionContent } from '../src/content/discussion-content';
import { DatabaseService } from '../src/database/database.service';
import { DataEncryptionService } from '../src/security/data-encryption.service';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '33333333-3333-4333-8333-333333333333';
const adminId = '44444444-4444-4444-8444-444444444444';
const contributionId = '22222222-2222-4222-8222-222222222222';
type Status = 'pending' | 'handled' | 'dismissed';
interface Row {
  id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null;
  body: unknown; status: Status; createdAt: Date; updatedAt: Date; userId: string; handledBy: string | null; handledAt: Date | null;
}

function harness() {
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-discussion-encryption-secret-32-bytes' }));
  const state = { row: null as Row | null, statements: [] as string[], audits: [] as Array<{ action: string; metadata: Record<string, unknown> }>, inserts: 0 };
  const query = async (sql: string, values: unknown[] = []) => {
    state.statements.push(sql);
    if (sql.includes('select id from users where id = $1 for share')) return { rows: [{ id: String(values[0]) }] };
    if (sql.includes('from content_issues issue')) return values[0] === 'issue-02'
      ? { rows: [{ issueCode: 'issue-02', issueLabel: 'ISSUE 02', discussion: defaultDiscussionContent() }] }
      : { rows: [] };
    if (sql.includes('insert into audit_logs')) {
      state.audits.push({ action: String(values[2]), metadata: JSON.parse(String(values[5])) as Record<string, unknown> });
      return { rows: [] };
    }
    if (sql.includes('insert into discussion_contributions')) {
      state.inserts += 1;
      const createdAt = state.row?.createdAt ?? new Date('2026-10-03T00:00:00.000Z');
      state.row = {
        id: contributionId, revision: (state.row?.revision ?? 0) + 1,
        issueCode: String(values[1]), issueLabel: String(values[2]), threadId: String(values[3]),
        threadAuthor: values[4] as string | null, body: JSON.parse(String(values[5])), status: 'pending',
        createdAt, updatedAt: new Date('2026-10-04T00:00:00.000Z'), userId: String(values[0]), handledBy: null, handledAt: null,
      };
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('update discussion_contributions')) {
      assert.ok(state.row);
      state.row.status = values[0] as Status;
      state.row.revision += 1;
      state.row.handledBy = state.row.status === 'pending' ? null : String(values[1]);
      state.row.handledAt = state.row.status === 'pending' ? null : new Date('2026-10-05T00:00:00.000Z');
      state.row.updatedAt = new Date('2026-10-05T00:00:00.000Z');
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('delete from discussion_contributions')) {
      if (state.row && state.row.userId === values[0] && state.row.issueCode === values[1] && state.row.threadId === values[2]) {
        const removedId = state.row.id;
        state.row = null;
        return { rows: [{ id: removedId }] };
      }
      return { rows: [] };
    }
    if (sql.includes('count(*)::text as total from discussion_contributions')) return { rows: [{ total: state.row ? '1' : '0' }] };
    if (sql.includes('from discussion_contributions')) {
      if (sql.includes('where user_id = $1')) {
        if (sql.includes('order by updated_at desc')) return state.row && state.row.userId === values[0] ? { rows: [structuredClone(state.row)] } : { rows: [] };
        return state.row && state.row.userId === values[0] && state.row.issueCode === values[1] && state.row.threadId === values[2]
          ? { rows: [structuredClone(state.row)] } : { rows: [] };
      }
      if (sql.includes('where id = $1')) {
        return state.row && state.row.id === values[0]
          ? { rows: [{ ...structuredClone(state.row), body: state.row.body }] } : { rows: [] };
      }
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
    encryption,
    user: new DiscussionContributionController(database, audit, encryption),
    admin: new AdminDiscussionContributionController(database, encryption, audit),
  };
}

test('saving a discussion experience encrypts it, snapshots the published thread and audits metadata only', async () => {
  const { user, state, encryption } = harness();
  const saved = await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, {
    issueCode: 'issue-02', threadId: 'lan', body: '  我在经历一件具体的事。  ',
  });

  assert.equal(saved.body, '我在经历一件具体的事。');
  assert.equal(saved.threadAuthor, '岚');
  assert.equal(saved.status, 'pending');
  assert.deepEqual(encryption.decryptJson(state.row?.body), { body: '我在经历一件具体的事。' });
  assert.equal(state.audits[0]?.action, 'discussion_contribution.saved');
  assert.equal(JSON.stringify(state.audits[0]?.metadata).includes('我在经历'), false);
});

test('a user cannot save against a thread absent from the published discussion', async () => {
  const { user, state } = harness();
  await assert.rejects(user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, {
    issueCode: 'issue-02', threadId: 'not-a-thread', body: '一段经历',
  }), BadRequestException);
  assert.equal(state.inserts, 0);
});

test('experience restore and deletion are scoped to the authenticated owner', async () => {
  const { user } = harness();
  await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', body: '自己的内容' });

  const other = { user: { sub: otherUserId } } as Request & { user: { sub: string } };
  assert.equal(await user.mine(other, 'issue-02'), null);
  assert.deepEqual(await user.remove(other, 'issue-02'), { deleted: false });
  assert.equal((await user.mine({ user: { sub: userId } } as Request & { user: { sub: string } }, 'issue-02'))?.body, '自己的内容');
  const ownedList = await user.listMine({ user: { sub: userId } } as Request & { user: { sub: string } });
  assert.equal(ownedList[0]?.body, '自己的内容');
});

test('authorized staff can view and process a contribution with revision protection', async () => {
  const { user, admin, state } = harness();
  await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', body: '待审核的经历' });
  const staff = { user: { sub: adminId } } as Request & { user: { sub: string } };
  const detail = await admin.detail(staff, contributionId);

  assert.equal(detail?.body, '待审核的经历');
  assert.equal(state.audits.some((entry) => entry.action === 'discussion_contribution.admin.viewed'), true);
  const updated = await admin.updateStatus(staff, contributionId, { status: 'handled', revision: 1 });
  assert.equal(updated?.status, 'handled');
  assert.equal(updated?.revision, 2);
  await assert.rejects(admin.updateStatus(staff, contributionId, { status: 'dismissed', revision: 1 }), ConflictException);
  assert.equal(state.audits.some((entry) => entry.action === 'discussion_contribution.status.updated'), true);
});
