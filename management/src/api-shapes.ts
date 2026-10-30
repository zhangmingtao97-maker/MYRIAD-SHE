type IssueStatus = 'draft' | 'published' | 'archived';
type ObservationMethod = 'reality' | 'season';
type ObservationStatus = 'draft' | 'saved';
type PrivacyStatus = 'pending' | 'cancelled' | 'completed' | 'failed';
type AuditActorType = 'user' | 'admin' | 'system';
import { isDiscussionContent } from './discussion-content';
import type { DiscussionContent } from './discussion-content';

export interface PublicHome {
  issue: { code: string; label: string; month: string; theme: string; question: string; microVoiceTitle: string | null; microVoiceDuration: string | null; homeMetaRichText: string; homeMetaFontSize: number; homeMetaColor: string; homeCoverCaptionLeft: string; homeCoverCaptionRight: string } | null;
  question: string;
  coverUrl: string;
  microVoice: { title: string; duration: string; url: string; enabled: boolean };
  sections: string[];
  publishedVersion?: number;
  modules?: ManagedIssueModule[];
}

export interface ManagedIssueModule {
  id: string;
  type: 'issueMeta' | 'coverStory' | 'cover' | 'opener' | 'story' | 'storyAction' | 'image' | 'quote' | 'audio' | 'question' | 'observationAction' | 'sharedPracticeAction' | 'contents' | 'archive' | 'brandFooter';
  order: number;
  enabled: boolean;
  tracks?: ManagedAudioTrack[];
  [key: string]: string | number | boolean | null | undefined | ManagedAudioTrack[];
}

export interface ManagedAudioTrack {
  id: string;
  title: string;
  duration: string;
  audioObjectKey?: string;
  quote: string;
  subtitle: string;
  transcript: string;
}

export interface MediaOrphan {
  objectKey: string;
  size: number;
  lastModified: string | null;
}

export interface MediaOrphanPage {
  items: MediaOrphan[];
  continuationToken: string | null;
  hasMore: boolean;
  graceHours: number;
}

export interface MediaAudioPage {
  items: MediaOrphan[];
  continuationToken: string | null;
  hasMore: boolean;
}

export interface MediaUploadTarget {
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
  cleanupToken: string;
}

export interface MediaViewTarget {
  url: string;
  expiresIn: number;
}

export interface AdminLoginResult {
  accessToken: string;
  expiresIn: number;
}

export interface ManagedIssue {
  id: string;
  code: string;
  label: string;
  month: string;
  theme: string;
  question: string;
  status: IssueStatus;
  editVersion: number;
  microVoiceTitle: string | null;
  microVoiceDuration: string | null;
  coverObjectKey: string | null;
  microVoiceObjectKey: string | null;
  homeMetaRichText: string;
  homeMetaFontSize: number;
  homeMetaColor: string;
  homeCoverCaptionLeft: string;
  homeCoverCaptionRight: string;
  updatedAt: string;
  draftContent: { sections: ManagedIssueModule[]; discussion: DiscussionContent };
  publishedVersion: number;
  publishedTheme: string | null;
  publishedQuestion: string | null;
  publishedLabel: string | null;
  publishedMonth: string | null;
  publishedCode: string | null;
  publishedMicroVoiceTitle: string | null;
  publishedMicroVoiceDuration: string | null;
  publishedHomeMetaRichText: string | null;
  publishedHomeMetaFontSize: number | null;
  publishedHomeMetaColor: string | null;
  publishedHomeCoverCaptionLeft: string | null;
  publishedHomeCoverCaptionRight: string | null;
}

export interface IssueLifecycle {
  draftCount: number;
  publishedCount: number;
  archivedCount: number;
  publishedCode: string | null;
  publishedUpdatedAt: string | null;
}

export interface MigrationStatus {
  consistent: boolean;
  availableCount: number;
  appliedCount: number;
  pending: string[];
  missing: string[];
  modified: string[];
  latestAvailable: string | null;
  latestApplied: { name: string; appliedAt: string } | null;
}

export interface ManagedObservation {
  id: string;
  method: ObservationMethod;
  status: ObservationStatus;
  issueCode: string | null;
  issueLabel: string | null;
  issueQuestion: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  nickname?: string | null;
}

export interface ManagedObservationDetail extends ManagedObservation {
  revision: number;
  answers: Record<string, string>;
}

export interface PrivacyRequest {
  id: string;
  userId: string | null;
  accountDeleted: boolean;
  status: PrivacyStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  requestedAt: string;
  scheduledFor: string;
  cancelledAt: string | null;
  completedAt: string | null;
}

