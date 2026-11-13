import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PoolClient } from 'pg';
import { AdminNotificationService, notificationEventForAudit } from '../src/admin/admin-notification.service';
import { AuditService } from '../src/admin/audit.service';
import { AuthService } from '../src/auth/auth.service';
import type { DatabaseService } from '../src/database/database.service';

function notificationService(config: Record<string, unknown> = {}, database?: Partial<DatabaseService>) {
  return new AdminNotificationService(
    database as unknown as DatabaseService,
    new ConfigService(config),
  );
}

test('only known real-user actions become notifications and metadata stays minimal', () => {
  const event = notificationEventForAudit({
    actorType: 'user',
    actorId: 'user-1',
    action: 'observation.saved',
    resourceType: 'observation',
    resourceId: 'observation-1',
    metadata: {
      method: 'reality',
      content: '不应进入通知的观察正文',
      phone: '13800138000',
      address: '不应进入通知的地址',
      nested: { article: '不应进入通知的内容' },
    },
  });
  assert.ok(event);
  assert.equal(event.eventType, 'observation.saved');
  assert.equal(event.title, '收到新的观察记录');
  assert.deepEqual(event.metadata, { method: 'reality' });
  assert.doesNotMatch(JSON.stringify(event), /13800138000|观察正文|不应进入通知的地址/);
  assert.equal(notificationEventForAudit({
    actorType: 'admin', action: 'observation.saved', resourceType: 'observation',
  }), null);
  assert.equal(notificationEventForAudit({
    actorType: 'system', action: 'user.created', resourceType: 'user',
  }), null);
  assert.equal(notificationEventForAudit({
    actorType: 'user', action: 'admin.auth.login_succeeded', resourceType: 'admin_login',
  }), null);
});

test('discussion contribution notifications distinguish experiences from replies and keep public context only', () => {
  const reply = notificationEventForAudit({
    actorType: 'user',
    action: 'discussion_contribution.saved',
    resourceType: 'discussion_contribution',
    resourceId: 'contribution-1',
    metadata: {
      issueCode: 'issue-02',
      issueLabel: '第二期：一起谈谈',
      hasThread: true,
      hasParentContribution: true,
      status: 'pending',
      publicationStatus: 'pending',
      body: '不应进入企微通知的正文',
    },
  });
  assert.ok(reply);
  assert.equal(reply.title, '收到一条讨论回复');
  assert.equal(reply.content, '有用户回复了本期讨论中的留言，请及时查看。');
  assert.deepEqual(reply.metadata, {
    hasThread: true,
    hasParentContribution: true,
    issueLabel: '第二期：一起谈谈',
  });
  assert.doesNotMatch(JSON.stringify(reply), /不应进入企微通知的正文/);

  const experience = notificationEventForAudit({
    actorType: 'user',
    action: 'discussion_contribution.saved',
    resourceType: 'discussion_contribution',
    resourceId: 'contribution-2',
    metadata: { hasThread: true, hasParentContribution: false },
  });
  assert.equal(experience?.title, '收到一条讨论经历');
  assert.equal(experience?.content, '有用户提交了本期讨论的经历，请及时查看。');
});

test('notification insertion uses a safe event payload and skips WeCom when not configured', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const service = notificationService({}, {
    query: async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values });
      return { rows: [{ id: 'notification-1' }], rowCount: 1 } as never;
    },
  });
  const id = await service.createFromAuditId('00000000-0000-4000-8000-000000000001', {
    actorType: 'user',
    actorId: 'user-1',
    action: 'discussion_report.created',
    resourceType: 'discussion_report',
    resourceId: 'report-1',
    metadata: { reason: 'privacy', reporterNote: '敏感举报正文', phone: '13800138000' },
  });
  assert.equal(id, 'notification-1');
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /insert into admin_notifications/);
  assert.deepEqual(queries[0].values.slice(0, 7), [
    '00000000-0000-4000-8000-000000000001',
    'discussion_report.created',
    '收到内容举报',
    '有用户提交了讨论内容举报，请及时查看。',
    'discussion_report',
    'report-1',
    JSON.stringify({ reason: 'privacy' }),
  ]);
  assert.equal(queries[0].values[7], 'skipped');
});

