export interface DiscussionReply { id: string; author: string; body: string }
export interface DiscussionThread { id: string; author: string; body: string; replies: DiscussionReply[] }
export interface DiscussionCopy {
  number: string; kicker: string; issueLine: string; title: string; intro: string;
  paragraph1: string; paragraph2: string; paragraph3: string; writeAction: string;
  voicesTitle: string; exampleBadge: string; exampleNotice: string;
  selfEyebrow: string; selfTitle: string; selfBody: string; selfAction: string;
  composeTitle: string; composeHeading: string; composeFieldLabel: string; composePlaceholder: string;
  composePreviewAction: string; composeSaveAction: string; composeDiscardAction: string;
}
export interface DiscussionContent { copy: DiscussionCopy; threads: DiscussionThread[] }
export interface PublicDiscussion { issueCode: string; issueLabel: string; publishedVersion: number; content: DiscussionContent }

export function isDiscussionContent(value: unknown): value is DiscussionContent {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/<\/?[a-z][^>]*>/i.test(v);
  const keys = ['number', 'kicker', 'issueLine', 'title', 'intro', 'paragraph1', 'paragraph2', 'paragraph3', 'writeAction', 'voicesTitle', 'exampleBadge', 'exampleNotice', 'selfEyebrow', 'selfTitle', 'selfBody', 'selfAction', 'composeTitle', 'composeHeading', 'composeFieldLabel', 'composePlaceholder', 'composePreviewAction', 'composeSaveAction', 'composeDiscardAction'];
  if (!record(value) || !record(value.copy) || Object.keys(value.copy).length !== keys.length
    || !keys.every((key) => text((value.copy as Record<string, unknown>)[key], 2000)) || !Array.isArray(value.threads) || value.threads.length > 20) return false;
  const ids = new Set<string>();
  const entry = (v: unknown) => {
    if (!record(v) || typeof v.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(v.id) || ids.has(v.id) || !text(v.author, 40) || !text(v.body, 4000)) return false;
    ids.add(v.id);
    return true;
  };
  return value.threads.every((thread) => record(thread) && entry(thread) && Array.isArray(thread.replies) && thread.replies.length <= 20 && thread.replies.every(entry));
}

export function isPublicDiscussion(value: unknown): value is PublicDiscussion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return typeof data.issueCode === 'string' && data.issueCode.length >= 2 && data.issueCode.length <= 64
    && typeof data.issueLabel === 'string' && data.issueLabel.length >= 2 && data.issueLabel.length <= 80
    && Number.isSafeInteger(data.publishedVersion) && Number(data.publishedVersion) > 0 && isDiscussionContent(data.content);
}
