import { BadRequestException, Body, ConflictException, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Min } from 'class-validator';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from './audit.service';
import { DatabaseService } from '../database/database.service';
import { parseDatabaseCount, parsePagination } from '../pagination';
import { DiscussionReportRow, discussionReportColumns } from '../discussion/discussion-report.controller';

type ReportStatus = 'pending' | 'handled' | 'dismissed';

class UpdateDiscussionReportStatusDto {
  @IsIn(['pending', 'handled', 'dismissed']) status!: ReportStatus;
  @IsInt() @Min(1) revision!: number;
}

@Controller('admin/discussion-reports')
@UseGuards(AdminAuthGuard)
export class AdminDiscussionReportController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query('status') status?: string, @Query('issueCode') issueValue?: string, @Query('limit') limitValue?: string, @Query('offset') offsetValue?: string) {
    if (status && !['pending', 'handled', 'dismissed'].includes(status)) throw new BadRequestException('举报状态筛选无效');
    const issueCode = issueValue?.trim() || '';
    if (issueCode.length > 64) throw new BadRequestException('期刊编号筛选无效');
    const filters: string[] = [];
    const values: unknown[] = [];
    if (status) { values.push(status); filters.push(`status = $${values.length}`); }
    if (issueCode) { values.push(issueCode); filters.push(`issue_code = $${values.length}`); }
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '举报分页' });
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageValues = [...values, limit, offset];
      const [records, count, summary] = await Promise.all([
        client.query<DiscussionReportRow>(
          `select ${discussionReportColumns} from discussion_reports ${where}
           order by updated_at desc, id desc limit $${pageValues.length - 1} offset $${pageValues.length}`, pageValues,
        ),
        client.query<{ total: string }>(`select count(*)::text as total from discussion_reports ${where}`, values),
        client.query<{ status: ReportStatus; total: string }>(`select status, count(*)::text as total from discussion_reports group by status`),
      ]);
      const counts: Record<ReportStatus, number> = { pending: 0, handled: 0, dismissed: 0 };
      for (const row of summary.rows) counts[row.status] = parseDatabaseCount(row.total, '举报数量');
      return { items: records.rows, total: parseDatabaseCount(count.rows[0]?.total ?? '0', '举报总数'), limit, offset, summary: counts };
    });
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  async updateStatus(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDiscussionReportStatusDto) {
    const actor = request.user?.sub || 'admin:unknown';
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<DiscussionReportRow>(
        `select ${discussionReportColumns} from discussion_reports where id = $1 for update`, [id],
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (!Number.isSafeInteger(body.revision) || row.revision !== body.revision) {
        throw new ConflictException({ code: 'discussion_report_changed', message: '这条举报已在其他位置更新，请重新读取后再处理。' });
      }
      if (row.status === body.status) return row;
      const result = await client.query<DiscussionReportRow>(
        `update discussion_reports
         set status = $1, revision = revision + 1,
             handled_by = case when $1 = 'pending' then null else $2 end,
             handled_at = case when $1 = 'pending' then null else now() end,
             updated_at = now()
         where id = $3 returning ${discussionReportColumns}`,
        [body.status, body.status === 'pending' ? null : actor, id],
      );
      const updated = result.rows[0] ?? null;
      if (updated) await this.audit.record({ actorType: 'admin', actorId: actor, action: 'discussion_report.status.updated', resourceType: 'discussion_report', resourceId: id, metadata: { from: row.status, to: body.status } }, client);
      return updated;
    });
  }
}
