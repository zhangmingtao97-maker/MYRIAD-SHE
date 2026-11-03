import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { defaultDiscussionContent, DiscussionContent, validateDiscussionContent } from '../content/discussion-content';

export interface PublishedDiscussion {
  issueCode: string;
  issueLabel: string;
  discussion: DiscussionContent;
}

/**
 * 读取已发布期刊的讨论内容（优先独立发布的讨论页，回退到期刊发布快照）。
 * 举报与用户经历都只接受已发布期刊中的内容，避免提交到不存在的期刊。
 */
export async function loadPublishedDiscussion(
  client: Pick<PoolClient, 'query'>,
  issueCode: string,
  missingMessage = '只能保存已发布期刊中的经历',
): Promise<PublishedDiscussion> {
  const result = await client.query<{ issueCode: string; issueLabel: string; discussion: unknown }>(
    `select coalesce(publication.snapshot->'issue'->>'code', issue.code) as "issueCode",
            coalesce(publication.snapshot->'issue'->>'label', issue.label) as "issueLabel",
            coalesce(page.published_content, publication.snapshot->'discussion') as discussion
     from content_issues issue
     left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
     left join content_discussion_pages page on page.issue_id = issue.id and page.published_content is not null
     where issue.status = 'published' and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)`, [issueCode],
  );
  if (!result.rows[0]) throw new BadRequestException(missingMessage);
  let discussion: DiscussionContent;
  try {
    discussion = result.rows[0].discussion ? validateDiscussionContent(result.rows[0].discussion) : defaultDiscussionContent();
  } catch {
    throw new BadRequestException('本期讨论内容暂时无法使用');
  }
  return { ...result.rows[0], discussion };
}
