// Keep unfinished input on-device until the user explicitly saves it to their account.
export const discussionStorageKey = 'myriad_she_discussion_local_v1';
export interface LocalContribution { id: string; issueCode: string; threadId: string; body: string; createdAt: string }
export interface LocalReport { issueCode: string; threadId: string; reason: string }
export interface LocalDiscussionDraft { issueCode: string; threadId: string; body: string; updatedAt: string }
interface LocalDiscussion { contributions: LocalContribution[]; reports: LocalReport[]; drafts: LocalDiscussionDraft[] }

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function readLocalDiscussion(): LocalDiscussion {
  const raw: unknown = wx.getStorageSync(discussionStorageKey);
  if (!isRecord(raw)) return { contributions: [], reports: [], drafts: [] };
  const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
  const contributions = Array.isArray(raw.contributions) ? raw.contributions.filter((entry): entry is LocalContribution => isRecord(entry)
    && text(entry.id, 64) && !!entry.id && text(entry.issueCode, 64) && !!entry.issueCode && text(entry.threadId, 64)
    && text(entry.body, 2000) && !!entry.body.trim() && text(entry.createdAt, 40) && Number.isFinite(Date.parse(entry.createdAt))).slice(-100) : [];
  const reports = Array.isArray(raw.reports) ? raw.reports.filter((entry): entry is LocalReport => isRecord(entry)
    && text(entry.issueCode, 64) && text(entry.threadId, 64) && text(entry.reason, 80)).slice(-100) : [];
  const drafts = Array.isArray(raw.drafts) ? raw.drafts.filter((entry): entry is LocalDiscussionDraft => isRecord(entry)
    && text(entry.issueCode, 64) && !!entry.issueCode && text(entry.threadId, 64)
    && text(entry.body, 2000) && !!entry.body.trim() && text(entry.updatedAt, 40) && Number.isFinite(Date.parse(entry.updatedAt))).slice(-20) : [];
  return { contributions, reports, drafts };
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
export function reportLocalThread(entry: LocalReport) {
  const data = readLocalDiscussion();
  data.reports = [...data.reports.filter((item) => item.issueCode !== entry.issueCode || item.threadId !== entry.threadId), entry].slice(-100);
  wx.setStorageSync(discussionStorageKey, data);
}

export function readLocalDraft(issueCode: string, threadId: string) {
  return readLocalDiscussion().drafts.find((draft) => draft.issueCode === issueCode && draft.threadId === threadId)?.body || '';
}

export function readLocalDraftEntry(issueCode: string, threadId: string) {
  return readLocalDiscussion().drafts.find((draft) => draft.issueCode === issueCode && draft.threadId === threadId) || null;
}

export function saveLocalDraft(draft: LocalDiscussionDraft) {
  const data = readLocalDiscussion();
  data.drafts = [...data.drafts.filter((entry) => entry.issueCode !== draft.issueCode || entry.threadId !== draft.threadId), draft].slice(-20);
  wx.setStorageSync(discussionStorageKey, data);
}

export function removeLocalDraft(issueCode: string, threadId: string) {
  const data = readLocalDiscussion();
  data.drafts = data.drafts.filter((draft) => draft.issueCode !== issueCode || draft.threadId !== threadId);
  wx.setStorageSync(discussionStorageKey, data);
}
