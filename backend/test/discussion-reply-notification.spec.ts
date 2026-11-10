import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import type { AuthService } from '../src/auth/auth.service';
import type { DatabaseService } from '../src/database/database.service';
import {
  DiscussionReplyNotificationService,
  compactDiscussionNotificationText,
  discussionReplyNotificationPage,
  formatDiscussionNotificationTime,
} from '../src/discussion/discussion-reply-notification.service';
import { DataEncryptionService } from '../src/security/data-encryption.service';

const templateId = 'HE9127B9HKQeuUmxj2yCnHMKTbEt9Smejx2KR0krsk';
const notificationId = '77777777-7777-4777-8777-777777777777';
const consentId = '88888888-8888-4888-8888-888888888888';
const replyContributionId = '99999999-9999-4999-8999-999999999999';
const parentContributionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const replyUserId = '11111111-1111-4111-8111-111111111111';
const recipientUserId = '33333333-3333-4333-8333-333333333333';

function encryptionService() {
  return new DataEncryptionService(new ConfigService({
    DATA_ENCRYPTION_KEY: 'unit-test-reply-notification-secret-32-bytes',
  }));
}

function notificationConfig() {
  return new ConfigService({
    WECHAT_SUBSCRIBE_TEMPLATE_DISCUSSION_REPLY: templateId,
    WECHAT_OPEN_API_BASE_URL: 'https://wechat.invalid',
    DISCUSSION_REPLY_NOTIFICATIONS_ENABLED: 'true',
    DISCUSSION_REPLY_NOTIFICATIONS_WORKER_ENABLED: 'true',
    DISCUSSION_REPLY_NOTIFICATIONS_MAX_ATTEMPTS: 3,
    DISCUSSION_REPLY_NOTIFICATIONS_BATCH_SIZE: 5,
    WECHAT_OPEN_API_TIMEOUT_MS: 500,
  });
}

function deliveryHarness(overrides: Record<string, unknown> = {}) {
  const encryption = encryptionService();
  const context = {
    id: notificationId,
    consentId,
    attemptCount: 1,
    issueCode: 'issue-02',
    issueLabel: 'ISSUE 02',
    threadId: 'community-thread',
    parentBody: encryption.encryptJson({ body: '这是原来的评论内容，值得收到一条清晰的回复通知。' }),
    replyBody: encryption.encryptJson({ body: '这是新的回复内容，会出现在一次性订阅消息里。' }),
    replyUserId,
    recipientUserId,
    replyStatus: 'published',
    parentStatus: 'published',
    openId: 'openid-recipient',
    restricted: false,
    consentTemplateId: templateId,
    consumedAt: null,
    reservedNotificationId: notificationId,
    ...overrides,
  };
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values });
      if (sql.includes('select id from discussion_reply_notifications')) {
        return { rows: [{ id: notificationId }], rowCount: 1 };
      }
      if (sql.includes('update discussion_reply_notifications') && sql.includes("status = 'sending'")) {
        return { rows: [{ id: notificationId, attemptCount: context.attemptCount }], rowCount: 1 };
      }
      if (sql.includes('update discussion_reply_notifications')) {
        return { rows: [{ id: notificationId }], rowCount: 1 };
      }
      if (sql.includes('update discussion_subscription_consents')) {
        return { rows: [{ id: consentId }], rowCount: 1 };
      }
      throw new Error(`Unexpected delivery query: ${sql}`);
    },
  } as unknown as PoolClient;
  const database = {
    query: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values });
      if (sql.includes('from discussion_reply_notifications notification')) return { rows: [context], rowCount: 1 };
      throw new Error(`Unexpected database query: ${sql}`);
    },
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  const tokenRequests: boolean[] = [];
  const auth = {
    getWechatAccessToken: async (forceRefresh = false) => {
      tokenRequests.push(forceRefresh);
      return forceRefresh ? 'refreshed-token' : 'cached-token';
    },
  } as unknown as AuthService;
  const service = new DiscussionReplyNotificationService(database, notificationConfig(), auth, encryption);

  const run = async (responses: Array<Record<string, unknown>>) => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const response = responses[Math.min(requests.length, responses.length - 1)] || {
        errcode: 0,
        errmsg: 'ok',
      };
      requests.push({
        url: String(input),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {},
      });
      return new Response(JSON.stringify(response), { status: 200 });
    }) as typeof fetch;
    try {
      await service.processOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
    return { requests, tokenRequests, writes };
  };

  return { run, writes, tokenRequests };
}

