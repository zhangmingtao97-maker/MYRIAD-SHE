export type DiscussionSource = 'editorial' | 'community';
export interface DiscussionReply { id: string; author: string; body: string; bodyRichText?: string; source?: DiscussionSource; contributionId?: string }
export interface DiscussionThread { id: string; author: string; body: string; bodyRichText?: string; replies: DiscussionReply[]; source?: DiscussionSource; featured?: boolean; contributionId?: string }
export interface DiscussionCopy {
  number: string; kicker: string; issueLine: string; title: string; intro: string;
  paragraph1: string; paragraph2: string; paragraph3: string; writeAction: string;
  voicesTitle: string; exampleBadge: string; exampleNotice: string;
  selfEyebrow: string; selfTitle: string; selfBody: string; selfAction: string;
  composeTitle: string; composeHeading: string; composeFieldLabel: string; composePlaceholder: string;
  composePreviewAction: string; composeSaveAction: string; composeDiscardAction: string;
  detailNavTitle: string; detailKicker: string; detailTitle: string; detailNote: string;
  exampleLabel: string; communityLabel: string; featuredLabel: string; localLabel: string;
  repliesTitle: string; replyAction: string; reportAction: string; reportedAction: string;
  replyContextExample: string; replyContextCommunity: string;
  footerPrimary: string; footerSecondary: string; detailMoreTitle: string; detailMoreBody: string;
  detailLoading: string; detailRetry: string;
}
export interface DiscussionContent {
  copy: DiscussionCopy;
  copyRichText?: Partial<Record<keyof DiscussionCopy, string>>;
  threads: DiscussionThread[];
}
export interface PublicDiscussion { issueCode: string; issueLabel: string; publishedVersion: number; content: DiscussionContent }

export const discussionDetailCopyKeys = [
  'detailNavTitle', 'detailKicker', 'detailTitle', 'detailNote',
  'exampleLabel', 'communityLabel', 'featuredLabel', 'localLabel',
  'repliesTitle', 'replyAction', 'reportAction', 'reportedAction',
  'replyContextExample', 'replyContextCommunity',
  'footerPrimary', 'footerSecondary', 'detailMoreTitle', 'detailMoreBody',
  'detailLoading', 'detailRetry',
] as const;
export type DiscussionDetailCopyKey = typeof discussionDetailCopyKeys[number];
export const defaultDiscussionDetailCopy: Pick<DiscussionCopy, DiscussionDetailCopyKey> = {
  detailNavTitle: '一段对话', detailKicker: '本期讨论 · 一段对话',
  detailTitle: '从这一段经历，\n继续谈起。',
  detailNote: '新写的经历会进入运营后台，审核通过后才会公开。',
  exampleLabel: '示例', communityLabel: '读者分享', featuredLabel: '精华', localLabel: '本机',
  repliesTitle: '接着这段经历', replyAction: '回应', reportAction: '举报', reportedAction: '已举报',
  replyContextExample: '回应 {author} 的示例', replyContextCommunity: '回应 {author} 的分享',
  footerPrimary: '接着谈谈', footerSecondary: '查看本期其他经历',
  detailMoreTitle: '讨论说明',
  detailMoreBody: '新经历会进入运营后台，审核通过后才会公开；举报会提交给编辑团队核实处理。',
  detailLoading: '正在读取这段对话…', detailRetry: '重新读取',
};

export function discussionDetailCopyValue(copy: Partial<DiscussionCopy> | undefined, key: DiscussionDetailCopyKey) {
  const value = copy?.[key];
  return typeof value === 'string' && value.trim() ? value : defaultDiscussionDetailCopy[key];
}

export function isCommunityDiscussionEntry(entry: { source?: DiscussionSource; contributionId?: string }) {
  return entry.source === 'community' || Boolean(entry.contributionId);
}

export function hasCommunityDiscussion(threads: DiscussionThread[]) {
  return threads.some(isCommunityDiscussionEntry);
}

export function discussionThreadsForDisplay(threads: DiscussionThread[]) {
  if (!hasCommunityDiscussion(threads)) return threads;
  return threads.filter(isCommunityDiscussionEntry);
}

export function isDiscussionContent(value: unknown): value is DiscussionContent {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/<\/?[a-z][^>]*>/i.test(v);
  const richText = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const baseKeys = ['number', 'kicker', 'issueLine', 'title', 'intro', 'paragraph1', 'paragraph2', 'paragraph3', 'writeAction', 'voicesTitle', 'exampleBadge', 'exampleNotice', 'selfEyebrow', 'selfTitle', 'selfBody', 'selfAction', 'composeTitle', 'composeHeading', 'composeFieldLabel', 'composePlaceholder', 'composePreviewAction', 'composeSaveAction', 'composeDiscardAction'];
  const detailKeys = [...discussionDetailCopyKeys];
  const keys = [...baseKeys, ...detailKeys];
  if (!record(value) || Object.keys(value).some((key) => !['copy', 'copyRichText', 'threads'].includes(key))
    || !record(value.copy) || Object.keys(value.copy).some((key) => !keys.includes(key))
    || !Array.isArray(value.threads) || value.threads.length > 50) return false;
  const copy = value.copy;
  if (!Object.entries(copy).every(([key, field]) => keys.includes(key) && text(field, 2000))) return false;
  if (!baseKeys.every((key) => text(copy[key], 2000))) return false;
  if (value.copyRichText !== undefined) {
    if (!record(value.copyRichText) || Object.keys(value.copyRichText).some((key) => !keys.includes(key))) return false;
    if (!Object.values(value.copyRichText).every((field) => richText(field, 24000))) return false;
  }
  const ids = new Set<string>();
  const entry = (v: unknown, isReply: boolean) => {
    const allowedKeys = isReply ? ['id', 'author', 'body', 'bodyRichText', 'source', 'contributionId'] : ['id', 'author', 'body', 'bodyRichText', 'replies', 'source', 'featured', 'contributionId'];
    if (!record(v) || Object.keys(v).some((key) => !allowedKeys.includes(key)) || typeof v.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(v.id) || ids.has(v.id) || !text(v.author, 40) || !text(v.body, 4000)
      || (v.bodyRichText !== undefined && !richText(v.bodyRichText, 24000))) return false;
    if (v.source !== undefined && v.source !== 'editorial' && v.source !== 'community') return false;
    if (v.contributionId !== undefined && (typeof v.contributionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.contributionId))) return false;
    if (!isReply && v.featured !== undefined && typeof v.featured !== 'boolean') return false;
    ids.add(v.id);
    return true;
  };
  return value.threads.every((thread) => record(thread) && entry(thread, false) && Array.isArray(thread.replies)
    && thread.replies.length <= 100 && thread.replies.every((reply) => entry(reply, true)));
}

export function isPublicDiscussion(value: unknown): value is PublicDiscussion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return typeof data.issueCode === 'string' && data.issueCode.length >= 2 && data.issueCode.length <= 64
    && typeof data.issueLabel === 'string' && data.issueLabel.length >= 2 && data.issueLabel.length <= 80
    && Number.isSafeInteger(data.publishedVersion) && Number(data.publishedVersion) > 0 && isDiscussionContent(data.content);
}
