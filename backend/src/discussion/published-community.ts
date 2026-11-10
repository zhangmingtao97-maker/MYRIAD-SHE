import { DataEncryptionService } from '../security/data-encryption.service';
import { DiscussionContent, DiscussionReply, DiscussionThread } from '../content/discussion-content';

interface PublishedContributionRow {
  id: string;
  threadId: string;
  body: unknown;
  publishedAt: Date | null;
  featuredAt: Date | null;
  featuredOrder: number;
  nickname: string | null;
}

interface CommunityEntry {
  id: string;
  threadId: string;
  author: string;
  body: string;
  publishedAt: number;
  featured: boolean;
  featuredOrder: number;
}

const maxThreads = 50;
const maxRepliesPerThread = 100;
const maxDiscussionBytes = 48 * 1024;

function plainAuthor(value: string | null | undefined) {
  const author = (value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!author || author.length > 40 || /<\/?[a-z][^>]*>/i.test(author)) return '匿名读者';
  return author;
}

function plainBody(value: unknown) {
  if (typeof value !== 'string') return '';
  const body = value.trim();
  return body && body.length <= 2_000 && !/<\/?[a-z][^>]*>/i.test(body) ? body : '';
}

function decryptedBody(encryption: DataEncryptionService, value: unknown) {
  try {
    const payload = encryption.decryptJson(value);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
    return plainBody((payload as Record<string, unknown>).body);
  } catch {
    return '';
  }
}

async function loadPublishedContributions(
  client: { query: Function },
  issueCode: string,
  encryption: DataEncryptionService,
) {
  const result = await client.query(
    `select contribution.id, contribution.thread_id as "threadId", contribution.body,
            contribution.published_at as "publishedAt", contribution.featured_at as "featuredAt",
            contribution.featured_order as "featuredOrder", users.nickname
     from discussion_contributions contribution
     left join users on users.id = contribution.user_id
     where contribution.issue_code = $1 and contribution.publication_status = 'published'
     order by contribution.published_at asc nulls last, contribution.created_at asc, contribution.id asc`,
    [issueCode],
  ) as { rows: PublishedContributionRow[] };
  return result.rows.flatMap((row): CommunityEntry[] => {
    const body = decryptedBody(encryption, row.body);
    if (!body) return [];
    return [{
      id: row.id,
      threadId: row.threadId,
      author: plainAuthor(row.nickname),
      body,
      publishedAt: row.publishedAt ? new Date(row.publishedAt).getTime() : 0,
      featured: Boolean(row.featuredAt),
      featuredOrder: Number.isSafeInteger(row.featuredOrder) ? row.featuredOrder : 0,
    }];
  });
}

/**
 * 合并编辑示例与已审核公开的读者内容。解密失败或文本不合法的单条内容会被跳过，
 * 不让一条坏数据拖垮整个讨论页。公开对象不包含用户 ID。
 */
export async function mergePublishedCommunityContent(
  client: { query: Function },
  discussion: DiscussionContent,
  issueCode: string,
  encryption: DataEncryptionService,
): Promise<DiscussionContent> {
  const entries = await loadPublishedContributions(client, issueCode, encryption);
  const editorialOrder = new Map<string, number>();
  const threads: DiscussionThread[] = discussion.threads.map((thread, index) => {
    editorialOrder.set(thread.id, index);
    return {
      ...thread,
      source: 'editorial',
      ...(thread.featured === true ? { featured: true } : {}),
      replies: thread.replies.map((reply) => ({ ...reply, source: 'editorial' })),
    };
  });
  const threadIndex = new Map(threads.map((thread) => [thread.id, thread]));
  const communityPublishedAt = new Map<string, number>();
  const size = () => Buffer.byteLength(JSON.stringify({
    copy: discussion.copy,
    ...(discussion.copyRichText ? { copyRichText: discussion.copyRichText } : {}),
    threads,
  }), 'utf8');

  for (const entry of entries.filter((item) => item.threadId === '')) {
    if (threads.length >= maxThreads) break;
    const thread: DiscussionThread = {
      id: `community-${entry.id}`,
      author: entry.author,
      body: entry.body,
      replies: [],
      source: 'community',
      contributionId: entry.id,
      ...(entry.featured ? { featured: true } : {}),
    };
    threads.push(thread);
    if (size() > maxDiscussionBytes) {
      threads.pop();
      break;
    }
    threadIndex.set(thread.id, thread);
    communityPublishedAt.set(thread.id, entry.publishedAt);
  }

  for (const entry of entries.filter((item) => item.threadId !== '')) {
    const parent = threadIndex.get(entry.threadId);
    if (!parent || parent.replies.length >= maxRepliesPerThread) continue;
    const reply: DiscussionReply = {
      id: `community-reply-${entry.id}`,
      author: entry.author,
      body: entry.body,
      source: 'community',
      contributionId: entry.id,
    };
    parent.replies = [...parent.replies, reply];
    if (size() > maxDiscussionBytes) parent.replies = parent.replies.slice(0, -1);
  }

  threads.sort((left, right) => {
    if (Boolean(left.featured) !== Boolean(right.featured)) return left.featured ? -1 : 1;
    if (left.featured && right.featured) {
      const leftOrder = entries.find((entry) => `community-${entry.id}` === left.id)?.featuredOrder ?? 0;
      const rightOrder = entries.find((entry) => `community-${entry.id}` === right.id)?.featuredOrder ?? 0;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    if (left.source !== right.source) return left.source === 'editorial' ? -1 : 1;
    if (left.source === 'editorial') return (editorialOrder.get(left.id) ?? 0) - (editorialOrder.get(right.id) ?? 0);
    return (communityPublishedAt.get(right.id) ?? 0) - (communityPublishedAt.get(left.id) ?? 0);
  });

  return JSON.parse(JSON.stringify({
    copy: discussion.copy,
    ...(discussion.copyRichText ? { copyRichText: discussion.copyRichText } : {}),
    threads,
  })) as DiscussionContent;
}