function enqueueHarness(options: {
  target?: Record<string, unknown>;
  restricted?: boolean;
  consentAvailable?: boolean;
} = {}) {
  const target = {
    id: replyContributionId,
    parentContributionId,
    replyUserId,
    recipientUserId,
    replyStatus: 'published',
    parentStatus: 'published',
    openId: 'openid-recipient',
    ...options.target,
  };
  let inserted = true;
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values });
      if (sql.includes('insert into discussion_reply_notifications')) {
        const rows = inserted ? [{ id: notificationId }] : [];
        inserted = false;
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('from discussion_contributions reply')) return { rows: [target], rowCount: 1 };
      if (sql.includes('from discussion_user_restrictions')) {
        return { rows: options.restricted ? [{ id: 'restriction-id' }] : [], rowCount: options.restricted ? 1 : 0 };
      }
      if (sql.includes('select id from discussion_subscription_consents')) {
        return { rows: options.consentAvailable === false ? [] : [{ id: consentId }], rowCount: options.consentAvailable === false ? 0 : 1 };
      }
      if (sql.includes('update discussion_subscription_consents')) {
        return { rows: [{ id: consentId }], rowCount: 1 };
      }
      throw new Error(`Unexpected enqueue query: ${sql}`);
    },
  } as unknown as PoolClient;
  const service = new DiscussionReplyNotificationService(
    {} as DatabaseService,
    notificationConfig(),
    {} as AuthService,
    encryptionService(),
  );
  return { client, service, writes };
}

test('subscription message text, Shanghai time, and discussion page stay within WeChat limits', () => {
  const emoji = '😀'.repeat(21);
  assert.equal(Array.from(compactDiscussionNotificationText(emoji)).length, 20);
  assert.equal(compactDiscussionNotificationText('  第一行\n第二行  '), '第一行 第二行');
  assert.equal(compactDiscussionNotificationText(''), '一起谈谈');
  assert.equal(formatDiscussionNotificationTime(new Date('2026-11-06T00:05:00.000Z')), '2026-11-06 08:05');

  const page = discussionReplyNotificationPage('issue 02', 'community-thread');
  const [path, query = ''] = page.split('?');
  assert.equal(path, 'pages/discussion-thread/index');
  assert.equal(new URLSearchParams(query).get('issueCode'), 'issue 02');
  assert.equal(new URLSearchParams(query).get('threadId'), 'community-thread');
});

