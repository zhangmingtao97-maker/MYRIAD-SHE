import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, InternalServerErrorException, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { PoolClient } from 'pg';
import { accountDeletedException } from '../auth/auth-errors';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import { loadPublishedDiscussion } from './published-discussion';
import { DiscussionReplyNotificationService } from './discussion-reply-notification.service';
import { findActiveDiscussionRestriction } from './discussion-restrictions';

interface ContributionRow {
  id: string;
  revision: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  parentContributionId: string | null;
  body: unknown;
  status: 'pending' | 'handled' | 'dismissed';
  publicationStatus: 'pending' | 'published' | 'hidden' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

interface ReplyTargetRow {
  id: string;
  userId: string;
  issueCode: string;
  threadId: string;
  nickname: string | null;
}

class SaveDiscussionContributionDto {
  @IsString() @MaxLength(64) issueCode!: string;
  @IsOptional() @IsString() @MaxLength(64) threadId?: string;
  @IsOptional() @IsUUID() parentContributionId?: string;
  @IsOptional() @IsBoolean() notifyOnReply?: boolean;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) subscriptionRequestId?: string;
  @IsString() @MaxLength(2_000) body!: string;
}

const contributionColumns = `id, revision, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
  thread_id as "threadId", thread_author_snapshot as "threadAuthor", parent_contribution_id as "parentContributionId",
  body, status, publication_status as "publicationStatus", created_at as "createdAt", updated_at as "updatedAt"`;