test('audit remains successful when notification persistence fails or no notifier is configured', async () => {
  let auditWrites = 0;
  const database = {
    query: async () => {
      auditWrites += 1;
      return { rows: [{ id: 'audit-1' }], rowCount: 1 };
    },
  } as unknown as DatabaseService;
  const failingNotifier = {
    createFromAuditId: async () => { throw new Error('notification store unavailable'); },
  } as unknown as AdminNotificationService;
  const withNotifier = new AuditService(database, failingNotifier);
  await assert.doesNotReject(withNotifier.record({
    actorType: 'user', actorId: 'user-1', action: 'user.created', resourceType: 'user', resourceId: 'user-1',
  }));
  const withoutNotifier = new AuditService(database);
  await assert.doesNotReject(withoutNotifier.record({
    actorType: 'admin', action: 'admin.auth.login_succeeded', resourceType: 'admin_login',
  }));
  assert.equal(auditWrites, 2);
});

test('read markers are stored independently for each administrator', async () => {
  const inserts: unknown[][] = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (/select id from admin_notifications/.test(sql)) return { rows: [{ id: 'notification-1' }], rowCount: 1 };
      if (/insert into admin_notification_reads/.test(sql)) {
        inserts.push(values);
        return { rows: [], rowCount: 1 };
      }
      if (/select count\(\*\)::text as "unreadCount"/.test(sql)) return { rows: [{ unreadCount: '0' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async (callback: (transactionClient: PoolClient) => Promise<unknown>) => callback(client),
  } as unknown as DatabaseService;
  const service = notificationService({}, database);
  await service.markRead('admin-a', 'notification-1');
  await service.markRead('admin-b', 'notification-1');
  assert.deepEqual(inserts, [
    ['notification-1', 'admin-a'],
    ['notification-1', 'admin-b'],
  ]);
});

test('WeCom delivery marks notifications skipped when no administrator is bound', async () => {
  const updates: unknown[][] = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (/from admin_notifications/.test(sql)) {
        return {
          rows: [{
            id: 'notification-1', eventType: 'observation.saved', title: '收到新的观察记录',
            content: '有用户完成并保存了一条观察记录。', resourceType: 'observation', resourceId: 'observation-1',
          }],
          rowCount: 1,
        };
      }
      if (/from admin_accounts/.test(sql)) return { rows: [], rowCount: 0 };
      if (/update admin_notifications/.test(sql)) {
        updates.push(values);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;
  const database = {
    withSessionAdvisoryLock: async (_key: string, callback: (lockClient: PoolClient) => Promise<unknown>) => callback(client),
  } as unknown as DatabaseService;
  const service = notificationService({
    ADMIN_WECOM_CORP_ID: 'corp', ADMIN_WECOM_AGENT_ID: '100001', ADMIN_WECOM_APP_SECRET: 'secret',
  }, database);
  const result = await service.processPending();
  assert.deepEqual(result, { processed: 1 });
  assert.deepEqual(updates, [['notification-1', 'skipped', 'no_bound_admin', 0]]);
});

test('WeCom transport failure is recorded without rejecting the operation', async () => {
  const updates: unknown[][] = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (/from admin_notifications/.test(sql)) {
        return {
          rows: [{
            id: 'notification-1', eventType: 'user.created', title: '有新用户加入',
            content: '一位用户已完成首次登录。', resourceType: 'user', resourceId: 'user-1',
          }],
          rowCount: 1,
        };
      }
      if (/from admin_accounts/.test(sql)) return { rows: [{ wecomUserId: 'bound-admin' }], rowCount: 1 };
      if (/update admin_notifications/.test(sql)) {
        updates.push(values);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;
  const database = {
    withSessionAdvisoryLock: async (_key: string, callback: (lockClient: PoolClient) => Promise<unknown>) => callback(client),
  } as unknown as DatabaseService;
  const service = notificationService({
    ADMIN_WECOM_CORP_ID: 'corp', ADMIN_WECOM_AGENT_ID: '100001', ADMIN_WECOM_APP_SECRET: 'secret',
  }, database);
  (service as unknown as { getAccessToken: () => Promise<string> }).getAccessToken = async () => 'access-token';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  try {
    assert.deepEqual(await service.processPending(), { processed: 1 });
    assert.equal(updates.length, 1);
    assert.equal(updates[0][1], 'failed');
    assert.equal(updates[0][3], 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('configured WeCom notifications use a clickable text card with escaped public context', async () => {
  const service = notificationService({
    ADMIN_WECOM_CORP_ID: 'corp',
    ADMIN_WECOM_AGENT_ID: '100001',
    ADMIN_WECOM_APP_SECRET: 'secret',
    ADMIN_WECOM_NOTIFY_URL: 'https://www.myriadshe.com/',
  });
  const transport = service as unknown as {
    wecomSettings(): Record<string, unknown>;
    sendApplicationMessage(
      settings: Record<string, unknown>, token: string, touser: string,
      notification: Record<string, unknown>,
    ): Promise<void>;
  };
  const originalFetch = globalThis.fetch;
  let requestBody = '';
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 });
  }) as typeof fetch;
  try {
    await transport.sendApplicationMessage(transport.wecomSettings(), 'access-token', 'bound-admin', {
      id: 'notification-1',
      eventType: 'discussion_contribution.saved',
      title: '收到一条讨论回复',
      content: '有用户回复了本期讨论中的留言，请及时查看。',
      resourceType: 'discussion_contribution',
      resourceId: 'contribution-1',
      metadata: { hasParentContribution: true, issueLabel: '第二期 <一起谈谈>' },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const payload = JSON.parse(requestBody) as {
    msgtype?: string;
    textcard?: { title?: string; description?: string; url?: string; btntxt?: string };
  };
  assert.equal(payload.msgtype, 'textcard');
  assert.equal(payload.textcard?.title, '收到一条讨论回复');
  assert.equal(payload.textcard?.url, 'https://www.myriadshe.com/');
  assert.equal(payload.textcard?.btntxt, '查看后台');
  assert.match(payload.textcard?.description ?? '', /类型：回复留言/);
  assert.match(payload.textcard?.description ?? '', /讨论：第二期 &lt;一起谈谈&gt;/);
  assert.doesNotMatch(payload.textcard?.description ?? '', /<一起谈谈>/);
});

test('new WeChat users emit one notification while returning users do not', async () => {
  const originalFetch = globalThis.fetch;
  let loginCount = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify({ openid: 'openid-1' }), { status: 200 })) as typeof fetch;
  const auditEvents: Array<{ action: string; actorType: string }> = [];
  const database = {
    query: async () => {
      loginCount += 1;
      return { rows: [{ id: 'user-1', created: loginCount === 1, status: 'active', nickname: '已有昵称', avatarObjectKey: 'users/avatars/existing.png', profileCompletedAt: '2026-01-01T00:00:00.000Z', phoneVerifiedAt: '2026-01-01T00:00:00.000Z' }], rowCount: 1 };
    },
  } as unknown as DatabaseService;
  const auth = new AuthService(
    new ConfigService({
      WECHAT_MINI_APP_ID: 'mini-app',
      WECHAT_MINI_APP_SECRET: 'mini-secret',
      WECHAT_OPEN_API_BASE_URL: 'https://wechat.invalid',
    }),
    { signAsync: async () => 'user-token' } as unknown as JwtService,
    database,
    { record: async (event: { action: string; actorType: string }) => { auditEvents.push(event); } } as unknown as AuditService,
  );
  try {
    await auth.wechatLogin('first-code');
    await auth.wechatLogin('returning-code');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(auditEvents, [{
    actorType: 'user', actorId: 'user-1', action: 'user.created', resourceType: 'user', resourceId: 'user-1',
  }]);
});