test('enqueue skips self replies, hidden content, restricted recipients, missing OpenID, and duplicate review', async () => {
  const skippedCases: Array<{ name: string; options: Parameters<typeof enqueueHarness>[0] }> = [
    { name: 'self reply', options: { target: { replyUserId: recipientUserId } } },
    { name: 'hidden reply', options: { target: { replyStatus: 'hidden' } } },
    { name: 'hidden parent', options: { target: { parentStatus: 'hidden' } } },
    { name: 'restricted recipient', options: { restricted: true } },
    { name: 'missing OpenID', options: { target: { openId: null } } },
    { name: 'consumed consent', options: { consentAvailable: false } },
  ];
  for (const item of skippedCases) {
    const { client, service, writes } = enqueueHarness(item.options);
    try {
      assert.equal(await service.enqueueForPublishedReply(client, replyContributionId), false, item.name);
    } catch (error) {
      throw new Error(`${item.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    assert.equal(writes.some(({ sql }) => sql.includes('insert into discussion_reply_notifications')), false, item.name);
  }

  const duplicate = enqueueHarness();
  assert.equal(await duplicate.service.enqueueForPublishedReply(duplicate.client, replyContributionId), true);
  assert.equal(await duplicate.service.enqueueForPublishedReply(duplicate.client, replyContributionId), false);
  assert.equal(duplicate.writes.filter(({ sql }) => sql.includes('insert into discussion_reply_notifications')).length, 2);
  assert.equal(duplicate.writes.filter(({ sql }) => sql.includes('update discussion_subscription_consents')).length, 1);
});

test('delivery rechecks visibility, self replies, restrictions, and OpenID before calling WeChat', async () => {
  const skippedCases: Array<{ name: string; overrides: Record<string, unknown>; reason: string }> = [
    { name: 'hidden reply', overrides: { replyStatus: 'hidden' }, reason: '原内容或回复已不可见' },
    { name: 'hidden parent', overrides: { parentStatus: 'hidden' }, reason: '原内容或回复已不可见' },
    { name: 'self reply', overrides: { replyUserId: recipientUserId }, reason: '自己回复自己不会发送通知' },
    { name: 'restricted recipient', overrides: { restricted: true }, reason: '接收人当前已被限制参与讨论' },
    { name: 'missing OpenID', overrides: { openId: null }, reason: '接收人缺少微信 OpenID' },
    { name: 'consumed consent', overrides: { consumedAt: new Date() }, reason: '订阅授权已失效或已使用' },
  ];
  for (const item of skippedCases) {
    const harness = deliveryHarness(item.overrides);
    const result = await harness.run([{ errcode: 0, errmsg: 'ok' }]);
    assert.equal(result.requests.length, 0, item.name);
    const skipped = result.writes.find(({ sql }) => sql.includes("set status = 'skipped'"));
    assert.ok(skipped, item.name);
    assert.equal(skipped.values[1], item.reason, item.name);
  }
});

test('invalid access token is refreshed once, then a successful send consumes the one-time consent', async () => {
  const harness = deliveryHarness();
  const result = await harness.run([
    { errcode: 40001, errmsg: 'invalid credential' },
    { errcode: 0, errmsg: 'ok' },
  ]);

  assert.deepEqual(result.tokenRequests, [false, true]);
  assert.equal(result.requests.length, 2);
  assert.match(result.requests[0].url, /cached-token/);
  assert.match(result.requests[1].url, /refreshed-token/);
  const payload = result.requests[1].body;
  assert.equal(payload.touser, 'openid-recipient');
  assert.equal(payload.template_id, templateId);
  assert.equal(payload.page, 'pages/discussion-thread/index?issueCode=issue-02&threadId=community-thread');
  const data = payload.data as Record<string, { value: string }>;
  assert.equal(Array.from(data.thing2.value).length <= 20, true);
  assert.equal(Array.from(data.thing3.value).length <= 20, true);
  assert.match(data.time4.value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(result.writes.some(({ sql }) => sql.includes("set status = 'sent'")), true);
  assert.equal(result.writes.some(({ sql }) => sql.includes('set consumed_at = now()')), true);
});

test('permanent WeChat errors are skipped while temporary errors return to the retry queue', async () => {
  const permanent = deliveryHarness();
  const permanentResult = await permanent.run([{ errcode: 43101, errmsg: 'user refuse to accept the msg' }]);
  const permanentWrite = permanentResult.writes.find(({ sql }) => sql.includes("set status = 'skipped'"));
  assert.ok(permanentWrite);
  assert.equal(permanentWrite.values[1], 'user refuse to accept the msg');
  assert.equal(permanentResult.requests.length, 1);

  const temporary = deliveryHarness();
  const temporaryResult = await temporary.run([{ errcode: 45009, errmsg: 'reach max api daily quota limit' }]);
  const retryWrite = temporaryResult.writes.find(({ sql }) => sql.includes('set status = $2'));
  assert.ok(retryWrite);
  assert.equal(retryWrite.values[1], 'queued');
  assert.equal(retryWrite.values[3], 30);
  assert.equal(temporaryResult.writes.some(({ sql }) => sql.includes('set consumed_at = now()')), false);
});
