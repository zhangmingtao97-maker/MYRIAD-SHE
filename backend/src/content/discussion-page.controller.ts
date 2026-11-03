import { BadRequestException, Body, ConflictException, Controller, Get, Header, NotFoundException, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from '../admin/audit.service';
import { DatabaseService } from '../database/database.service';
import { defaultDiscussionContent, DiscussionContent, validateDiscussionContent } from './discussion-content';

class DiscussionPageSaveDto {
  @IsString() @MinLength(2) @MaxLength(64) issueCode!: string;
  @IsObject() content!: Record<string, unknown>;
  @IsInt() @Min(0) editVersion!: number;
}

class DiscussionPagePublishDto extends DiscussionPageSaveDto {}

interface IssueRow {
  id: string;
  code: string;
  label: string;
  status: string;
  draftContent: { discussion?: DiscussionContent } | null;
}

interface DiscussionPageRow {
  editVersion: number;
  draftContent: DiscussionContent;
  publishedContent: DiscussionContent | null;
  publishedVersion: number;
  publishedAt: Date | null;
}

const pageColumns = `page.edit_version as "editVersion", page.draft_content as "draftContent",
  page.published_content as "publishedContent", page.published_version as "publishedVersion",
  page.published_at as "publishedAt"`;

@Controller('content/discussion')
@UseGuards(AdminAuthGuard)
export class DiscussionPageController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get('manage')
  @Header('Cache-Control', 'no-store')
  async manage(@Query('issueCode') issueCodeValue?: string) {
    const issue = await this.findIssue(issueCodeValue?.trim() || '');
    const page = await this.database.query<DiscussionPageRow>(
      `select ${pageColumns} from content_discussion_pages page where page.issue_id = $1`, [issue.id],
    );
    const row = page.rows[0];
    const fallback = issue.draftContent?.discussion;
    return this.present(issue, row ?? {
      editVersion: 0,
      draftContent: fallback ? validateDiscussionContent(fallback) : defaultDiscussionContent(),
      publishedContent: null,
      publishedVersion: 0,
      publishedAt: null,
    });
  }

  @Put('manage')
  @Header('Cache-Control', 'no-store')
  async save(@Req() request: Request & { user?: { sub: string } }, @Body() body: DiscussionPageSaveDto) {
    const issue = await this.findIssue(body.issueCode);
    const content = this.validateContent(body.content);
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<DiscussionPageRow>(
        `select ${pageColumns} from content_discussion_pages page where page.issue_id = $1 for update`, [issue.id],
      );
      const current = existing.rows[0];
      this.assertVersion(current?.editVersion ?? 0, body.editVersion);
      const nextVersion = (current?.editVersion ?? 0) + 1;
      if (current) {
        await client.query(
          `update content_discussion_pages
           set draft_content = $2::jsonb, edit_version = $3, updated_at = now(), updated_by = $4
           where issue_id = $1`, [issue.id, JSON.stringify(content), nextVersion, request.user?.sub ?? null],
        );
      } else {
        await client.query(
          `insert into content_discussion_pages (issue_id, draft_content, edit_version, updated_by)
           values ($1, $2::jsonb, $3, $4)`, [issue.id, JSON.stringify(content), nextVersion, request.user?.sub ?? null],
        );
      }
      await this.audit.record({
        actorType: 'admin', actorId: request.user?.sub, action: 'content.discussion.draft_saved',
        resourceType: 'content_discussion_page', resourceId: issue.id,
        metadata: { issueCode: issue.code, editVersion: nextVersion, threads: content.threads.length },
      }, client);
      return this.present(issue, {
        editVersion: nextVersion, draftContent: content,
        publishedContent: current?.publishedContent ?? null,
        publishedVersion: current?.publishedVersion ?? 0,
        publishedAt: current?.publishedAt ?? null,
      });
    });
  }

  @Post('manage/publish')
  @Header('Cache-Control', 'no-store')
  async publish(@Req() request: Request & { user?: { sub: string } }, @Body() body: DiscussionPagePublishDto) {
    const issue = await this.findIssue(body.issueCode);
    const content = this.validateContent(body.content);
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<DiscussionPageRow>(
        `select ${pageColumns} from content_discussion_pages page where page.issue_id = $1 for update`, [issue.id],
      );
      const current = existing.rows[0];
      this.assertVersion(current?.editVersion ?? 0, body.editVersion);
      const nextEditVersion = (current?.editVersion ?? 0) + 1;
      const nextPublishedVersion = (current?.publishedVersion ?? 0) + 1;
      if (current) {
        await client.query(
          `update content_discussion_pages
           set draft_content = $2::jsonb, published_content = $2::jsonb,
               edit_version = $3, published_version = $4, published_at = now(),
               updated_at = now(), updated_by = $5, published_by = $5
           where issue_id = $1`,
          [issue.id, JSON.stringify(content), nextEditVersion, nextPublishedVersion, request.user?.sub ?? null],
        );
      } else {
        await client.query(
          `insert into content_discussion_pages
             (issue_id, draft_content, published_content, edit_version, published_version, published_at, updated_by, published_by)
           values ($1, $2::jsonb, $2::jsonb, $3, $4, now(), $5, $5)`,
          [issue.id, JSON.stringify(content), nextEditVersion, nextPublishedVersion, request.user?.sub ?? null],
        );
      }
      await this.audit.record({
        actorType: 'admin', actorId: request.user?.sub, action: 'content.discussion.published',
        resourceType: 'content_discussion_page', resourceId: issue.id,
        metadata: { issueCode: issue.code, publishedVersion: nextPublishedVersion, threads: content.threads.length },
      }, client);
      return this.present(issue, {
        editVersion: nextEditVersion, draftContent: content, publishedContent: content,
        publishedVersion: nextPublishedVersion, publishedAt: new Date(),
      });
    });
  }

  private async findIssue(issueCode: string): Promise<IssueRow> {
    if (typeof issueCode !== 'string' || issueCode.length < 2 || issueCode.length > 64) throw new BadRequestException('期刊编号无效');
    const result = await this.database.query<IssueRow>(
      `select id, code, label, status, draft_content as "draftContent"
       from content_issues where code = $1`, [issueCode],
    );
    const issue = result.rows[0];
    if (!issue) throw new NotFoundException('期刊不存在');
    return issue;
  }

  private validateContent(value: Record<string, unknown>): DiscussionContent {
    try {
      return validateDiscussionContent(value);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('讨论内容格式无效');
    }
  }

  private assertVersion(current: number, requested: number) {
    if (current !== requested) throw new ConflictException({
      code: 'discussion_page_changed',
      message: '本期讨论已在其他位置更新，请刷新后重试。',
    });
  }

  private present(issue: IssueRow, page: DiscussionPageRow) {
    return {
      issueId: issue.id,
      issueCode: issue.code,
      issueLabel: issue.label,
      issueStatus: issue.status,
      editVersion: page.editVersion,
      draftContent: page.draftContent,
      publishedVersion: page.publishedVersion,
      publishedAt: page.publishedAt,
      published: page.publishedContent !== null,
    };
  }
}