export interface PrivacyLifecycle {
  pendingCount: number;
  duePendingCount: number;
  leasedCount: number;
  expiredLeaseCount: number;
  failedCount: number;
  completedCount: number;
  cancelledCount: number;
  oldestPendingAt: string | null;
  nextDueAt: string | null;
}

export interface AuditEntry {
  id: string;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ObservationLifecycle {
  retentionDays: number;
  draftCount: number;
  savedCount: number;
  realityCount: number;
  seasonCount: number;
  wellFormedEnvelopeCount: number;
  legacyPlaintextCount: number;
  invalidEnvelopeCount: number;
  staleDraftCount: number;
  oldestDraftAt: string | null;
}

export interface ReencryptResult {
  processed: number;
  failed: number;
  invalid: number;
  scanned: number;
  limit: number;
  activeKeyId: string;
  hasMore: boolean;
  nextCursor: { updatedAt: string; id: string } | null;
}

export type PrivacyProcessOutcome = 'completed' | 'retry_scheduled' | 'failed' | 'disabled' | 'not_ready' | 'recovery_unavailable';

export interface PrivacyProcessResult {
  outcome: PrivacyProcessOutcome;
  attemptCount?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoundedText(value: unknown, maximum: number, minimum = 0): value is string {
  return isText(value) && value.length >= minimum && value.length <= maximum;
}

function isPublicMediaUrl(value: unknown) {
  return isBoundedText(value, 2048) && (value === '' || /^https?:\/\/[^\s]+$/i.test(value));
}

function isHttpUrl(value: unknown, maximum: number) {
  return isBoundedText(value, maximum, 1) && /^https?:\/\/[^\s]+$/i.test(value);
}

export function isManagedMediaKey(value: unknown, prefix: 'content/image/' | 'content/audio/') {
  if (!isBoundedText(value, 512, prefix.length + 1) || !value.startsWith(prefix)) return false;
  const segments = value.split('/');
  return !/[\\\s\u0000-\u001F\u007F?#]/.test(value)
    && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPage(value: unknown): value is Record<string, unknown> & { total: number; limit: number; offset: number } {
  return isRecord(value) && isNonNegativeInteger(value.total) && isPositiveInteger(value.limit) && isNonNegativeInteger(value.offset);
}

export function isPublicHome(value: unknown): value is PublicHome {
  if (!isRecord(value)) return false;
  const issue = value.issue;
  const voice = value.microVoice;
  const validIssue = issue === null || (isRecord(issue)
    && isBoundedText(issue.code, 64, 2) && isBoundedText(issue.label, 80, 2) && isBoundedText(issue.month, 40, 2)
    && isBoundedText(issue.theme, 200, 2) && isBoundedText(issue.question, 500, 2)
    && (issue.microVoiceTitle === null || isBoundedText(issue.microVoiceTitle, 120))
    && (issue.microVoiceDuration === null || isBoundedText(issue.microVoiceDuration, 20))
    && isBoundedText(issue.homeMetaRichText, 2000)
    && isPositiveInteger(issue.homeMetaFontSize) && issue.homeMetaFontSize >= 12 && issue.homeMetaFontSize <= 48
    && typeof issue.homeMetaColor === 'string' && /^#[0-9a-f]{6}$/i.test(issue.homeMetaColor)
    && isBoundedText(issue.homeCoverCaptionLeft, 80) && !/[\r\n]/.test(issue.homeCoverCaptionLeft)
    && isBoundedText(issue.homeCoverCaptionRight, 80) && !/[\r\n]/.test(issue.homeCoverCaptionRight));
  return validIssue && isBoundedText(value.question, 500) && isBoundedText(value.coverUrl, 2048)
    && Array.isArray(value.sections) && value.sections.length <= 16 && value.sections.every((section) => isBoundedText(section, 80, 1))
    && isRecord(voice) && isBoundedText(voice.title, 120) && isBoundedText(voice.duration, 20)
    && isPublicMediaUrl(value.coverUrl) && isPublicMediaUrl(voice.url) && typeof voice.enabled === 'boolean'
    && (voice.enabled ? voice.url !== '' : voice.url === '')
    && (value.publishedVersion === undefined || isNonNegativeInteger(value.publishedVersion))
    && (value.modules === undefined || (Array.isArray(value.modules) && value.modules.length <= 40 && value.modules.every(isManagedIssueModule)));
}

export function isManagedIssueModule(value: unknown): value is ManagedIssueModule {
  const allowed = new Set(['issueMeta', 'coverStory', 'cover', 'opener', 'story', 'storyAction', 'image', 'quote', 'audio', 'question', 'observationAction', 'sharedPracticeAction', 'contents', 'archive', 'brandFooter']);
  return isRecord(value) && isBoundedText(value.id, 64, 2) && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value.id)
    && typeof value.type === 'string' && allowed.has(value.type)
    && isNonNegativeInteger(value.order) && typeof value.enabled === 'boolean';
}

export function isManagedIssue(value: unknown): value is ManagedIssue {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 64, 1) && isBoundedText(value.code, 64, 2) && isBoundedText(value.label, 80, 2) && isBoundedText(value.month, 40, 2)
    && isBoundedText(value.theme, 200, 2) && isBoundedText(value.question, 500, 2)
    && (value.status === 'draft' || value.status === 'published' || value.status === 'archived')
    && isPositiveInteger(value.editVersion)
    && (value.microVoiceTitle === null || isBoundedText(value.microVoiceTitle, 120))
    && (value.microVoiceDuration === null || isBoundedText(value.microVoiceDuration, 20))
    && isBoundedText(value.homeMetaRichText, 2000)
    && isPositiveInteger(value.homeMetaFontSize) && value.homeMetaFontSize >= 12 && value.homeMetaFontSize <= 48
    && typeof value.homeMetaColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.homeMetaColor)
    && isBoundedText(value.homeCoverCaptionLeft, 80) && !/[\r\n]/.test(value.homeCoverCaptionLeft)
    && isBoundedText(value.homeCoverCaptionRight, 80) && !/[\r\n]/.test(value.homeCoverCaptionRight)
    && (value.coverObjectKey === null || isManagedMediaKey(value.coverObjectKey, 'content/image/'))
    && (value.microVoiceObjectKey === null || isManagedMediaKey(value.microVoiceObjectKey, 'content/audio/'))
    && isBoundedText(value.updatedAt, 64, 1)
    && isNonNegativeInteger(value.publishedVersion)
    && (value.publishedTheme === null || isBoundedText(value.publishedTheme, 200, 2))
    && (value.publishedQuestion === null || isBoundedText(value.publishedQuestion, 500, 2))
    && (value.publishedLabel === null || isBoundedText(value.publishedLabel, 80, 2))
    && (value.publishedMonth === null || isBoundedText(value.publishedMonth, 40, 2))
    && (value.publishedCode === null || isBoundedText(value.publishedCode, 64, 2))
    && (value.publishedMicroVoiceTitle === null || isBoundedText(value.publishedMicroVoiceTitle, 120))
    && (value.publishedMicroVoiceDuration === null || isBoundedText(value.publishedMicroVoiceDuration, 20))
    && (value.publishedHomeMetaRichText === null || isBoundedText(value.publishedHomeMetaRichText, 2000))
    && (value.publishedHomeMetaFontSize === null || (isPositiveInteger(value.publishedHomeMetaFontSize) && value.publishedHomeMetaFontSize >= 12 && value.publishedHomeMetaFontSize <= 48))
    && (value.publishedHomeMetaColor === null || (typeof value.publishedHomeMetaColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.publishedHomeMetaColor)))
    && (value.publishedHomeCoverCaptionLeft === null || (isBoundedText(value.publishedHomeCoverCaptionLeft, 80) && !/[\r\n]/.test(value.publishedHomeCoverCaptionLeft)))
    && (value.publishedHomeCoverCaptionRight === null || (isBoundedText(value.publishedHomeCoverCaptionRight, 80) && !/[\r\n]/.test(value.publishedHomeCoverCaptionRight)))
    && isRecord(value.draftContent) && Array.isArray(value.draftContent.sections) && value.draftContent.sections.length <= 40
    && value.draftContent.sections.every(isManagedIssueModule) && isDiscussionContent(value.draftContent.discussion);
}

