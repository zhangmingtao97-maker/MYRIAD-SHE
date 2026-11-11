import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AdminDiscussionContributionController } from '../src/admin/admin-discussion-contribution.controller';
import { AdminDiscussionRestrictionController } from '../src/admin/admin-discussion-restriction.controller';
import { AuditService } from '../src/admin/audit.service';
import { DiscussionContributionController } from '../src/discussion/discussion-contribution.controller';
import { defaultDiscussionContent } from '../src/content/discussion-content';
import { DatabaseService } from '../src/database/database.service';
import { DiscussionReplyNotificationService } from '../src/discussion/discussion-reply-notification.service';
import { DataEncryptionService } from '../src/security/data-encryption.service';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '33333333-3333-4333-8333-333333333333';
const adminId = '44444444-4444-4444-8444-444444444444';
const contributionId = '22222222-2222-4222-8222-222222222222';
type Status = 'pending' | 'handled' | 'dismissed';
type PublicationStatus = 'pending' | 'published' | 'hidden' | 'rejected';
interface Row {
  id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null;
  parentContributionId: string | null;
  body: unknown; status: Status; publicationStatus: PublicationStatus; createdAt: Date; updatedAt: Date;
  userId: string; nickname: string | null; handledBy: string | null; handledAt: Date | null;
  publishedAt: Date | null; featuredAt: Date | null; featuredOrder: number;
}

function harness() {
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-discussion-encryption-secret-32-bytes' }));
  const state = {
    row: null as Row | null,
    restrictionActive: false,
    statements: [] as string[],
    audits: [] as Array<{ action: string; metadata: Record<string, unknown> }>,
    inserts: 0,
    consentCalls: [] as Array<{ userId: string; contributionId: string; requestId: string }>,
    enqueueCalls: [] as string[],
    enqueueError: null as Error | null,
  };
  const query = async (sql: string, values: unknown[] = []) => {
    state.statements.push(sql);
    if (/^(savepoint|release savepoint|rollback to savepoint) discussion_(reply_notification|subscription_consent)$/.test(sql.trim())) {
      return { rows: [] };
    }
    if (sql.includes('select id from users where id = $1 for share')) return { rows: [{ id: String(values[0]) }] };
    if (sql.includes('from discussion_user_restrictions') && sql.includes('starts_at <= now()')) {
      return { rows: state.restrictionActive ? [{ id: 'restriction-id', reason: '限制发言', startsAt: new Date(), endsAt: null }] : [] };
    }
    if (sql.includes('from content_issues issue')) return values[0] === 'issue-02'
      ? { rows: [{ issueCode: 'issue-02', issueLabel: 'ISSUE 02', discussion: defaultDiscussionContent() }] }
      : { rows: [] };
    if (sql.includes('where contribution.id = $1 and contribution.publication_status = \'published\'')) {
      const target = state.row && state.row.id === values[0] ? state.row : null;
      return { rows: target ? [{ id: target.id, userId: target.userId, issueCode: target.issueCode, threadId: target.threadId, nickname: target.nickname }] : [] };
    }
    if (sql.includes('from discussion_contributions contribution') && sql.includes("publication_status = 'published'")) return { rows: [] };
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
        threadAuthor: values[4] as string | null, parentContributionId: values[5] as string | null,
        body: JSON.parse(String(values[6])), status: 'pending',
        publicationStatus: 'pending', createdAt, updatedAt: new Date('2026-10-04T00:00:00.000Z'),
        userId: String(values[0]), nickname: '测试读者', handledBy: null, handledAt: null,
        publishedAt: null, featuredAt: null, featuredOrder: 0,
      };
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('set publication_status = $1')) {
      assert.ok(state.row);
      const nextStatus = values[1] as Status;
      state.row.publicationStatus = values[0] as PublicationStatus;
      state.row.status = nextStatus;
      state.row.revision += 1;
      state.row.handledBy = nextStatus === 'pending' ? null : String(values[2]);
      state.row.handledAt = nextStatus === 'pending' ? null : new Date('2026-10-05T00:00:00.000Z');
      if (state.row.publicationStatus === 'published') state.row.publishedAt ??= new Date('2026-10-05T00:00:00.000Z');
      if (state.row.publicationStatus !== 'published') {
        state.row.featuredAt = null;
        state.row.featuredOrder = 0;
      }
      state.row.updatedAt = new Date('2026-10-05T00:00:00.000Z');
      return { rows: [structuredClone(state.row)] };
    }
    if (sql.includes('set featured_at = case when $1')) {
      assert.ok(state.row);
      const featured = Boolean(values[0]);
      state.row.featuredAt = featured ? (state.row.featuredAt ?? new Date('2026-10-06T00:00:00.000Z')) : null;
      state.row.featuredOrder = Number(values[2]);
      state.row.revision += 1;
      state.row.updatedAt = new Date('2026-10-06T00:00:00.000Z');
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
    if (sql.includes('select publication_status as "publicationStatus"')) return { rows: state.row ? [{ publicationStatus: state.row.publicationStatus, total: '1' }] : [] };
    if (sql.includes('from discussion_contributions contribution')) {
      if (!state.row) return { rows: [], total: '0' };
      return { rows: [{ ...structuredClone(state.row), bodyPreview: '待审核的经历' }], total: '1' };
    }
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
  const replyNotifications = {
    recordSubscriptionConsent: async (_client: PoolClient, userIdValue: string, contributionIdValue: string, requestId: string) => {
      state.consentCalls.push({ userId: userIdValue, contributionId: contributionIdValue, requestId });
    },
    enqueueForPublishedReply: async (_client: PoolClient, replyContributionId: string) => {
      if (state.enqueueError) throw state.enqueueError;
      state.enqueueCalls.push(replyContributionId);
      return true;
    },
  } as unknown as DiscussionReplyNotificationService;
  return {
    state,
    encryption,
    user: new DiscussionContributionController(database, audit, encryption, replyNotifications),
    admin: new AdminDiscussionContributionController(database, encryption, audit, replyNotifications),
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
  assert.equal(saved.publicationStatus, 'pending');
  assert.deepEqual(encryption.decryptJson(state.row?.body), { body: '我在经历一件具体的事。' });
  assert.equal(state.audits[0]?.action, 'discussion_contribution.saved');
  assert.equal(JSON.stringify(state.audits[0]?.metadata).includes('我在经历'), false);
});

