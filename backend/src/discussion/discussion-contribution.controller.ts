import { BadRequestException, Body, Controller, Delete, Get, Header, InternalServerErrorException, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { PoolClient } from 'pg';
import { accountDeletedException } from '../auth/auth-errors';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { defaultDiscussionContent, DiscussionContent, validateDiscussionContent } from '../content/discussion-content';
import { DataEncryptionService } from '../security/data-encryption.service';

interface ContributionRow {
  id: string;
  revision: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  body: unknown;
  status: 'pending' | 'handled' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}

class SaveDiscussionContributionDto {
  @IsString() @MaxLength(64) issueCode!: string;
  @IsOptional() @IsString() @MaxLength(64) threadId?: string;
  @IsString() @MaxLength(2_000) body!: string;
}

const contributionColumns = `id, revision, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
  thread_id as "threadId", thread_author_snapshot as "threadAuthor", body, status,
  created_at as "createdAt", updated_at as "updatedAt"`;

@Controller('discussion/contributions')
@UseGuards(UserAuthGuard)
export class DiscussionContributionController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: DataEncryptionService,
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

  private present(row: ContributionRow) {
    try {
      const payload = this.encryption.decryptJson(row.body);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).body !== 'string') {
        throw new Error('invalid_contribution_body');
      }
      return { ...row, body: (payload as { body: string }).body };
    } catch {
      throw new InternalServerErrorException('经历内容暂时无法读取');
    }
  }

  private async publishedIssue(client: Pick<PoolClient, 'query'>, issueCode: string) {
    const result = await client.query<{ issueCode: string; issueLabel: string; discussion: unknown }>(
      `select coalesce(publication.snapshot->'issue'->>'code', issue.code) as "issueCode",
              coalesce(publication.snapshot->'issue'->>'label', issue.label) as "issueLabel",
              publication.snapshot->'discussion' as discussion
       from content_issues issue
       left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)`, [issueCode],
    );
    if (!result.rows[0]) throw new BadRequestException('只能保存已发布期刊中的经历');
    let discussion: DiscussionContent;
    try {
      discussion = result.rows[0].discussion ? validateDiscussionContent(result.rows[0].discussion) : defaultDiscussionContent();
    } catch {
      throw new BadRequestException('本期讨论内容暂时无法使用');
    }
    return { ...result.rows[0], discussion };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async listMine(@Req() request: Request & { user?: { sub: string } }) {
    const userId = this.userId(request);
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query<ContributionRow>(
        `select ${contributionColumns} from discussion_contributions where user_id = $1
         order by updated_at desc, id desc limit 100`, [userId],
      );
      return result.rows.map((row) => this.present(row));
    });
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  async mine(@Req() request: Request & { user?: { sub: string } }, @Query('issueCode') issueValue?: string, @Query('threadId') threadValue?: string) {
    const userId = this.userId(request);
    const issueCode = issueValue?.trim() || '';
    const threadId = threadValue?.trim() || '';
    if (!issueCode || issueCode.length > 64 || threadId.length > 64) throw new BadRequestException('期刊或回复对象无效');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query<ContributionRow>(
        `select ${contributionColumns} from discussion_contributions
         where user_id = $1 and issue_code = $2 and thread_id = $3`, [userId, issueCode, threadId],
      );
      return result.rows[0] ? this.present(result.rows[0]) : null;
    });
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async save(@Req() request: Request & { user?: { sub: string } }, @Body() body: SaveDiscussionContributionDto) {
    const userId = this.userId(request);
    const issueCode = body.issueCode.trim();
    const threadId = body.threadId?.trim() || '';
    const text = body.body.trim();
    if (!issueCode || issueCode.length > 64 || threadId.length > 64 || !text || text.length > 2_000) {
      throw new BadRequestException('请填写不超过 2000 字的经历');
    }
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const issue = await this.publishedIssue(client, issueCode);
      const thread = threadId ? issue.discussion.threads.find((entry) => entry.id === threadId) : undefined;
      if (threadId && !thread) throw new BadRequestException('回复对象已不在本期讨论中');
      const result = await client.query<ContributionRow>(
        `insert into discussion_contributions
           (user_id, issue_code, issue_label_snapshot, thread_id, thread_author_snapshot, body, status, revision)
         values ($1, $2, $3, $4, $5, $6, 'pending', 1)
         on conflict (user_id, issue_code, thread_id) do update
         set issue_label_snapshot = excluded.issue_label_snapshot,
             thread_author_snapshot = excluded.thread_author_snapshot,
             body = excluded.body, status = 'pending', revision = discussion_contributions.revision + 1,
             handled_by = null, handled_at = null, updated_at = now()
         returning ${contributionColumns}`,
        [userId, issue.issueCode, issue.issueLabel, threadId, thread?.author ?? null, JSON.stringify(this.encryption.encryptJson({ body: text }))],
      );
      const row = result.rows[0];
      if (!row) throw new InternalServerErrorException('经历暂时无法保存');
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'discussion_contribution.saved', resourceType: 'discussion_contribution', resourceId: row.id, metadata: { issueCode: issue.issueCode, hasThread: Boolean(threadId), status: row.status } }, client);
      return this.present(row);
    });
  }

  @Delete('mine')
  @Header('Cache-Control', 'no-store')
  async remove(@Req() request: Request & { user?: { sub: string } }, @Query('issueCode') issueValue?: string, @Query('threadId') threadValue?: string) {
    const userId = this.userId(request);
    const issueCode = issueValue?.trim() || '';
    const threadId = threadValue?.trim() || '';
    if (!issueCode || issueCode.length > 64 || threadId.length > 64) throw new BadRequestException('期刊或回复对象无效');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query<{ id: string }>(
        `delete from discussion_contributions where user_id = $1 and issue_code = $2 and thread_id = $3 returning id`, [userId, issueCode, threadId],
      );
      const id = result.rows[0]?.id;
      if (id) await this.audit.record({ actorType: 'user', actorId: userId, action: 'discussion_contribution.deleted', resourceType: 'discussion_contribution', resourceId: id }, client);
      return { deleted: Boolean(id) };
    });
  }
}