export function isMediaOrphanPage(value: unknown): value is MediaOrphanPage {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  const continuationToken = value.continuationToken;
  const hasMore = value.hasMore;
  const validCursor = continuationToken === null || (isText(continuationToken) && continuationToken.length > 0 && continuationToken.length <= 2048);
  return value.items.every((item) => isRecord(item)
    && isBoundedText(item.objectKey, 512, 1)
    && (isManagedMediaKey(item.objectKey, 'content/image/') || isManagedMediaKey(item.objectKey, 'content/audio/'))
    && typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0
    && (item.lastModified === null || isBoundedText(item.lastModified, 64, 1)))
    && validCursor
    && typeof hasMore === 'boolean'
    && (hasMore ? continuationToken !== null : continuationToken === null)
    && isPositiveInteger(value.graceHours);
}

export function isMediaAudioPage(value: unknown): value is MediaAudioPage {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  const continuationToken = value.continuationToken;
  const validCursor = continuationToken === null || (isText(continuationToken) && continuationToken.length > 0 && continuationToken.length <= 2048);
  return value.items.every((item) => isRecord(item)
    && isManagedMediaKey(item.objectKey, 'content/audio/')
    && typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0
    && (item.lastModified === null || isBoundedText(item.lastModified, 64, 1)))
    && validCursor
    && typeof value.hasMore === 'boolean'
    && (value.hasMore ? continuationToken !== null : continuationToken === null);
}

