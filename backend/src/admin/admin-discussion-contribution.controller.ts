import { BadRequestException, Body, ConflictException, Controller, Get, Header, InternalServerErrorException, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Min } from 'class-validator';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from './audit.service';
import { DatabaseService } from '../database/database.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import { parseDatabaseCount, parsePagination } from '../pagination';

type ContributionStatus = 'pending' | 'handled' | 'dismissed';
interface AdminContributionRow {
  id: string;
  revision: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  status: ContributionStatus;
  createdAt: Date;
  updatedAt: Date;
}

class UpdateDiscussionContributionStatusDto {
  @IsIn(['pending', 'handled', 'dismissed']) status!: ContributionStatus;
  @IsInt() @Min(1) revision!: number;
}

const listColumns = `id, revision, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
  thread_id as "threadId", thread_author_snapshot as "threadAuthor", status,
  created_at as "createdAt", updated_at as "updatedAt"`;

@Controller('admin/discussion-contributions')
@UseGuards(AdminAuthGuard)
export class AdminDiscussionContributionController {
  constructor(
    private readonly database: DatabaseService,
    private readonly encryption: DataEncryptionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query('status') status?: string, @Query('issueCode') issueValue?: string, @Query('limit') limitValue?: string, @Query('offset') offsetValue?: string) {
    if (status && !['pending', 'handled', 'dismissed'].includes(status)) throw new BadRequestException('经历状态筛选无效');
    const issueCode = issueValue?.trim() || '';
    if (issueCode.length > 64) throw new BadRequestException('期刊编号筛选无效');
    const filters: string[] = [];
    const values: unknown[] = [];
    if (status) { values.push(status); filters.push(`status = $${values.length}`); }
    if (issueCode) { values.push(issueCode); filters.push(`issue_code = $${values.length}`); }
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '用户经历分页' });
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageValues = [...values, limit, offset];
      const [records, count] = await Promise.all([
        client.query<AdminContributionRow>(
          `select ${listColumns} from discussion_contributions ${where}
           order by updated_at desc, id desc limit $${pageValues.length - 1} offset $${pageValues.length}`, pageValues,
        ),
        client.query<{ total: string }>(`select count(*)::text as total from discussion_contributions ${where}`, values),
      ]);
      return { items: records.rows, total: parseDatabaseCount(count.rows[0]?.total ?? '0', '用户经历总数'), limit, offset };
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<AdminContributionRow & { body: unknown }>(
        `select ${listColumns}, body
         from discussion_contributions where id = $1`, [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      let body: unknown;
      try {
        const payload = this.encryption.decryptJson(row.body);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).body !== 'string') throw new Error('invalid_contribution_body');
        body = (payload as { body: string }).body;
      } catch {
        throw new InternalServerErrorException('经历内容无法解密');
      }
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub || 'admin:unknown', action: 'discussion_contribution.admin.viewed', resourceType: 'discussion_contribution', resourceId: id, metadata: { issueCode: row.issueCode, status: row.status } }, client);
      return { ...row, body };
    });
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  async updateStatus(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDiscussionContributionStatusDto) {
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<AdminContributionRow>(
        `select ${listColumns} from discussion_contributions where id = $1 for update`, [id],
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (!Number.isSafeInteger(body.revision) || row.revision !== body.revision) {
        throw new ConflictException({ code: 'discussion_contribution_changed', message: '这条经历已在其他位置更新，请重新读取后再处理。' });
      }
      if (row.status === body.status) return row;
      const result = await client.query<AdminContributionRow>(
        `update discussion_contributions
         set status = $1, revision = revision + 1,
             handled_by = case when $1 = 'pending' then null else $2 end,
             handled_at = case when $1 = 'pending' then null else now() end,
             updated_at = now()
         where id = $3 returning ${listColumns}`,
        [body.status, body.status === 'pending' ? null : request.user?.sub || 'admin:unknown', id],
      );
      const updated = result.rows[0];
      if (updated) await this.audit.record({ actorType: 'admin', actorId: request.user?.sub || 'admin:unknown', action: 'discussion_contribution.status.updated', resourceType: 'discussion_contribution', resourceId: id, metadata: { from: row.status, to: body.status } }, client);
      return updated ?? null;
    });
  }
}
