import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { DatabaseService } from '../database/database.service';
import { PrivacyService } from '../privacy/privacy.service';
import { AuditService } from './audit.service';
import { parseDatabaseCount, parsePagination } from '../pagination';

@Controller('admin/privacy-requests')
@UseGuards(AdminAuthGuard)
export class AdminPrivacyController {
  constructor(private readonly database: DatabaseService, private readonly privacy: PrivacyService, private readonly audit: AuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query('limit') limitValue?: string, @Query('offset') offsetValue?: string, @Query('status') statusValue?: string, @Req() request?: Request & { user?: { sub: string } }) {
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '删除申请分页' });
    if (statusValue && !['pending', 'cancelled', 'completed', 'failed'].includes(statusValue)) {
      throw new BadRequestException('删除申请状态筛选无效');
    }
    const status = statusValue || undefined;
    const filterValues: unknown[] = status ? [status] : [];
    const filters = status ? 'where status = $1' : '';
    const pageValues: unknown[] = [...filterValues, limit, offset];
    return this.database.withTransaction(async (client) => {
      // Keep the visible page, filtered total and lifecycle summary on one
      // cloud snapshot. A publish-like admin view must not mix rows from
      // before and after a concurrent deletion request transition.
      await client.query('set transaction isolation level repeatable read');
      const result = await client.query(
        `select id, user_id as "userId", user_id is null as "accountDeleted", status,
              attempt_count as "attemptCount", next_attempt_at as "nextAttemptAt",
              last_error as "lastError",
              requested_at as "requestedAt", scheduled_for as "scheduledFor",
              cancelled_at as "cancelledAt", completed_at as "completedAt"
         from privacy_requests ${filters} order by requested_at desc, id desc limit $${filterValues.length + 1} offset $${filterValues.length + 2}`, pageValues,
      );
      const count = await client.query<{ total: string }>(`select count(*)::text as total from privacy_requests ${filters}`, filterValues);
      const summaryResult = await client.query<{
        pendingCount: string;
        duePendingCount: string;
        leasedCount: string;
        expiredLeaseCount: string;
        failedCount: string;
        completedCount: string;
        cancelledCount: string;
        oldestPendingAt: string | null;
        nextDueAt: string | null;
      }>(
        `select
         count(*) filter (where status = 'pending')::text as "pendingCount",
         count(*) filter (where status = 'pending' and scheduled_for <= now()
           and coalesce(next_attempt_at, scheduled_for) <= now()
           and (processing_started_at is null or processing_started_at <= now() - make_interval(secs => $1)))::text as "duePendingCount",
         count(*) filter (where status = 'pending' and processing_started_at > now() - make_interval(secs => $1))::text as "leasedCount",
         count(*) filter (where status = 'pending' and processing_started_at <= now() - make_interval(secs => $1))::text as "expiredLeaseCount",
         count(*) filter (where status = 'failed')::text as "failedCount",
         count(*) filter (where status = 'completed')::text as "completedCount",
         count(*) filter (where status = 'cancelled')::text as "cancelledCount",
         min(requested_at) filter (where status = 'pending') as "oldestPendingAt",
         min(
           case
             when processing_started_at is not null
               and processing_started_at > now() - make_interval(secs => $1)
             then processing_started_at + make_interval(secs => $1)
             else greatest(scheduled_for, coalesce(next_attempt_at, scheduled_for))
           end
         ) filter (where status = 'pending') as "nextDueAt"
         from privacy_requests`, [this.privacy.processingLeaseSeconds()],
      );
      const summary = summaryResult.rows[0];
      await this.audit.record({ actorType: 'admin', actorId: request?.user?.sub, action: 'privacy.requests.listed', resourceType: 'privacy_requests', metadata: { status: status ?? 'all', limit, offset } }, client);
      return {
        items: result.rows,
        total: parseDatabaseCount(count.rows[0]?.total ?? '0', '删除申请总数'),
        limit,
        offset,
        summary: {
          pendingCount: parseDatabaseCount(summary?.pendingCount ?? '0', '待处理删除申请总数'),
          duePendingCount: parseDatabaseCount(summary?.duePendingCount ?? '0', '到期删除申请总数'),
          leasedCount: parseDatabaseCount(summary?.leasedCount ?? '0', '处理中删除申请总数'),
          expiredLeaseCount: parseDatabaseCount(summary?.expiredLeaseCount ?? '0', '过期删除租约总数'),
          failedCount: parseDatabaseCount(summary?.failedCount ?? '0', '失败删除申请总数'),
          completedCount: parseDatabaseCount(summary?.completedCount ?? '0', '已完成删除申请总数'),
          cancelledCount: parseDatabaseCount(summary?.cancelledCount ?? '0', '已取消删除申请总数'),
          oldestPendingAt: summary?.oldestPendingAt ?? null,
          nextDueAt: summary?.nextDueAt ?? null,
        },
      };
    });
  }

  @Post(':id/process')
  @Header('Cache-Control', 'no-store')
  process(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.processById(id, { actorType: 'admin', actorId: request.user?.sub || 'admin:unknown' });
  }

  @Post(':id/retry')
  @Header('Cache-Control', 'no-store')
  retry(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.retryFailedById(id, { actorType: 'admin', actorId: request.user?.sub || 'admin:unknown' }).then((queued) => ({ queued }));
  }
}