export function isMediaUploadTarget(value: unknown): value is MediaUploadTarget {
  return isRecord(value)
    && (isManagedMediaKey(value.objectKey, 'content/image/') || isManagedMediaKey(value.objectKey, 'content/audio/'))
    && isHttpUrl(value.uploadUrl, 4096)
    && isPositiveInteger(value.expiresIn) && isBoundedText(value.cleanupToken, 4096, 1);
}

export function isMediaViewTarget(value: unknown): value is MediaViewTarget {
  return isRecord(value) && isHttpUrl(value.url, 4096)
    && isPositiveInteger(value.expiresIn) && value.expiresIn <= 24 * 60 * 60;
}

export function isMediaDeleteResult(value: unknown): value is { deleted: true; auditIntentRecorded: true; auditRecorded: boolean } {
  return isRecord(value) && value.deleted === true && value.auditIntentRecorded === true && typeof value.auditRecorded === 'boolean';
}

export function isAdminLoginResult(value: unknown): value is AdminLoginResult {
  return isRecord(value) && isBoundedText(value.accessToken, 16_384, 1)
    && typeof value.expiresIn === 'number' && Number.isSafeInteger(value.expiresIn) && value.expiresIn > 0
    && value.expiresIn <= 30 * 24 * 60 * 60;
}

export function isManagedIssueList(value: unknown): value is ManagedIssue[] {
  return Array.isArray(value) && value.every(isManagedIssue);
}

export function isIssueLifecycle(value: unknown): value is IssueLifecycle {
  if (!isRecord(value)) return false;
  const publishedCodePresent = value.publishedCode !== null;
  const publishedUpdatedAtPresent = value.publishedUpdatedAt !== null;
  return isNonNegativeInteger(value.draftCount) && isNonNegativeInteger(value.publishedCount)
    && value.publishedCount <= 1
    && isNonNegativeInteger(value.archivedCount)
    && (value.publishedCode === null || isBoundedText(value.publishedCode, 64, 2))
    && (value.publishedUpdatedAt === null || isBoundedText(value.publishedUpdatedAt, 64, 1))
    && publishedCodePresent === publishedUpdatedAtPresent
    && publishedCodePresent === (value.publishedCount === 1);
}

export function isMigrationStatus(value: unknown): value is MigrationStatus {
  if (!isRecord(value)) return false;
  const isNameList = (items: unknown): items is string[] => Array.isArray(items) && items.length <= 256 && items.every((item) => isBoundedText(item, 128, 1));
  const latestApplied = value.latestApplied;
  return typeof value.consistent === 'boolean'
    && isNonNegativeInteger(value.availableCount)
    && isNonNegativeInteger(value.appliedCount)
    && isNameList(value.pending)
    && isNameList(value.missing)
    && isNameList(value.modified)
    && (value.latestAvailable === null || isBoundedText(value.latestAvailable, 128, 1))
    && (latestApplied === null || (isRecord(latestApplied)
      && isBoundedText(latestApplied.name, 128, 1)
      && isBoundedText(latestApplied.appliedAt, 64, 1)));
}