test('a reply target is scoped to the selected floor and stores its notification consent with the contribution', async () => {
  const { user, admin, state } = harness();
  const staff = { user: { sub: adminId } } as Request & { user: { sub: string } };
  const reader = { user: { sub: otherUserId } } as Request & { user: { sub: string } };
  await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', threadId: 'lan', body: '楼层原内容' });
  await admin.updatePublication(staff, contributionId, { publicationStatus: 'published', revision: 1 });

  const reply = await user.save(reader, {
    issueCode: 'issue-02',
    threadId: 'lan',
    parentContributionId: contributionId,
    body: '回复这一层',
    notifyOnReply: true,
    subscriptionRequestId: 'reply_request_1234',
  });

  assert.equal(reply.parentContributionId, contributionId);
  assert.deepEqual(state.consentCalls, [{ userId: otherUserId, contributionId, requestId: 'reply_request_1234' }]);
  assert.equal(state.statements.some((sql) => sql === 'savepoint discussion_subscription_consent'), true);
  assert.equal(state.statements.some((sql) => sql === 'release savepoint discussion_subscription_consent'), true);
});

test('a restricted user can read and remove old content but cannot submit a new experience', async () => {
  const { user, state } = harness();
  await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', body: '已经保存的内容' });
  state.restrictionActive = true;
  const request = { user: { sub: userId } } as Request & { user: { sub: string } };
  assert.equal((await user.mine(request, 'issue-02'))?.body, '已经保存的内容');
  await assert.rejects(user.save(request, { issueCode: 'issue-02', body: '新的内容' }), ForbiddenException);
  assert.deepEqual(await user.remove(request, 'issue-02'), { deleted: true });
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

test('publishing syncs the legacy status, supports featured order and clears featured state when hidden', async () => {
  const { user, admin, state } = harness();
  await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', body: '值得分享的经历' });
  const staff = { user: { sub: adminId } } as Request & { user: { sub: string } };

  const published = await admin.updatePublication(staff, contributionId, { publicationStatus: 'published', revision: 1 });
  assert.equal(published?.publicationStatus, 'published');
  assert.equal(published?.status, 'handled');
  const featured = await admin.updateFeatured(staff, contributionId, { featured: true, featuredOrder: 3, revision: 2 });
  assert.ok(featured?.featuredAt);
  assert.equal(featured?.featuredOrder, 3);
  const hidden = await admin.updatePublication(staff, contributionId, { publicationStatus: 'hidden', revision: 3 });
  assert.equal(hidden?.publicationStatus, 'hidden');
  assert.equal(hidden?.featuredAt, null);
  assert.equal(hidden?.featuredOrder, 0);
  assert.equal(state.audits.some((entry) => entry.action === 'discussion_contribution.featured.updated'), true);
});

test('publishing a reply queues one notification and notification failures never roll back moderation', async () => {
  const { user, admin, state } = harness();
  const staff = { user: { sub: adminId } } as Request & { user: { sub: string } };
  const parentId = '66666666-6666-4666-8666-666666666666';
  await user.save({ user: { sub: otherUserId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', body: '待审核回复' });
  assert.ok(state.row);
  state.row.parentContributionId = parentId;
  state.enqueueError = new Error('notification store unavailable');

  const publishedAfterFailure = await admin.updatePublication(staff, contributionId, { publicationStatus: 'published', revision: 1 });
  assert.equal(publishedAfterFailure?.publicationStatus, 'published');
  assert.equal(state.enqueueCalls.length, 0);

  state.enqueueError = null;
  await admin.updatePublication(staff, contributionId, { publicationStatus: 'hidden', revision: 2 });
  await admin.updatePublication(staff, contributionId, { publicationStatus: 'published', revision: 3 });
  await admin.updatePublication(staff, contributionId, { publicationStatus: 'published', revision: 4 });
  assert.deepEqual(state.enqueueCalls, [contributionId]);
  assert.equal(state.audits.some((entry) => entry.action === 'discussion_contribution.publication.updated'), true);
});

test('replies cannot be featured and stale publication actions are rejected', async () => {
  const { user, admin } = harness();
  await user.save({ user: { sub: userId } } as Request & { user: { sub: string } }, { issueCode: 'issue-02', threadId: 'lan', body: '一条回复' });
  const staff = { user: { sub: adminId } } as Request & { user: { sub: string } };
  await admin.updatePublication(staff, contributionId, { publicationStatus: 'published', revision: 1 });
  await assert.rejects(admin.updateFeatured(staff, contributionId, { featured: true, revision: 2 }), BadRequestException);
  await assert.rejects(admin.updatePublication(staff, contributionId, { publicationStatus: 'rejected', revision: 1 }), ConflictException);
});

function restrictionHarness() {
  const restrictionId = '55555555-5555-4555-8555-555555555555';
  const state = {
    existing: false,
    revoked: false,
    audits: [] as string[],
  };
  const row = {
    id: restrictionId, userId, nickname: '测试读者', reason: '连续发布无关内容',
    startsAt: new Date('2026-10-01T00:00:00.000Z'), endsAt: null,
    createdBy: adminId, createdAt: new Date('2026-10-01T00:00:00.000Z'),
    revokedAt: null as Date | null, revokedBy: null as string | null, effectiveStatus: 'active',
  };
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('select id, nickname from users')) return { rows: [{ id: userId, nickname: '测试读者' }] };
    if (sql.includes('select id from discussion_user_restrictions')) return { rows: state.existing ? [{ id: restrictionId }] : [] };
    if (sql.includes('insert into audit_logs')) { state.audits.push(String(values[2])); return { rows: [] }; }
    if (sql.includes('insert into discussion_user_restrictions')) return { rows: [{ ...row, reason: String(values[1]), endsAt: values[2] as Date | null }] };
    if (sql.includes('from discussion_user_restrictions restriction') && sql.includes('where restriction.id = $1 for update')) return { rows: [{ ...row, revokedAt: state.revoked ? row.revokedAt : null }] };
    if (sql.includes('update discussion_user_restrictions')) {
      state.revoked = true;
      return { rows: [{ ...row, revokedAt: new Date('2026-10-02T00:00:00.000Z'), revokedBy: adminId, effectiveStatus: 'revoked' }] };
    }
    throw new Error(`Unexpected restriction query: ${sql}`);
  };
  const client = { query } as unknown as PoolClient;
  const database = {
    query,
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  return { controller: new AdminDiscussionRestrictionController(database, new AuditService(database)), state };
}

test('discussion restrictions require a reason, reject duplicates, audit creation and support revocation', async () => {
  const { controller, state } = restrictionHarness();
  const staff = { user: { sub: adminId } } as Request & { user: { sub: string } };
  const created = await controller.create(staff, { userId, reason: '  连续发布无关内容  ', endsAt: null });
  assert.equal(created.reason, '连续发布无关内容');
  assert.equal(created.nickname, '测试读者');
  assert.deepEqual(state.audits, ['discussion_restriction.created']);
  state.existing = true;
  await assert.rejects(controller.create(staff, { userId, reason: '重复限制' }), ConflictException);
  const revoked = await controller.revoke(staff, created.id);
  assert.equal(revoked?.effectiveStatus, 'revoked');
  assert.equal(state.audits.includes('discussion_restriction.revoked'), true);
  await assert.rejects(controller.create(staff, { userId, reason: '短', endsAt: null }), BadRequestException);
});
