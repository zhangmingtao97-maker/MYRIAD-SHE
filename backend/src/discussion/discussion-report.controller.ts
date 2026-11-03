import { BadRequestException, Body, Controller, Get, Header, InternalServerErrorException, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { PoolClient } from 'pg';
import { accountDeletedException } from '../auth/auth-errors';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { loadPublishedDiscussion } from './published-discussion';

export const discussionReportReasons = ['inappropriate', 'spam', 'privacy', 'other'] as const;
export type DiscussionReportReason = typeof discussionReportReasons[number];

export interface DiscussionReportRow {
  id: string;
  revision: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  threadBody: string | null;
  reason: DiscussionReportReason;
  detail: string | null;
  status: 'pending' | 'handled' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}

class SaveDiscussionReportDto {
  @IsString() @MaxLength(64) issueCode!: string;
  @IsString() @MaxLength(64) threadId!: string;
  @IsIn(discussionReportReasons) reason!: DiscussionReportReason;
  @IsOptional() @IsString() @MaxLength(500) detail?: string;
}

export const discussionReportColumns = `id, revision, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
  thread_id as "threadId", thread_author_snapshot as "threadAuthor", thread_body_snapshot as "threadBody",
  reason, detail, status, created_at as "createdAt", updated_at as "updatedAt"`;

@Controller('discussion/reports')
@UseGuards(UserAuthGuard)
export class DiscussionReportController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private userId(request: Request & { user?: { sub: string } }) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    return userId;
  }

  private async lockUser(client: Pick<PoolClient, 'query'>, userId: string) {
    const result = await client.query(`select id from users where id = $1 for share`, [userId]);
    if (!result.rows[0]) throw accountDeletedException();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async save(@Req() request: Request & { user?: { sub: string } }, @Body() body: SaveDiscussionReportDto) {
    const userId = this.userId(request);
    const issueCode = body.issueCode.trim();
    const threadId = body.threadId.trim();
    const detail = body.detail?.trim() || null;
    if (!issueCode || issueCode.length > 64 || !threadId || threadId.length > 64) throw new BadRequestException('举报对象无效');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const issue = await loadPublishedDiscussion(client, issueCode, '只能举报已发布期刊中的内容');
      const thread = issue.discussion.threads.find((entry) => entry.id === threadId);
      if (!thread) throw new BadRequestException('这条内容已不在本期讨论中，请刷新后再试');
      const result = await client.query<DiscussionReportRow>(
        `insert into discussion_reports
           (user_id, issue_code, issue_label_snapshot, thread_id, thread_author_snapshot, thread_body_snapshot, reason, detail, status, revision)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 1)
         on conflict (user_id, issue_code, thread_id) do update
         set issue_label_snapshot = excluded.issue_label_snapshot,
             thread_author_snapshot = excluded.thread_author_snapshot,
             thread_body_snapshot = excluded.thread_body_snapshot,
             reason = excluded.reason, detail = excluded.detail, status = 'pending',
             revision = discussion_reports.revision + 1,
             handled_by = null, handled_at = null, updated_at = now()
         returning ${discussionReportColumns}`,
        [userId, issue.issueCode, issue.issueLabel, threadId, thread.author ?? null, thread.body.slice(0, 2_000), body.reason, detail],
      );
      const row = result.rows[0];
      if (!row) throw new InternalServerErrorException('举报暂时无法保存');
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'discussion_report.created', resourceType: 'discussion_report', resourceId: row.id, metadata: { issueCode: issue.issueCode, threadId, reason: body.reason } }, client);
      return row;
    });
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  async mine(@Req() request: Request & { user?: { sub: string } }, @Query('issueCode') issueValue?: string) {
    const userId = this.userId(request);
    const issueCode = issueValue?.trim() || '';
    if (issueCode.length > 64) throw new BadRequestException('期刊编号无效');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = issueCode
        ? await client.query<DiscussionReportRow>(
          `select ${discussionReportColumns} from discussion_reports
           where user_id = $1 and issue_code = $2 order by updated_at desc, id desc limit 100`, [userId, issueCode],
        )
        : await client.query<DiscussionReportRow>(
          `select ${discussionReportColumns} from discussion_reports
           where user_id = $1 order by updated_at desc, id desc limit 100`, [userId],
        );
      return result.rows;
    });
  }
}