export function isIssueDashboardConsistent(summary: unknown, issuesValue: unknown, homeValue: unknown): summary is IssueLifecycle {
  if (!isIssueLifecycle(summary) || !isManagedIssueList(issuesValue) || !isPublicHome(homeValue)) return false;
  const issues = issuesValue;
  const publishedIssues = issues.filter((issue) => issue.status === 'published');
  const publishedIssue = publishedIssues[0] ?? null;
  const publicIssue = homeValue.issue;
  return summary.draftCount === issues.filter((issue) => issue.status === 'draft').length
    && summary.publishedCount === publishedIssues.length
    && summary.archivedCount === issues.filter((issue) => issue.status === 'archived').length
    && summary.publishedCode === (publishedIssue?.publishedCode ?? null)
    && summary.publishedUpdatedAt === (publishedIssue?.updatedAt ?? null)
    && homeValue.question === (publishedIssue?.publishedQuestion ?? '')
    && (publicIssue?.code ?? null) === (publishedIssue?.publishedCode ?? null)
    && (publicIssue?.label ?? null) === (publishedIssue?.publishedLabel ?? null)
    && (publicIssue?.month ?? null) === (publishedIssue?.publishedMonth ?? null)
    && (publicIssue?.theme ?? null) === (publishedIssue?.publishedTheme ?? null)
    && (publicIssue?.question ?? null) === (publishedIssue?.question ?? null)
    && (publicIssue?.microVoiceTitle ?? null) === (publishedIssue?.publishedMicroVoiceTitle ?? null)
    && (publicIssue?.microVoiceDuration ?? null) === (publishedIssue?.publishedMicroVoiceDuration ?? null)
    && (publicIssue?.homeMetaRichText ?? '') === (publishedIssue?.publishedHomeMetaRichText ?? '')
    && (publicIssue?.homeMetaFontSize ?? 16) === (publishedIssue?.publishedHomeMetaFontSize ?? 16)
    && (publicIssue?.homeMetaColor ?? '') === (publishedIssue?.publishedHomeMetaColor ?? '')
    && (publicIssue?.homeCoverCaptionLeft ?? '') === (publishedIssue?.publishedHomeCoverCaptionLeft ?? '')
    && (publicIssue?.homeCoverCaptionRight ?? '') === (publishedIssue?.publishedHomeCoverCaptionRight ?? '')
    && homeValue.microVoice.title === (publishedIssue?.publishedMicroVoiceTitle ?? '')
    && homeValue.microVoice.duration === (publishedIssue?.publishedMicroVoiceDuration ?? '')
    // Media URLs are signed independently and may be temporarily unavailable
    // even when a published snapshot references an object. That must not make
    // otherwise-consistent issue metadata fail the whole dashboard refresh.
    && typeof homeValue.coverUrl === 'string'
    && typeof homeValue.microVoice.enabled === 'boolean';
}

export function isManagedObservation(value: unknown): value is ManagedObservation {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 64, 1) && (value.method === 'reality' || value.method === 'season')
    && (value.status === 'draft' || value.status === 'saved')
    && (value.issueCode === null || isBoundedText(value.issueCode, 64))
    && (value.issueLabel === null || isBoundedText(value.issueLabel, 80))
    && (value.issueQuestion === null || isBoundedText(value.issueQuestion, 500))
    && isBoundedText(value.createdAt, 64, 1) && isBoundedText(value.updatedAt, 64, 1)
    && isBoundedText(value.userId, 64, 1);
}

export function isManagedObservationDetail(value: unknown): value is ManagedObservationDetail {
  if (!isRecord(value) || !isManagedObservation(value) || !isPositiveInteger(value.revision) || !isRecord(value.answers)) return false;
  const allowed = value.method === 'reality'
    ? new Set(['situation', 'body', 'need', 'nextAction'])
    : new Set(['birthDate', 'experience', 'season', 'seasonNote', 'seasonStates', 'seasonStatesDetail', 'seasonInsight', 'keepUnderstanding', 'rejectUnderstanding', 'sevenDayAction']);
  return Object.entries(value.answers).every(([key, answer]) => allowed.has(key) && isBoundedText(answer, 1000));
}

export function isManagedObservationPage(value: unknown): value is { items: ManagedObservation[]; total: number; limit: number; offset: number } {
  return isPage(value) && Array.isArray(value.items) && value.items.every(isManagedObservation);
}

export function isObservationLifecycle(value: unknown): value is ObservationLifecycle {
  if (!isRecord(value)) return false;
  return isPositiveInteger(value.retentionDays)
    && isNonNegativeInteger(value.draftCount) && isNonNegativeInteger(value.savedCount)
    && isNonNegativeInteger(value.realityCount) && isNonNegativeInteger(value.seasonCount)
    && isNonNegativeInteger(value.wellFormedEnvelopeCount) && isNonNegativeInteger(value.legacyPlaintextCount)
    && isNonNegativeInteger(value.invalidEnvelopeCount) && isNonNegativeInteger(value.staleDraftCount)
    && (value.oldestDraftAt === null || isBoundedText(value.oldestDraftAt, 64, 1));
}

