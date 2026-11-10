import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { parseDatabaseCount } from '../pagination';

type AuditActorType = 'user' | 'admin' | 'system';
type WecomStatus = 'pending' | 'sent' | 'skipped' | 'failed';

export interface AuditNotificationInput {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

interface NotificationEvent {
  eventType: string;
  title: string;
  content: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
}

interface PendingNotification {
  id: string;
  eventType: string;
  title: string;
  content: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
}

const userOperationEvents: Readonly<Record<string, { title: string; content: string }>> = {
  'user.created': {
    title: '有新用户加入',
    content: '一位用户已完成首次登录。',
  },
  'observation.saved': {
    title: '收到新的观察记录',
    content: '有用户完成并保存了一条观察记录。',
  },
  'observation.updated': {
    title: '观察记录已更新',
    content: '有用户更新了已保存的观察记录。',
  },
  'discussion_contribution.saved': {
    title: '收到用户经历或回复',
    content: '有用户提交了本期讨论的经历或回复内容。',
  },
  'discussion_report.created': {
    title: '收到内容举报',
    content: '有用户提交了讨论内容举报，请及时查看。',
  },
  'privacy.deletion.requested': {
    title: '收到账户删除申请',
    content: '有用户提交了账户删除申请，请按流程处理。',
  },
  'privacy.deletion.cancelled': {
    title: '账户删除申请已取消',
    content: '有用户取消了账户删除申请。',
  },
};

function safeNotificationMetadata(input: AuditNotificationInput) {
  const metadata = input.metadata ?? {};
  const allowed: Record<string, unknown> = {};
  if (input.action === 'observation.saved' || input.action === 'observation.updated') {
    if (metadata.method === 'reality' || metadata.method === 'season') allowed.method = metadata.method;
  }
  if (input.action === 'discussion_contribution.saved') {
    if (typeof metadata.hasThread === 'boolean') allowed.hasThread = metadata.hasThread;
    if (typeof metadata.hasParentContribution === 'boolean') allowed.hasParentContribution = metadata.hasParentContribution;
    if (typeof metadata.issueLabel === 'string') {
      const issueLabel = metadata.issueLabel.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (issueLabel) allowed.issueLabel = issueLabel;
    }
  }
  if (input.action === 'discussion_report.created'
    && ['inappropriate', 'spam', 'privacy', 'other'].includes(String(metadata.reason))) {
    allowed.reason = metadata.reason;
  }
  return allowed;
}

export function notificationEventForAudit(input: AuditNotificationInput): NotificationEvent | null {
  // 站内通知只关注真实用户动作，不记录管理员浏览或系统任务，避免形成噪声。
  if (input.actorType !== 'user') return null;
  const definition = userOperationEvents[input.action];
  if (!definition) return null;
  const metadata = safeNotificationMetadata(input);
  let title = definition.title;
  let content = definition.content;
  if (input.action === 'discussion_contribution.saved') {
    if (metadata.hasParentContribution === true) {
      title = '收到一条讨论回复';
      content = '有用户回复了本期讨论中的留言，请及时查看。';
    } else {
      title = '收到一条讨论经历';
      content = '有用户提交了本期讨论的经历，请及时查看。';
    }
  }
  return {
    eventType: input.action,
    title,
    content,
    resourceType: input.resourceType.slice(0, 120),
    resourceId: input.resourceId?.slice(0, 512) ?? null,
    metadata,
  };
}

@Injectable()
export class AdminNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminNotificationService.name);
  private timer?: NodeJS.Timeout;
  private processingPromise: Promise<{ processed: number }> | null = null;
  private stopping = false;
  private accessToken: { value: string; expiresAt: number } | null = null;
  private accessTokenPromise: Promise<string> | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private wecomSettings() {
    const enabledValue = String(this.config.get('ADMIN_WECOM_NOTIFY_ENABLED', 'true')).trim().toLowerCase();
    const enabled = !['false', '0', 'off', 'no'].includes(enabledValue);
    const corpId = String(this.config.get('ADMIN_WECOM_CORP_ID', '') ?? '').trim();
    const agentIdValue = String(this.config.get('ADMIN_WECOM_AGENT_ID', '') ?? '').trim();
    const agentId = Number(agentIdValue);
    const appSecret = String(this.config.get('ADMIN_WECOM_APP_SECRET', '') ?? '').trim();
    const baseUrl = String(this.config.get('ADMIN_WECOM_API_BASE_URL', 'https://qyapi.weixin.qq.com') ?? '')
      .trim().replace(/\/+$/, '');
    const configuredTimeout = Number(this.config.get('ADMIN_WECOM_NOTIFY_TIMEOUT_MS', this.config.get('ADMIN_WECOM_API_TIMEOUT_MS', 8_000)));
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout >= 500
      ? Math.min(configuredTimeout, 30_000)
      : 8_000;
    const configuredUrl = String(this.config.get('ADMIN_WECOM_NOTIFY_URL', '') ?? '').trim();
    const notifyUrl = configuredUrl.length <= 2048 && /^https?:\/\/[^\s]+$/i.test(configuredUrl) ? configuredUrl : '';
    return {
      enabled,
      configured: enabled && Boolean(corpId && Number.isSafeInteger(agentId) && agentId > 0 && appSecret && baseUrl),
      corpId,
      agentId: Number.isSafeInteger(agentId) && agentId > 0 ? agentId : 0,
      appSecret,
      baseUrl,
      timeoutMs,
      notifyUrl,
    };
  }

  private initialWecomStatus(): WecomStatus {
    return this.wecomSettings().configured ? 'pending' : 'skipped';
  }

  onModuleInit() {
    if (!this.wecomSettings().configured) return;
    const configuredInterval = Number(this.config.get('ADMIN_WECOM_NOTIFY_POLL_INTERVAL_MS', 30_000));
    const interval = Number.isSafeInteger(configuredInterval)
      ? Math.min(Math.max(configuredInterval, 10_000), 300_000)
      : 30_000;
    this.timer = setInterval(() => void this.processPending().catch(() => undefined), interval);
    this.timer.unref?.();
    void this.processPending().catch(() => undefined);
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    return this.processingPromise ?? Promise.resolve();
  }

  async createFromAuditId(auditId: string, input: AuditNotificationInput, client?: PoolClient): Promise<string | null> {
    const event = notificationEventForAudit(input);
    if (!event) return null;
    const values = [
      auditId,
      event.eventType,
      event.title,
      event.content,
      event.resourceType,
      event.resourceId,
      JSON.stringify(event.metadata),
      this.initialWecomStatus(),
    ];
    const statement = `insert into admin_notifications
      (source_audit_id, event_type, title, content, resource_type, resource_id, metadata, wecom_status)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      on conflict (source_audit_id) do nothing
      returning id`;
    return this.createWithExecutor(event, values, statement, client);
  }

  private async createWithExecutor(
    event: NotificationEvent,
    values: unknown[],
    statement: string,
    client?: PoolClient,
  ): Promise<string | null> {
    const run = async () => {
      const result = client
        ? await client.query<{ id: string }>(statement, values)
        : await this.database.query<{ id: string }>(statement, values);
      return result.rows[0]?.id ?? null;
    };
    if (!client) {
      try {
        return await run();
      } catch (error) {
        this.logger.warn(`通知写入失败，已保留原业务：${this.errorMessage(error)}`);
        return null;
      }
    }
    // 通知失败不能污染调用方事务；保存点允许只回滚通知插入。
    await client.query('savepoint admin_notification_insert');
    try {
      const id = await run();
      await client.query('release savepoint admin_notification_insert');
      return id;
    } catch (error) {
      try {
        await client.query('rollback to savepoint admin_notification_insert');
        await client.query('release savepoint admin_notification_insert');
      } catch {
        // 保存点恢复失败时由调用方的数据库错误处理决定后续行为。
      }
      this.logger.warn(`通知写入失败，已保留原业务：${this.errorMessage(error)}`);
      return null;
    }
  }

  async list(adminId: string, limit = 30, offset = 0) {
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 30;
    const safeOffset = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const rows = await client.query(
        `select n.id, n.event_type as "eventType", n.title, n.content,
                n.resource_type as "resourceType", n.resource_id as "resourceId",
                n.created_at as "createdAt",
                exists(
                  select 1 from admin_notification_reads r
                  where r.notification_id = n.id and r.admin_id = $1
                ) as "isRead"
         from admin_notifications n
         order by n.created_at desc, n.id desc
         limit $2 offset $3`,
        [adminId, safeLimit, safeOffset],
      );
      const totals = await client.query<{ total: string; unreadCount: string }>(
        `select count(*)::text as total,
                count(*) filter (
                  where not exists (
                    select 1 from admin_notification_reads r
                    where r.notification_id = n.id and r.admin_id = $1
                  )
                )::text as "unreadCount"
         from admin_notifications n`,
        [adminId],
      );
      return {
        items: rows.rows,
        total: parseDatabaseCount(totals.rows[0]?.total ?? '0', '通知总数'),
        unreadCount: parseDatabaseCount(totals.rows[0]?.unreadCount ?? '0', '未读通知总数'),
        limit: safeLimit,
        offset: safeOffset,
      };
    });
  }

  async unreadCount(adminId: string) {
    const result = await this.database.query<{ unreadCount: string }>(
      `select count(*)::text as "unreadCount"
       from admin_notifications n
       where not exists (
         select 1 from admin_notification_reads r
         where r.notification_id = n.id and r.admin_id = $1
       )`, [adminId],
    );
    return { unreadCount: parseDatabaseCount(result.rows[0]?.unreadCount ?? '0', '未读通知总数') };
  }

  async markRead(adminId: string, notificationId: string) {
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level read committed');
      const notification = await client.query<{ id: string }>(
        `select id from admin_notifications where id = $1`, [notificationId],
      );
      if (!notification.rows[0]) throw new NotFoundException('通知不存在');
      await client.query(
        `insert into admin_notification_reads (notification_id, admin_id)
         values ($1, $2) on conflict do nothing`, [notificationId, adminId],
      );
      const unread = await client.query<{ unreadCount: string }>(
        `select count(*)::text as "unreadCount"
         from admin_notifications n
         where not exists (
           select 1 from admin_notification_reads r
           where r.notification_id = n.id and r.admin_id = $1
         )`, [adminId],
      );
      return {
        read: true,
        unreadCount: parseDatabaseCount(unread.rows[0]?.unreadCount ?? '0', '未读通知总数'),
      };
    });
  }

  async markAllRead(adminId: string) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query(
        `insert into admin_notification_reads (notification_id, admin_id)
         select n.id, $1 from admin_notifications n
         on conflict do nothing`, [adminId],
      );
      return { read: true, updated: result.rowCount ?? 0, unreadCount: 0 };
    });
  }

  async processPending(limit = 20) {
    if (this.stopping || this.processingPromise) return { processed: 0 };
    const run = (async () => {
      const settings = this.wecomSettings();
      if (!settings.configured) return { processed: 0 };
      return this.database.withSessionAdvisoryLock('myriad-she-admin-wecom-notifications', async (client) => {
        const rows = await client.query<PendingNotification>(
          `select id, event_type as "eventType", title, content,
                  resource_type as "resourceType", resource_id as "resourceId", metadata
           from admin_notifications
           where wecom_status = 'pending'
           order by created_at asc, id asc
           limit $1
           for update skip locked`,
          [Math.min(Math.max(Math.floor(limit), 1), 50)],
        );
        if (!rows.rows.length) return { processed: 0 };

        const recipients = await client.query<{ wecomUserId: string }>(
          `select wecom_user_id as "wecomUserId"
           from admin_accounts
           where status = 'active'
             and wecom_user_id is not null
             and btrim(wecom_user_id) <> ''
           order by created_at asc, id asc
           limit 100`,
        );
        const touser = [...new Set(recipients.rows.map((row) => row.wecomUserId.trim()).filter(Boolean))].join('|');
        if (!touser) {
          for (const row of rows.rows) {
            await this.updateDelivery(client, row.id, 'skipped', 'no_bound_admin', 0);
          }
          return { processed: rows.rows.length };
        }

        let token: string;
        try {
          token = await this.getAccessToken(settings);
        } catch (error) {
          const message = this.errorMessage(error);
          for (const row of rows.rows) {
            await this.updateDelivery(client, row.id, 'failed', message, 1);
          }
          return { processed: rows.rows.length };
        }

        for (const row of rows.rows) {
          try {
            await this.sendApplicationMessage(settings, token, touser, row);
            await this.updateDelivery(client, row.id, 'sent', null, 1);
          } catch (error) {
            await this.updateDelivery(client, row.id, 'failed', this.errorMessage(error), 1);
          }
        }
        return { processed: rows.rows.length };
      });
    })();
    this.processingPromise = run;
    try {
      return await run;
    } finally {
      this.processingPromise = null;
    }
  }

  private async updateDelivery(
    client: PoolClient,
    id: string,
    status: Exclude<WecomStatus, 'pending'>,
    error: string | null,
    attemptsToAdd: number,
  ) {
    await client.query(
      `update admin_notifications
       set wecom_status = $2, wecom_error = $3,
           wecom_attempts = wecom_attempts + $4
       where id = $1`,
      [id, status, error?.slice(0, 1000) ?? null, Math.max(0, attemptsToAdd)],
    );
  }

  private async getAccessToken(settings: ReturnType<AdminNotificationService['wecomSettings']>) {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    if (this.accessTokenPromise) return this.accessTokenPromise;
    const pending = (async () => {
      const query = new URLSearchParams({
        corpid: settings.corpId,
        corpsecret: settings.appSecret,
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const response = await fetch(`${settings.baseUrl}/cgi-bin/gettoken?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error('企业微信 access token 请求失败');
        const parsed: unknown = await response.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('企业微信 access token 响应无效');
        const result = parsed as { access_token?: unknown; expires_in?: unknown; errcode?: unknown };
        if (typeof result.access_token !== 'string' || !result.access_token
          || typeof result.expires_in !== 'number' || !Number.isSafeInteger(result.expires_in)
          || result.expires_in <= 60) {
          throw new Error('企业微信 access token 响应无效');
        }
        this.accessToken = {
          value: result.access_token,
          expiresAt: Date.now() + (result.expires_in - 60) * 1000,
        };
        return result.access_token;
      } finally {
        clearTimeout(timeout);
      }
    })();
    this.accessTokenPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.accessTokenPromise === pending) this.accessTokenPromise = null;
    }
  }

  private notificationDetails(notification: PendingNotification) {
    const metadata = notification.metadata ?? {};
    if (notification.eventType === 'discussion_contribution.saved') {
      return [
        `类型：${metadata.hasParentContribution === true ? '回复留言' : '本期经历'}`,
        ...(typeof metadata.issueLabel === 'string' && metadata.issueLabel.trim()
          ? [`讨论：${metadata.issueLabel.trim()}`]
          : []),
      ];
    }
    if (notification.eventType === 'observation.saved' || notification.eventType === 'observation.updated') {
      if (metadata.method === 'reality') return ['记录方式：真实经历'];
      if (metadata.method === 'season') return ['记录方式：四时气韵'];
    }
    if (notification.eventType === 'discussion_report.created') {
      const reasons: Record<string, string> = {
        inappropriate: '不当内容', spam: '垃圾信息', privacy: '隐私问题', other: '其他问题',
      };
      if (typeof metadata.reason === 'string' && reasons[metadata.reason]) {
        return [`举报原因：${reasons[metadata.reason]}`];
      }
    }
    return [];
  }

  private escapeTextCardHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character] ?? character));
  }

  private async sendApplicationMessage(
    settings: ReturnType<AdminNotificationService['wecomSettings']>,
    token: string,
    touser: string,
    notification: PendingNotification,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const details = this.notificationDetails(notification);
      const textContent = [
        '新的用户操作提醒',
        notification.title,
        notification.content,
        ...details,
        ...(settings.notifyUrl ? ['', `查看后台：${settings.notifyUrl}`] : []),
      ].join('\n');
      const message = settings.notifyUrl
        ? {
            touser,
            msgtype: 'textcard',
            agentid: settings.agentId,
            textcard: {
              title: notification.title,
              description: [
                '<div class="gray">新的用户操作提醒</div>',
                `<div class="normal">${this.escapeTextCardHtml(notification.content)}</div>`,
                ...details.map((detail) => `<div class="normal">${this.escapeTextCardHtml(detail)}</div>`),
              ].join(''),
              url: settings.notifyUrl,
              btntxt: '查看后台',
            },
          }
        : {
            touser,
            msgtype: 'text',
            agentid: settings.agentId,
            text: { content: textContent },
          };
      const response = await fetch(`${settings.baseUrl}/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('企业微信消息请求失败');
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('企业微信消息响应无效');
      const result = parsed as { errcode?: unknown; errmsg?: unknown };
      if (result.errcode !== 0) {
        const detail = typeof result.errmsg === 'string' ? result.errmsg.slice(0, 300) : 'unknown_error';
        throw new Error(`企业微信消息发送失败（${String(result.errcode ?? 'unknown')}）：${detail}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') return '企业微信消息请求超时';
    if (error instanceof Error) return error.message.slice(0, 1000);
    return '企业微信消息发送失败';
  }
}
