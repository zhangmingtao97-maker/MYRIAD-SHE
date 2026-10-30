import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

type DeletionProcessResult =
  | { outcome: 'completed'; processed: true }
  | { outcome: 'retry_scheduled' | 'failed'; processed: false; attemptCount: number }
  | { outcome: 'disabled' | 'not_ready' | 'recovery_unavailable'; processed: false };

@Injectable()
export class PrivacyService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private processingDue = false;
  private processingPromise: Promise<{ processed: number }> | null = null;
  private stopping = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  private featureEnabled() {
    return this.config.get<string>('ACCOUNT_DELETION_ENABLED', 'true') === 'true';
  }

  private workerEnabled() {
    return this.config.get<string>('ACCOUNT_DELETION_WORKER_ENABLED', 'true') === 'true';
  }

  private positiveInteger(key: string, fallback: number) {
    const value = Number(this.config.get(key, fallback));
    const maximum = key === 'ACCOUNT_DELETION_RETRY_BASE_SECONDS'
      ? 86_400
      : key === 'ACCOUNT_DELETION_RETRY_MAX_SECONDS'
        ? 604_800
        : key === 'ACCOUNT_DELETION_PROCESSING_LEASE_SECONDS'
          ? 86_400
          : key === 'ACCOUNT_DELETION_MAX_ATTEMPTS'
            ? 100
            : fallback;
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
  }

  processingLeaseSeconds() {
    return this.positiveInteger('ACCOUNT_DELETION_PROCESSING_LEASE_SECONDS', 300);
  }

  private retryDelaySeconds(attempt: number) {
    const base = this.positiveInteger('ACCOUNT_DELETION_RETRY_BASE_SECONDS', 30);
    const maximum = this.positiveInteger('ACCOUNT_DELETION_RETRY_MAX_SECONDS', 3600);
    const exponent = Math.min(31, Math.max(0, Math.floor(attempt) - 1));
    return Math.min(maximum, base * (2 ** exponent));
  }

  onModuleInit() {
    if (!this.featureEnabled() || !this.workerEnabled()) return;
    const configuredInterval = Number(this.config.get('ACCOUNT_DELETION_POLL_INTERVAL_MS', 60_000));
    const interval = Number.isFinite(configuredInterval) ? Math.min(Math.max(Math.floor(configuredInterval), 10_000), 3_600_000) : 60_000;
    this.timer = setInterval(() => void this.processDue().catch(() => undefined), interval);
    void this.processDue().catch(() => undefined);
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    return this.processingPromise ?? Promise.resolve();
  }

  async processDue(limit = 20) {
    if (this.stopping || this.processingDue) return { processed: 0 };
    this.processingDue = true;
    const run = (async () => {
      try {
        if (!this.featureEnabled()) return { processed: 0 };
        const leaseSeconds = this.processingLeaseSeconds();
        const result = await this.database.query<{ id: string }>(
          `select id from privacy_requests
           where status = 'pending' and scheduled_for <= now()
             and coalesce(next_attempt_at, scheduled_for) <= now()
             and (processing_started_at is null or processing_started_at <= now() - make_interval(secs => $2))
           order by scheduled_for asc limit $1`, [Math.min(Math.max(limit, 1), 100), leaseSeconds],
        );
        let processed = 0;
        for (const row of result.rows) {
          if ((await this.processById(row.id)).processed) processed += 1;
        }
        return { processed };
      } finally {
        this.processingDue = false;
        this.processingPromise = null;
      }
    })();
    this.processingPromise = run;
    return run;
  }

  async processById(requestId: string, actor: { actorType: 'admin' | 'system'; actorId: string } = { actorType: 'system', actorId: 'privacy-worker' }): Promise<DeletionProcessResult> {
    if (!this.featureEnabled()) return { outcome: 'disabled', processed: false };
    const leaseSeconds = this.processingLeaseSeconds();
    try {
      const processed = await this.database.withTransaction(async (client) => {
        // Read a candidate without locking it. The lock order below is
        // account -> observations -> privacy request, matching data export.
        const candidate = await client.query<{
          id: string;
          user_id: string | null;
          status: string;
          due: boolean;
        }>(
          `select id, user_id, status,
                  scheduled_for <= now() and coalesce(next_attempt_at, scheduled_for) <= now()
                    and (processing_started_at is null or processing_started_at <= now() - make_interval(secs => $2)) as due
           from privacy_requests where id = $1`, [requestId, leaseSeconds],
        );
        const candidateRow = candidate.rows[0];
        if (!candidateRow || candidateRow.status !== 'pending' || !candidateRow.due) return false;

        const reconcileOrphan = async () => {
          const reconciled = await client.query(
            `update privacy_requests
             set status = 'completed', user_id = null, completed_at = coalesce(completed_at, now()),
                 processing_started_at = null, last_error = null
             where id = $1 and status = 'pending' returning id`, [requestId],
          );
          if (!reconciled.rows[0]) return false;
          await this.audit.record({
            actorType: actor.actorType,
            actorId: actor.actorId,
            action: 'privacy.deletion.orphan_reconciled',
            resourceType: 'privacy_request',
            resourceId: requestId,
            metadata: { reason: 'account_already_absent' },
          }, client);
          return true;
        };

        if (!candidateRow.user_id) {
          const request = await client.query<{ id: string; user_id: string | null; status: string; due: boolean }>(
            `select id, user_id, status,
                    scheduled_for <= now() and coalesce(next_attempt_at, scheduled_for) <= now()
                      and (processing_started_at is null or processing_started_at <= now() - make_interval(secs => $2)) as due
             from privacy_requests where id = $1 for update`, [requestId, leaseSeconds],
          );
          const row = request.rows[0];
          if (!row || row.status !== 'pending' || !row.due) return false;
          return row.user_id ? false : reconcileOrphan();
        }

        const userLock = await client.query<{ id: string; avatarObjectKey: string | null }>(
          `select id, avatar_object_key as "avatarObjectKey" from users where id = $1 for update`, [candidateRow.user_id],
        );
        if (!userLock.rows[0]) {
          const request = await client.query<{ id: string; user_id: string | null; status: string; due: boolean }>(
            `select id, user_id, status,
                    scheduled_for <= now() and coalesce(next_attempt_at, scheduled_for) <= now()
                      and (processing_started_at is null or processing_started_at <= now() - make_interval(secs => $2)) as due
             from privacy_requests where id = $1 for update`, [requestId, leaseSeconds],
          );
          const row = request.rows[0];
          if (!row || row.status !== 'pending' || !row.due) return false;
          return reconcileOrphan();
        }

        // Lock observation rows before the request so cancellation or a
        // duplicate worker can be rechecked without deleting any data.
        await client.query(`select id from observations where user_id = $1 for update`, [candidateRow.user_id]);
        const request = await client.query<{ id: string; user_id: string | null; status: string; attempt_count: number; due: boolean }>(
          `select id, user_id, status, attempt_count,
                  scheduled_for <= now() and coalesce(next_attempt_at, scheduled_for) <= now()
                    and (processing_started_at is null or processing_started_at <= now() - make_interval(secs => $2)) as due
           from privacy_requests where id = $1 for update`, [requestId, leaseSeconds],
        );
        const row = request.rows[0];
        if (!row || row.status !== 'pending' || !row.due || row.user_id !== candidateRow.user_id) return false;

        await client.query(
          `update privacy_requests
           set attempt_count = attempt_count + 1, processing_started_at = now(), last_error = null
           where id = $1`, [requestId],
        );

        await client.query(
          `insert into audit_logs (actor_type, actor_id, action, resource_type, resource_id, metadata)
           values ($1, $2, 'privacy.deletion.started', 'privacy_request', $3, '{}'::jsonb)`,
          [actor.actorType, actor.actorId, requestId],
        );
        const avatarObjectKey = userLock.rows[0].avatarObjectKey;
        if (avatarObjectKey && avatarObjectKey.startsWith(`users/avatars/${candidateRow.user_id}/`) && this.storage) {
          await this.storage.deleteObject(avatarObjectKey);
        }
        await client.query(`delete from observations where user_id = $1`, [candidateRow.user_id]);
        await client.query(
          `update privacy_requests
           set status = 'completed', user_id = null, completed_at = now(), processing_started_at = null, last_error = null
           where id = $1`, [requestId],
        );
        await client.query(`delete from users where id = $1`, [candidateRow.user_id]);
        // Redact after deleting the user so audit writes from concurrent authenticated requests are included.
        await client.query(
          `update audit_logs set actor_id = null,
             resource_id = case when resource_type = 'privacy_request' then resource_id else null end
           where actor_id = $1 or (resource_type = 'user_settings' and resource_id = $1)`, [candidateRow.user_id],
        );
        await client.query(
          `insert into audit_logs (actor_type, actor_id, action, resource_type, resource_id, metadata)
           values ($1, $2, 'privacy.deletion.completed', 'privacy_request', $3, '{}'::jsonb)`,
          [actor.actorType, actor.actorId, requestId],
        );
        return true;
      });
      return processed ? { outcome: 'completed', processed: true } : { outcome: 'not_ready', processed: false };
    } catch {
      const maxAttempts = this.positiveInteger('ACCOUNT_DELETION_MAX_ATTEMPTS', 10);
      let attempt: { attemptCount: number; status: string } | undefined;
      try {
        attempt = await this.database.withTransaction(async (client) => {
          const result = await client.query<{ attemptCount: number; status: string }>(
            `update privacy_requests
             set attempt_count = attempt_count + 1,
                 processing_started_at = null,
                 last_error = 'processing_failed',
                 status = case when attempt_count + 1 >= $2 then 'failed' else 'pending' end
             where id = $1 and status = 'pending'
             returning attempt_count as "attemptCount", status`, [requestId, maxAttempts],
          );
          const row = result.rows[0];
          if (row?.status === 'pending') {
            await client.query(
              `update privacy_requests set next_attempt_at = now() + make_interval(secs => $2) where id = $1`,
              [requestId, this.retryDelaySeconds(row.attemptCount)],
            );
          }
          return row;
        });
      } catch {
        return { outcome: 'recovery_unavailable', processed: false };
      }
      if (!attempt) return { outcome: 'not_ready', processed: false };
      try {
        await this.audit.record({
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: 'privacy.deletion.failed',
          resourceType: 'privacy_request',
          resourceId: requestId,
          metadata: { attemptCount: attempt.attemptCount, status: attempt.status },
        });
      } catch {
        // The retry state is already durable; do not report it as unrecorded.
      }
      return attempt.status === 'failed'
        ? { outcome: 'failed', processed: false, attemptCount: attempt.attemptCount }
        : { outcome: 'retry_scheduled', processed: false, attemptCount: attempt.attemptCount };
    }
  }

  async retryFailedById(requestId: string, actor: { actorType: 'admin'; actorId: string }) {
    if (!this.featureEnabled()) return false;
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ id: string; status: string; attemptCount: number }>(
        `select id, status, attempt_count as "attemptCount"
         from privacy_requests where id = $1 for update`, [requestId],
      );
      const row = current.rows[0];
      if (!row || row.status !== 'failed') return false;
      await client.query(
        `update privacy_requests
         set status = 'pending', attempt_count = 0, next_attempt_at = now(),
             processing_started_at = null, last_error = null, completed_at = null
         where id = $1`, [requestId],
      );
      await this.audit.record({
        actorType: actor.actorType,
        actorId: actor.actorId,
        action: 'privacy.deletion.retry_requested',
        resourceType: 'privacy_request',
        resourceId: requestId,
        metadata: { previousAttemptCount: row.attemptCount },
      }, client);
      return true;
    });
  }
}
