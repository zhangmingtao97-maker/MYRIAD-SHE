import { BadRequestException, Body, ConflictException, Controller, Get, Header, InternalServerErrorException, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from './audit.service';
import { DatabaseService } from '../database/database.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import { DiscussionReplyNotificationService } from '../discussion/discussion-reply-notification.service';
import { parseDatabaseCount, parsePagination } from '../pagination';

type ContributionStatus = 'pending' | 'handled' | 'dismissed';
type PublicationStatus = 'pending' | 'published' | 'hidden' | 'rejected';

interface AdminContributionRow {
  id: string;
  revision: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  parentContributionId: string | null;
  status: ContributionStatus;
  publicationStatus: PublicationStatus;
  userId: string;
  nickname: string | null;
  featuredAt: Date | null;
  featuredOrder: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

class UpdateDiscussionContributionStatusDto {
  @IsIn(['pending', 'handled', 'dismissed']) status!: ContributionStatus;
  @IsInt() @Min(1) revision!: number;
}

class UpdateDiscussionContributionPublicationDto {
  @IsIn(['pending', 'published', 'hidden', 'rejected']) publicationStatus!: PublicationStatus;
  @IsInt() @Min(1) revision!: number;
}

class UpdateDiscussionContributionFeaturedDto {
  @IsBoolean() featured!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) featuredOrder?: number;
  @IsInt() @Min(1) revision!: number;
}

const contributionColumns = `contribution.id, contribution.revision, contribution.issue_code as "issueCode",
  contribution.issue_label_snapshot as "issueLabel", contribution.thread_id as "threadId",
  contribution.thread_author_snapshot as "threadAuthor", contribution.parent_contribution_id as "parentContributionId", contribution.status,
  contribution.publication_status as "publicationStatus", contribution.user_id as "userId",
  users.nickname, contribution.published_at as "publishedAt", contribution.featured_at as "featuredAt",
  contribution.featured_order as "featuredOrder", contribution.created_at as "createdAt",
  contribution.updated_at as "updatedAt"`;

const updateReturningColumns = `id, revision, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
  thread_id as "threadId", thread_author_snapshot as "threadAuthor", parent_contribution_id as "parentContributionId", status,
  publication_status as "publicationStatus", user_id as "userId", published_at as "publishedAt",
  featured_at as "featuredAt", featured_order as "featuredOrder", created_at as "createdAt", updated_at as "updatedAt"`;

const publicationStats: PublicationStatus[] = ['pending', 'published', 'hidden', 'rejected'];

function statusForPublication(publicationStatus: PublicationStatus): ContributionStatus {
  if (publicationStatus === 'pending') return 'pending';
  if (publicationStatus === 'rejected') return 'dismissed';
  return 'handled';
}

@Controller('admin/discussion-contributions')
@UseGuards(AdminAuthGuard)
export class AdminDiscussionContributionController {
  constructor(
    private readonly database: DatabaseService,
    private readonly encryption: DataEncryptionService,
    private readonly audit: AuditService,
    private readonly replyNotifications: DiscussionReplyNotificationService,
  ) {}

  private previewOf(body: unknown) {
    try {
      const payload = this.encryption.decryptJson(body);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).body !== 'string') return '';
      const text = (payload as { body: string }).body.replace(/\s+/g, ' ').trim();
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    } catch {
      return '';
    }
  }

  private withNickname(row: Omit<AdminContributionRow, 'nickname'> & { nickname?: string | null }, nickname: string | null) {
    return { ...row, nickname: row.nickname ?? nickname };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query('status') status?: string,
    @Query('publicationStatus') publicationStatusValue?: string,
    @Query('issueCode') issueValue?: string,
    @Query('kind') kindValue?: string,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    if (status && !['pending', 'handled', 'dismissed'].includes(status)) throw new BadRequestException('经历状态筛选无效');
    const publicationStatus = publicationStatusValue?.trim() || '';
    if (publicationStatus && !publicationStats.includes(publicationStatus as PublicationStatus)) throw new BadRequestException('发布状态筛选无效');
    const issueCode = issueValue?.trim() || '';
    if (issueCode.length > 64) throw new BadRequestException('期刊编号筛选无效');
    const kind = kindValue === 'experience' || kindValue === 'reply' ? kindValue : '';
    if (kindValue && !kind && kindValue !== 'all') throw new BadRequestException('内容类型筛选无效');
    const filters: string[] = [];
    const values: unknown[] = [];
    if (status) { values.push(status); filters.push(`contribution.status = $${values.length}`); }
    if (publicationStatus) { values.push(publicationStatus); filters.push(`contribution.publication_status = $${values.length}`); }
    if (issueCode) { values.push(issueCode); filters.push(`contribution.issue_code = $${values.length}`); }
    if (kind === 'experience') filters.push(`contribution.thread_id = ''`);
    if (kind === 'reply') filters.push(`contribution.thread_id <> ''`);
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '讨论内容分页' });
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageValues = [...values, limit, offset];
      const [records, count, summaryResult] = await Promise.all([
        client.query<AdminContributionRow & { body: unknown }>(
          `select ${contributionColumns}, contribution.body
           from discussion_contributions contribution
           left join users on users.id = contribution.user_id
           ${where}
           order by contribution.updated_at desc, contribution.id desc
           limit $${pageValues.length - 1} offset $${pageValues.length}`, pageValues,
        ),
        client.query<{ total: string }>(
          `select count(*)::text as total from discussion_contributions contribution ${where}`, values,
        ),
        client.query<{ publicationStatus: PublicationStatus; total: string }>(
          `select publication_status as "publicationStatus", count(*)::text as total
           from discussion_contributions group by publication_status`,
        ),
      ]);
      const summary: Record<PublicationStatus, number> = { pending: 0, published: 0, hidden: 0, rejected: 0 };
      for (const row of summaryResult.rows) summary[row.publicationStatus] = parseDatabaseCount(row.total, '发布状态数量');
      return {
        items: records.rows.map(({ body, ...row }) => ({ ...row, bodyPreview: this.previewOf(body) })),
        total: parseDatabaseCount(count.rows[0]?.total ?? '0', '讨论内容总数'),
        limit,
        offset,
        summary,
      };
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<AdminContributionRow & { body: unknown }>(
        `select ${contributionColumns}, contribution.body
         from discussion_contributions contribution
         left join users on users.id = contribution.user_id
         where contribution.id = $1`, [id],
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
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub || 'admin:unknown', action: 'discussion_contribution.admin.viewed', resourceType: 'discussion_contribution', resourceId: id, metadata: { issueCode: row.issueCode, status: row.status, publicationStatus: row.publicationStatus } }, client);
      return { ...row, body, bodyPreview: this.previewOf(row.body) };
    });
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  async updateStatus(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDiscussionContributionStatusDto) {
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<AdminContributionRow>(
        `select ${contributionColumns}
         from discussion_contributions contribution
         left join users on users.id = contribution.user_id
         where contribution.id = $1 for update of contribution`, [id],
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (!Number.isSafeInteger(body.revision) || row.revision !== body.revision) {
        throw new ConflictException({ code: 'discussion_contribution_changed', message: '这条内容已在其他位置更新，请重新读取后再处理。' });
      }
      if (row.status === body.status) return row;
      const actor = request.user?.sub || 'admin:unknown';
      const result = await client.query<Omit<AdminContributionRow, 'nickname'>>(
        `update discussion_contributions
         set status = $1, revision = revision + 1,
             handled_by = case when $1 = 'pending' then null else $2 end,
             handled_at = case when $1 = 'pending' then null else now() end,
             updated_at = now()
         where id = $3 returning ${updateReturningColumns}`,
        [body.status, body.status === 'pending' ? null : actor, id],
      );
      const updated = result.rows[0];
      if (!updated) return null;
      await this.audit.record({ actorType: 'admin', actorId: actor, action: 'discussion_contribution.status.updated', resourceType: 'discussion_contribution', resourceId: id, metadata: { from: row.status, to: body.status } }, client);
      return this.withNickname(updated, row.nickname);
    });
  }

  @Patch(':id/publication')
  @Header('Cache-Control', 'no-store')
  async updatePublication(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDiscussionContributionPublicationDto) {
    const actor = request.user?.sub || 'admin:unknown';
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<AdminContributionRow>(
        `select ${contributionColumns}
         from discussion_contributions contribution
         left join users on users.id = contribution.user_id
         where contribution.id = $1 for update of contribution`, [id],
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (!Number.isSafeInteger(body.revision) || row.revision !== body.revision) {
        throw new ConflictException({ code: 'discussion_contribution_changed', message: '这条内容已在其他位置更新，请重新读取后再处理。' });
      }
      const nextStatus = statusForPublication(body.publicationStatus);
      if (row.publicationStatus === body.publicationStatus && row.status === nextStatus) return row;
      const result = await client.query<Omit<AdminContributionRow, 'nickname'>>(
        `update discussion_contributions
         set publication_status = $1,
             status = $2,
             revision = revision + 1,
             published_at = case when $1 = 'published' then coalesce(published_at, now()) else published_at end,
             published_by = case when $1 = 'published' then $3 else published_by end,
             featured_at = case when $1 = 'published' then featured_at else null end,
             featured_by = case when $1 = 'published' then featured_by else null end,
             featured_order = case when $1 = 'published' then featured_order else 0 end,
             handled_by = case when $2 = 'pending' then null else $3 end,
             handled_at = case when $2 = 'pending' then null else now() end,
             updated_at = now()
         where id = $4 returning ${updateReturningColumns}`,
        [body.publicationStatus, nextStatus, nextStatus === 'pending' ? null : actor, id],
      );
      const updated = result.rows[0];
      if (!updated) return null;
      if (row.publicationStatus !== 'published' && body.publicationStatus === 'published' && row.parentContributionId) {
        await client.query('savepoint discussion_reply_notification');
        try {
          await this.replyNotifications.enqueueForPublishedReply(client, id);
          await client.query('release savepoint discussion_reply_notification');
        } catch {
          await client.query('rollback to savepoint discussion_reply_notification');
          await client.query('release savepoint discussion_reply_notification');
        }
      }
      await this.audit.record({ actorType: 'admin', actorId: actor, action: 'discussion_contribution.publication.updated', resourceType: 'discussion_contribution', resourceId: id, metadata: { from: row.publicationStatus, to: body.publicationStatus, legacyStatusFrom: row.status, legacyStatusTo: nextStatus } }, client);
      return this.withNickname(updated, row.nickname);
    });
  }

  @Patch(':id/featured')
  @Header('Cache-Control', 'no-store')
  async updateFeatured(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDiscussionContributionFeaturedDto) {
    const actor = request.user?.sub || 'admin:unknown';
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<AdminContributionRow>(
        `select ${contributionColumns}
         from discussion_contributions contribution
         left join users on users.id = contribution.user_id
         where contribution.id = $1 for update of contribution`, [id],
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (!Number.isSafeInteger(body.revision) || row.revision !== body.revision) {
        throw new ConflictException({ code: 'discussion_contribution_changed', message: '这条内容已在其他位置更新，请重新读取后再处理。' });
      }
      if (body.featured && row.publicationStatus !== 'published') throw new BadRequestException('只有审核通过并已公开的主经历可以设为精华');
      if (body.featured && row.threadId) throw new BadRequestException('回复留言不能设为精华');
      const currentlyFeatured = Boolean(row.featuredAt);
      const nextOrder = body.featured ? (body.featuredOrder ?? row.featuredOrder) : 0;
      if (currentlyFeatured === body.featured && row.featuredOrder === nextOrder) return row;
      const result = await client.query<Omit<AdminContributionRow, 'nickname'>>(
        `update discussion_contributions
         set featured_at = case when $1 then coalesce(featured_at, now()) else null end,
             featured_by = case when $1 then $2 else null end,
             featured_order = $3,
             revision = revision + 1,
             updated_at = now()
         where id = $4 returning ${updateReturningColumns}`,
        [body.featured, actor, nextOrder, id],
      );
      const updated = result.rows[0];
      if (!updated) return null;
      await this.audit.record({ actorType: 'admin', actorId: actor, action: 'discussion_contribution.featured.updated', resourceType: 'discussion_contribution', resourceId: id, metadata: { from: currentlyFeatured, to: body.featured, orderFrom: row.featuredOrder, orderTo: nextOrder } }, client);
      return this.withNickname(updated, row.nickname);
    });
  }
}