@Controller('discussion/contributions')
@UseGuards(UserAuthGuard)
export class DiscussionContributionController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: DataEncryptionService,
    private readonly replyNotifications: DiscussionReplyNotificationService,
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

  private async ensureCanParticipate(client: Pick<PoolClient, 'query'>, userId: string) {
    const restriction = await findActiveDiscussionRestriction(client, userId);
    if (restriction) throw new ForbiddenException('当前账号已被限制参与讨论');
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

  private async replyTarget(client: Pick<PoolClient, 'query'>, issueCode: string, threadId: string, parentContributionId: string) {
    const result = await client.query<ReplyTargetRow>(
      `select contribution.id, contribution.user_id as "userId", contribution.issue_code as "issueCode",
              contribution.thread_id as "threadId", users.nickname
       from discussion_contributions contribution
       left join users on users.id = contribution.user_id
       where contribution.id = $1 and contribution.publication_status = 'published'`,
      [parentContributionId],
    );
    const target = result.rows[0];
    if (!target || target.issueCode !== issueCode) throw new BadRequestException('回复对象已不在本期讨论中');
    if (!threadId) throw new BadRequestException('回复对象已不在本期讨论中');
    if (target.threadId === '') {
      if (threadId !== `community-${target.id}`) throw new BadRequestException('回复对象与当前讨论不一致');
    } else if (target.threadId !== threadId) {
      throw new BadRequestException('回复对象与当前讨论不一致');
    }
    return target;
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
  async mine(
    @Req() request: Request & { user?: { sub: string } },
    @Query('issueCode') issueValue?: string,
    @Query('threadId') threadValue?: string,
    @Query('parentContributionId') parentValue?: string,
  ) {
    const userId = this.userId(request);
    const issueCode = issueValue?.trim() || '';
    const threadId = threadValue?.trim() || '';
    const parentContributionId = parentValue?.trim() || '';
    if (!issueCode || issueCode.length > 64 || threadId.length > 64
      || (parentContributionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parentContributionId))) {
      throw new BadRequestException('期刊或回复对象无效');
    }
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query<ContributionRow>(
        `select ${contributionColumns} from discussion_contributions
         where user_id = $1 and issue_code = $2 and thread_id = $3
           and ${parentContributionId ? 'parent_contribution_id = $4' : 'parent_contribution_id is null'}`,
        parentContributionId ? [userId, issueCode, threadId, parentContributionId] : [userId, issueCode, threadId],
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
    const parentContributionId = body.parentContributionId?.trim() || '';
    const text = body.body.trim();
    const subscriptionRequestId = body.subscriptionRequestId?.trim() || '';
    if (!issueCode || issueCode.length > 64 || threadId.length > 64 || !text || text.length > 2_000) {
      throw new BadRequestException('请填写不超过 2000 字的经历');
    }
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      await this.ensureCanParticipate(client, userId);
      const issue = await loadPublishedDiscussion(client, issueCode, { encryption: this.encryption });
      const thread = threadId ? issue.discussion.threads.find((entry) => entry.id === threadId) : undefined;
      if (threadId && !thread) throw new BadRequestException('回复对象已不在本期讨论中');
      const target = parentContributionId
        ? await this.replyTarget(client, issue.issueCode, threadId, parentContributionId)
        : null;
      const threadAuthor = target ? (target.nickname || '匿名读者') : (thread?.author ?? null);
      const conflict = parentContributionId
        ? `on conflict (user_id, issue_code, thread_id, parent_contribution_id)
             where thread_id <> '' and parent_contribution_id is not null do update`
        : threadId
          ? `on conflict (user_id, issue_code, thread_id)
               where thread_id <> '' and parent_contribution_id is null do update`
          : `on conflict (user_id, issue_code)
               where thread_id = '' do update`;
      const result = await client.query<ContributionRow>(
        `insert into discussion_contributions
           (user_id, issue_code, issue_label_snapshot, thread_id, thread_author_snapshot, parent_contribution_id, body, status, publication_status, revision)
         values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'pending', 1)
         ${conflict}
         set issue_label_snapshot = excluded.issue_label_snapshot,
             thread_author_snapshot = excluded.thread_author_snapshot,
             parent_contribution_id = excluded.parent_contribution_id,
             body = excluded.body, status = 'pending', publication_status = 'pending', revision = discussion_contributions.revision + 1,
             handled_by = null, handled_at = null, published_at = null, published_by = null,
             featured_at = null, featured_by = null, featured_order = 0, updated_at = now()
         returning ${contributionColumns}`,
        [userId, issue.issueCode, issue.issueLabel, threadId, threadAuthor, parentContributionId || null,
          JSON.stringify(this.encryption.encryptJson({ body: text }))],
      );
      const row = result.rows[0];
      if (!row) throw new InternalServerErrorException('经历暂时无法保存');
      if (body.notifyOnReply === true && subscriptionRequestId) {
        await client.query('savepoint discussion_subscription_consent');
        try {
          await this.replyNotifications.recordSubscriptionConsent(client, userId, row.id, subscriptionRequestId);
          await client.query('release savepoint discussion_subscription_consent');
        } catch {
          await client.query('rollback to savepoint discussion_subscription_consent');
          await client.query('release savepoint discussion_subscription_consent');
        }
      }
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'discussion_contribution.saved', resourceType: 'discussion_contribution', resourceId: row.id, metadata: { issueCode: issue.issueCode, issueLabel: issue.issueLabel, hasThread: Boolean(threadId), hasParentContribution: Boolean(parentContributionId), status: row.status, publicationStatus: row.publicationStatus } }, client);
      return this.present(row);
    });
  }

  @Delete('mine')
  @Header('Cache-Control', 'no-store')
  async remove(
    @Req() request: Request & { user?: { sub: string } },
    @Query('issueCode') issueValue?: string,
    @Query('threadId') threadValue?: string,
    @Query('parentContributionId') parentValue?: string,
  ) {
    const userId = this.userId(request);
    const issueCode = issueValue?.trim() || '';
    const threadId = threadValue?.trim() || '';
    const parentContributionId = parentValue?.trim() || '';
    if (!issueCode || issueCode.length > 64 || threadId.length > 64
      || (parentContributionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parentContributionId))) {
      throw new BadRequestException('期刊或回复对象无效');
    }
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query<{ id: string }>(
        `delete from discussion_contributions where user_id = $1 and issue_code = $2 and thread_id = $3
           and ${parentContributionId ? 'parent_contribution_id = $4' : 'parent_contribution_id is null'} returning id`,
        parentContributionId ? [userId, issueCode, threadId, parentContributionId] : [userId, issueCode, threadId],
      );
      const id = result.rows[0]?.id;
      if (id) await this.audit.record({ actorType: 'user', actorId: userId, action: 'discussion_contribution.deleted', resourceType: 'discussion_contribution', resourceId: id }, client);
      return { deleted: Boolean(id) };
    });
  }
}
