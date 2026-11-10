// Keep unfinished input on-device until the user explicitly saves it to their account.
export const discussionStorageKey = 'myriad_she_discussion_local_v1';
export interface LocalContribution { id: string; issueCode: string; threadId: string; parentContributionId: string; body: string; createdAt: string }
export interface LocalDiscussionDraft { issueCode: string; threadId: string; parentContributionId: string; body: string; updatedAt: string }
interface LocalDiscussion { contributions: LocalContribution[]; drafts: LocalDiscussionDraft[] }

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function readLocalDiscussion(): LocalDiscussion {
  const raw: unknown = wx.getStorageSync(discussionStorageKey);
  if (!isRecord(raw)) return { contributions: [], drafts: [] };
  const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
  const parentId = (entry: Record<string, unknown>) => {
    if (entry.parentContributionId === undefined || entry.parentContributionId === null) return '';
    return text(entry.parentContributionId, 64) ? entry.parentContributionId : null;
  };
  const contributions = Array.isArray(raw.contributions) ? raw.contributions.flatMap((entry): LocalContribution[] => {
    if (!isRecord(entry)) return [];
    const parentContributionId = parentId(entry);
    return text(entry.id, 64) && !!entry.id && text(entry.issueCode, 64) && !!entry.issueCode && text(entry.threadId, 64)
      && text(entry.body, 2000) && !!entry.body.trim() && text(entry.createdAt, 40) && Number.isFinite(Date.parse(entry.createdAt))
      && parentContributionId !== null
      ? [{ id: entry.id, issueCode: entry.issueCode, threadId: entry.threadId, parentContributionId, body: entry.body, createdAt: entry.createdAt }]
      : [];
  }).slice(-100) : [];
  const drafts = Array.isArray(raw.drafts) ? raw.drafts.flatMap((entry): LocalDiscussionDraft[] => {
    if (!isRecord(entry)) return [];
    const parentContributionId = parentId(entry);
    return text(entry.issueCode, 64) && !!entry.issueCode && text(entry.threadId, 64)
      && text(entry.body, 2000) && !!entry.body.trim() && text(entry.updatedAt, 40) && Number.isFinite(Date.parse(entry.updatedAt))
      && parentContributionId !== null
      ? [{ issueCode: entry.issueCode, threadId: entry.threadId, parentContributionId, body: entry.body, updatedAt: entry.updatedAt }]
      : [];
  }).slice(-20) : [];
  return { contributions, drafts };
}
export function addLocalContribution(entry: LocalContribution) {
  const data = readLocalDiscussion();
  if (data.contributions.length >= 100) throw new Error('本机已保存 100 条内容，请先删除一些再保存。');
  data.contributions.push(entry);
  wx.setStorageSync(discussionStorageKey, data);
}
export function removeLocalContribution(id: string) {
  const data = readLocalDiscussion();
  data.contributions = data.contributions.filter((entry) => entry.id !== id);
  wx.setStorageSync(discussionStorageKey, data);
}

const draftMatches = (draft: LocalDiscussionDraft, issueCode: string, threadId: string, parentContributionId: string) =>
  draft.issueCode === issueCode && draft.threadId === threadId && draft.parentContributionId === parentContributionId;

export function readLocalDraft(issueCode: string, threadId: string, parentContributionId: string) {
  return readLocalDiscussion().drafts.find((draft) => draftMatches(draft, issueCode, threadId, parentContributionId))?.body || '';
}

export function readLocalDraftEntry(issueCode: string, threadId: string, parentContributionId: string) {
  return readLocalDiscussion().drafts.find((draft) => draftMatches(draft, issueCode, threadId, parentContributionId)) || null;
}

export function saveLocalDraft(draft: LocalDiscussionDraft) {
  const data = readLocalDiscussion();
  data.drafts = [...data.drafts.filter((entry) => !draftMatches(entry, draft.issueCode, draft.threadId, draft.parentContributionId)), draft].slice(-20);
  wx.setStorageSync(discussionStorageKey, data);
}

export function removeLocalDraft(issueCode: string, threadId: string, parentContributionId: string) {
  const data = readLocalDiscussion();
  data.drafts = data.drafts.filter((draft) => !draftMatches(draft, issueCode, threadId, parentContributionId));
  wx.setStorageSync(discussionStorageKey, data);
}
