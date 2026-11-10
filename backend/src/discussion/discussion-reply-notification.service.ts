import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { DataEncryptionService } from '../security/data-encryption.service';

interface ReplyNotificationSettings {
  enabled: boolean;
  workerEnabled: boolean;
  templateId: string;
  intervalMs: number;
  batchSize: number;
  maxAttempts: number;
  timeoutMs: number;
}

interface NotificationTarget {
  id: string;
  parentContributionId: string;
  replyUserId: string;
  recipientUserId: string;
  replyStatus: string;
  parentStatus: string;
  openId: string | null;
}

interface ClaimedNotification {
  id: string;
  attemptCount: number;
}

interface DeliveryContext {
  id: string;
  consentId: string;
  attemptCount: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  parentBody: unknown;
  replyBody: unknown;
  replyUserId: string;
  recipientUserId: string;
  replyStatus: string;
  parentStatus: string;
  openId: string | null;
  restricted: boolean;
  consentTemplateId: string;
  consumedAt: Date | null;
  reservedNotificationId: string | null;
}

const tokenErrorCodes = new Set([40001, 40014, 42001]);
const permanentErrorCodes = new Set([40003, 40037, 41030, 43101, 47003]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WechatSubscribeError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'WechatSubscribeError';
  }
}

export function compactDiscussionNotificationText(value: unknown, maxLength = 20) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return Array.from(text || '一起谈谈').slice(0, maxLength).join('');
}