export function isPrivacyRequest(value: unknown): value is PrivacyRequest {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 64, 1) && (value.userId === null || isBoundedText(value.userId, 64, 1)) && typeof value.accountDeleted === 'boolean'
    && (value.status === 'pending' || value.status === 'cancelled' || value.status === 'completed' || value.status === 'failed')
    && isNonNegativeInteger(value.attemptCount)
    && (value.nextAttemptAt === null || isBoundedText(value.nextAttemptAt, 64, 1))
    && (value.lastError === null || isBoundedText(value.lastError, 512))
    && isBoundedText(value.requestedAt, 64, 1) && isBoundedText(value.scheduledFor, 64, 1)
    && (value.cancelledAt === null || isBoundedText(value.cancelledAt, 64, 1))
    && (value.completedAt === null || isBoundedText(value.completedAt, 64, 1));
}

export function isPrivacyLifecycle(value: unknown): value is PrivacyLifecycle {
  if (!isRecord(value)) return false;
  return isNonNegativeInteger(value.pendingCount) && isNonNegativeInteger(value.duePendingCount)
    && isNonNegativeInteger(value.leasedCount)
    && isNonNegativeInteger(value.expiredLeaseCount)
    && value.duePendingCount <= value.pendingCount
    && value.leasedCount <= value.pendingCount
    && value.expiredLeaseCount <= value.pendingCount - value.leasedCount
    && isNonNegativeInteger(value.failedCount) && isNonNegativeInteger(value.completedCount)
    && isNonNegativeInteger(value.cancelledCount)
    && (value.oldestPendingAt === null || isBoundedText(value.oldestPendingAt, 64, 1))
    && (value.nextDueAt === null || isBoundedText(value.nextDueAt, 64, 1));
}

export function isPrivacyRequestPage(value: unknown): value is { items: PrivacyRequest[]; total: number; limit: number; offset: number; summary: PrivacyLifecycle } {
  return isPage(value) && Array.isArray(value.items) && value.items.every(isPrivacyRequest) && isPrivacyLifecycle(value.summary);
}

export function isAuditEntry(value: unknown): value is AuditEntry {
  if (!isRecord(value)) return false;
  return isBoundedText(value.id, 64, 1) && (value.actorType === 'user' || value.actorType === 'admin' || value.actorType === 'system')
    && (value.actorId === null || isBoundedText(value.actorId, 128))
    && isBoundedText(value.action, 120, 1) && isBoundedText(value.resourceType, 120, 1)
    && (value.resourceId === null || isBoundedText(value.resourceId, 512))
    && isBoundedText(value.createdAt, 64, 1);
}

export function isAuditPage(value: unknown): value is { rows: AuditEntry[]; total: number; limit: number; offset: number } {
  return isPage(value) && Array.isArray(value.rows) && value.rows.every(isAuditEntry);
}

export function isReencryptResult(value: unknown): value is ReencryptResult {
  if (!isRecord(value)) return false;
  const cursor = value.nextCursor;
  const validCursor = cursor === null || (isRecord(cursor) && isBoundedText(cursor.updatedAt, 64, 1) && isBoundedText(cursor.id, 64, 1));
  if (!validCursor || (value.hasMore === true && cursor === null) || (value.hasMore === false && cursor !== null)) return false;
  return isNonNegativeInteger(value.processed) && isNonNegativeInteger(value.failed) && isNonNegativeInteger(value.invalid)
    && isNonNegativeInteger(value.scanned) && isPositiveInteger(value.limit) && isBoundedText(value.activeKeyId, 64, 1)
    && typeof value.hasMore === 'boolean';
}

export function isPrivacyProcessResult(value: unknown): value is PrivacyProcessResult {
  if (!isRecord(value)) return false;
  const outcome = value.outcome;
  const knownOutcome = outcome === 'completed' || outcome === 'retry_scheduled' || outcome === 'failed'
    || outcome === 'disabled' || outcome === 'not_ready' || outcome === 'recovery_unavailable';
  if (!knownOutcome) return false;
  if (outcome === 'retry_scheduled' || outcome === 'failed') return isPositiveInteger(value.attemptCount);
  return value.attemptCount === undefined;
}

export function isRetryResult(value: unknown): value is { queued: boolean } {
  return isRecord(value) && typeof value.queued === 'boolean';
}