export function formatDiscussionNotificationTime(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

export function discussionReplyNotificationPage(issueCode: string, threadId: string) {
  const query = new URLSearchParams({ issueCode, threadId });
  return `pages/discussion-thread/index?${query.toString()}`;
}

@Injectable()
export class DiscussionReplyNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscussionReplyNotificationService.name);
  private timer?: NodeJS.Timeout;
  private processingPromise: Promise<{ processed: number }> | null = null;
  private stopping = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly encryption: DataEncryptionService,
  ) {}

  private settings(): ReplyNotificationSettings {
    const enabledValue = String(this.config.get('DISCUSSION_REPLY_NOTIFICATIONS_ENABLED', 'true')).trim().toLowerCase();
    const workerValue = String(this.config.get('DISCUSSION_REPLY_NOTIFICATIONS_WORKER_ENABLED', 'true')).trim().toLowerCase();
    const templateId = String(this.config.get('WECHAT_SUBSCRIBE_TEMPLATE_DISCUSSION_REPLY', '') ?? '').trim();
    const configuredInterval = Number(this.config.get('DISCUSSION_REPLY_NOTIFICATIONS_INTERVAL_MS', 15_000));
    const configuredBatch = Number(this.config.get('DISCUSSION_REPLY_NOTIFICATIONS_BATCH_SIZE', 20));
    const configuredAttempts = Number(this.config.get('DISCUSSION_REPLY_NOTIFICATIONS_MAX_ATTEMPTS', 8));
    const configuredTimeout = Number(this.config.get('WECHAT_OPEN_API_TIMEOUT_MS', 8_000));
    return {
      enabled: !['false', '0', 'off', 'no'].includes(enabledValue) && /^[A-Za-z0-9_-]{10,128}$/.test(templateId),
      workerEnabled: !['false', '0', 'off', 'no'].includes(workerValue),
      templateId,
      intervalMs: Number.isSafeInteger(configuredInterval) && configuredInterval >= 1_000 ? Math.min(configuredInterval, 300_000) : 15_000,
      batchSize: Number.isSafeInteger(configuredBatch) && configuredBatch >= 1 ? Math.min(configuredBatch, 100) : 20,
      maxAttempts: Number.isSafeInteger(configuredAttempts) && configuredAttempts >= 1 ? Math.min(configuredAttempts, 20) : 8,
      timeoutMs: Number.isSafeInteger(configuredTimeout) && configuredTimeout >= 500 ? Math.min(configuredTimeout, 30_000) : 8_000,
    };
  }

  private async recordConsent(client: PoolClient, userId: string, contributionId: string, requestId: string) {
    const settings = this.settings();
    if (!settings.enabled) return;
    await client.query(
      `insert into discussion_subscription_consents (user_id, contribution_id, template_id, request_id)
       values ($1, $2, $3, $4)
       on conflict (user_id, request_id) do nothing`,
      [userId, contributionId, settings.templateId, requestId],
    );
  }

  async recordSubscriptionConsent(client: PoolClient, userId: string, contributionId: string, requestId: string) {
    await this.recordConsent(client, userId, contributionId, requestId);
  }

  async enqueueForPublishedReply(client: PoolClient, replyContributionId: string) {
    const settings = this.settings();
    if (!settings.enabled || !uuidPattern.test(replyContributionId)) return false;
    const targetResult = await client.query<NotificationTarget>(
      `select reply.id, parent.id as "parentContributionId", reply.user_id as "replyUserId",
              parent.user_id as "recipientUserId",
              reply.publication_status as "replyStatus", parent.publication_status as "parentStatus",
              users.wechat_openid as "openId"
       from discussion_contributions reply
       join discussion_contributions parent on parent.id = reply.parent_contribution_id
       left join users on users.id = parent.user_id
       where reply.id = $1 and reply.thread_id <> '' and reply.publication_status = 'published'`,
      [replyContributionId],
    );
    const target = targetResult.rows[0];
    if (!target || target.replyStatus !== 'published' || target.parentStatus !== 'published'
      || target.replyUserId === target.recipientUserId) return false;
    if (!target.openId || target.openId.length > 256) return false;
    const restriction = await client.query(
      `select 1 from discussion_user_restrictions
       where user_id = $1 and revoked_at is null and starts_at <= now()
         and (ends_at is null or ends_at > now()) limit 1`,
      [target.recipientUserId],
    );
    if (restriction.rows[0]) return false;
    const consent = await client.query<{ id: string }>(
      `select id from discussion_subscription_consents
       where contribution_id = $1 and user_id = $2 and template_id = $3
         and consumed_at is null and reserved_notification_id is null
       order by accepted_at asc, id asc
       for update skip locked limit 1`,
      [target.parentContributionId, target.recipientUserId, settings.templateId],
    );
    const consentId = consent.rows[0]?.id;
    if (!consentId) return false;
    const inserted = await client.query<{ id: string }>(
      `insert into discussion_reply_notifications
         (parent_contribution_id, reply_contribution_id, recipient_user_id, consent_id, template_id)
       select parent.id, reply.id, parent.user_id, $2, $3
       from discussion_contributions reply
       join discussion_contributions parent on parent.id = reply.parent_contribution_id
       where reply.id = $1
       on conflict (reply_contribution_id) do nothing
       returning id`,
      [replyContributionId, consentId, settings.templateId],
    );
    const notificationId = inserted.rows[0]?.id;
    if (!notificationId) return false;
    const reserved = await client.query(
      `update discussion_subscription_consents
       set reserved_notification_id = $2, reserved_at = now()
       where id = $1 and consumed_at is null and reserved_notification_id is null
       returning id`,
      [consentId, notificationId],
    );
    if (!reserved.rows[0]) throw new Error('discussion_subscription_consent_not_available');
    return true;
  }

  private async claimBatch(limit: number) {
    return this.database.withTransaction(async (client) => {
      const selected = await client.query<{ id: string }>(
        `select id from discussion_reply_notifications
         where (status = 'queued' and next_attempt_at <= now())
            or (status = 'sending' and updated_at < now() - interval '5 minutes')
         order by next_attempt_at asc, created_at asc, id asc
         for update skip locked
         limit $1`,
        [limit],
      );
      if (!selected.rows.length) return [];
      const ids = selected.rows.map((row) => row.id);
      const claimed = await client.query<ClaimedNotification>(
        `update discussion_reply_notifications
         set status = 'sending', attempt_count = attempt_count + 1, updated_at = now()
         where id = any($1::uuid[])
           and ((status = 'queued' and next_attempt_at <= now())
             or (status = 'sending' and updated_at < now() - interval '5 minutes'))
         returning id, attempt_count as "attemptCount"`,
        [ids],
      );
      return claimed.rows;
    });
  }

  private async loadDeliveryContext(id: string) {
    const result = await this.database.query<DeliveryContext>(
      `select notification.id, notification.consent_id as "consentId",
              notification.attempt_count as "attemptCount", reply.issue_code as "issueCode",
              reply.issue_label_snapshot as "issueLabel", reply.thread_id as "threadId",
              parent.body as "parentBody", reply.body as "replyBody", reply.user_id as "replyUserId",
              parent.user_id as "recipientUserId", reply.publication_status as "replyStatus",
              parent.publication_status as "parentStatus", users.wechat_openid as "openId",
              exists (
                select 1 from discussion_user_restrictions restriction
                where restriction.user_id = parent.user_id and restriction.revoked_at is null
                  and restriction.starts_at <= now() and (restriction.ends_at is null or restriction.ends_at > now())
              ) as restricted,
              consent.template_id as "consentTemplateId", consent.consumed_at as "consumedAt",
              consent.reserved_notification_id as "reservedNotificationId"
       from discussion_reply_notifications notification
       join discussion_contributions reply on reply.id = notification.reply_contribution_id
       join discussion_contributions parent on parent.id = notification.parent_contribution_id
       join discussion_subscription_consents consent on consent.id = notification.consent_id
       left join users on users.id = parent.user_id
       where notification.id = $1 and notification.status = 'sending'`,
      [id],
    );
    return result.rows[0] || null;
  }

  private async sendSubscriptionMessage(context: DeliveryContext, settings: ReplyNotificationSettings) {
    const body = {
      touser: context.openId,
      template_id: settings.templateId,
      page: discussionReplyNotificationPage(context.issueCode, context.threadId),
      data: {
        thing1: { value: compactDiscussionNotificationText(`${context.issueLabel} · 一起谈谈`) },
        thing2: { value: compactDiscussionNotificationText(this.decryptBody(context.parentBody)) },
        thing3: { value: compactDiscussionNotificationText(this.decryptBody(context.replyBody)) },
        time4: { value: formatDiscussionNotificationTime() },
      },
      lang: 'zh_CN',
    };
    let token = await this.auth.getWechatAccessToken();
    let result = await this.postSubscriptionMessage(token, body, settings.timeoutMs);
    if (tokenErrorCodes.has(result.errcode)) {
      token = await this.auth.getWechatAccessToken(true);
      result = await this.postSubscriptionMessage(token, body, settings.timeoutMs);
    }
    if (result.errcode !== 0) throw new WechatSubscribeError(result.errcode, result.errmsg);
  }

  private decryptBody(value: unknown) {
    try {
      const payload = this.encryption.decryptJson(value);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid_body');
      const body = (payload as Record<string, unknown>).body;
      if (typeof body !== 'string' || !body.trim()) throw new Error('invalid_body');
      return body;
    } catch {
      throw new Error('回复通知内容暂时无法读取');
    }
  }

  private async postSubscriptionMessage(accessToken: string, body: Record<string, unknown>, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `${this.config.get('WECHAT_OPEN_API_BASE_URL', 'https://api.weixin.qq.com')}/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
      );
      if (!response.ok) throw new Error('微信订阅消息请求失败');
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('微信订阅消息响应无效');
      const result = parsed as { errcode?: unknown; errmsg?: unknown };
      if (typeof result.errcode !== 'number' || !Number.isSafeInteger(result.errcode)) throw new Error('微信订阅消息响应无效');
      return {
        errcode: result.errcode,
        errmsg: typeof result.errmsg === 'string' ? result.errmsg.slice(0, 500) : '微信订阅消息发送失败',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async markSent(id: string, consentId: string) {
    await this.database.withTransaction(async (client) => {
      const notification = await client.query(
        `update discussion_reply_notifications
         set status = 'sent', sent_at = now(), last_error = null, updated_at = now()
         where id = $1 and status = 'sending' returning id`,
        [id],
      );
      if (!notification.rows[0]) return;
      await client.query(
        `update discussion_subscription_consents
         set consumed_at = now(), reserved_notification_id = null, reserved_at = null
         where reserved_notification_id = $1 and consumed_at is null`,
        [id],
      );
    });
  }

  private async markSkipped(id: string, consentId: string, reason: string) {
    await this.database.withTransaction(async (client) => {
      const notification = await client.query(
        `update discussion_reply_notifications
         set status = 'skipped', last_error = $2, updated_at = now()
         where id = $1 and status = 'sending' returning id`,
        [id, reason.slice(0, 1000)],
      );
      if (!notification.rows[0]) return;
      await client.query(
        `update discussion_subscription_consents
         set reserved_notification_id = null, reserved_at = null
         where id = $1 and reserved_notification_id = $2 and consumed_at is null`,
        [consentId, id],
      );
    });
  }

  private async markRetryOrFailed(id: string, attemptCount: number, reason: string, settings: ReplyNotificationSettings) {
    const failed = attemptCount >= settings.maxAttempts;
    const delaySeconds = Math.min(3_600, 30 * (2 ** Math.max(0, attemptCount - 1)));
    await this.database.withTransaction(async (client) => {
      const notification = await client.query(
        `update discussion_reply_notifications
         set status = $2, last_error = $3, updated_at = now(),
             next_attempt_at = case when $2 = 'queued' then now() + ($4 * interval '1 second') else next_attempt_at end
         where id = $1 and status = 'sending' returning id`,
        [id, failed ? 'failed' : 'queued', reason.slice(0, 1000), delaySeconds],
      );
      if (failed && notification.rows[0]) {
        await client.query(
          `update discussion_subscription_consents
           set reserved_notification_id = null, reserved_at = null
           where reserved_notification_id = $1 and consumed_at is null`,
          [id],
        );
      }
    });
  }

  private async deliver(claimed: ClaimedNotification, settings: ReplyNotificationSettings) {
    let context: DeliveryContext | null;
    try {
      context = await this.loadDeliveryContext(claimed.id);
    } catch (error) {
      await this.markRetryOrFailed(claimed.id, claimed.attemptCount, this.errorMessage(error), settings);
      return;
    }
    if (!context) return;
    if (context.replyStatus !== 'published' || context.parentStatus !== 'published') {
      await this.markSkipped(claimed.id, context.consentId, '原内容或回复已不可见');
      return;
    }
    if (context.replyUserId === context.recipientUserId) {
      await this.markSkipped(claimed.id, context.consentId, '自己回复自己不会发送通知');
      return;
    }
    if (context.restricted) {
      await this.markSkipped(claimed.id, context.consentId, '接收人当前已被限制参与讨论');
      return;
    }
    if (!context.openId || context.openId.length > 256) {
      await this.markSkipped(claimed.id, context.consentId, '接收人缺少微信 OpenID');
      return;
    }
    if (context.consumedAt || context.reservedNotificationId !== claimed.id
      || context.consentTemplateId !== settings.templateId) {
      await this.markSkipped(claimed.id, context.consentId, '订阅授权已失效或已使用');
      return;
    }
    try {
      await this.sendSubscriptionMessage(context, settings);
      await this.markSent(claimed.id, context.consentId);
    } catch (error) {
      if (error instanceof WechatSubscribeError && permanentErrorCodes.has(error.code)) {
        await this.markSkipped(claimed.id, context.consentId, error.message);
        return;
      }
      await this.markRetryOrFailed(claimed.id, claimed.attemptCount, this.errorMessage(error), settings);
    }
  }

  async processOnce() {
    if (this.processingPromise) return this.processingPromise;
    const settings = this.settings();
    if (!settings.enabled || !settings.workerEnabled || this.stopping) return { processed: 0 };
    const run = (async () => {
      const claimed = await this.claimBatch(settings.batchSize);
      for (const notification of claimed) {
        if (this.stopping) break;
        await this.deliver(notification, settings);
      }
      return { processed: claimed.length };
    })();
    this.processingPromise = run;
    try {
      return await run;
    } finally {
      this.processingPromise = null;
    }
  }

  onModuleInit() {
    const settings = this.settings();
    if (!settings.enabled || !settings.workerEnabled) return;
    this.timer = setInterval(() => {
      void this.processOnce().catch((error) => this.logger.error(`微信回复通知队列处理失败：${this.errorMessage(error)}`));
    }, settings.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') return '微信订阅消息请求超时';
    if (error instanceof Error) return error.message.slice(0, 1000);
    return '微信订阅消息发送失败';
  }
}
