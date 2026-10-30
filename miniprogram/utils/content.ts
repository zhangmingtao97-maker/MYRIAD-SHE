export interface PublicHomeContent {
  issue: { code: string; label: string; month: string; theme: string; question: string; microVoiceTitle: string | null; microVoiceDuration: string | null; homeMetaRichText: string; homeMetaFontSize: number; homeMetaColor: string; homeCoverCaptionLeft: string; homeCoverCaptionRight: string } | null;
  question: string;
  coverUrl: string;
  microVoice: { title: string; duration: string; url: string; enabled: boolean };
  sections: string[];
  publishedVersion?: number;
  modules?: PublicHomeModule[];
}

export interface PublicHomeModule {
  id: string;
  type: string;
  order: number;
  enabled: boolean;
  [key: string]: unknown;
}

interface PublicAudioTrack {
  id: string;
  title: string;
  duration: string;
  audioUrl: string;
  quote: string;
  subtitle: string;
  transcript: string;
}

export interface PracticeContent {
  title: string;
  titleRichText: string;
  titleFontSize: number;
  titleColor: string;
  intro: string;
  introRichText: string;
  introFontSize: number;
  introColor: string;
  metaLeftRichText: string;
  metaLeftFontSize: number;
  metaLeftColor: string;
  metaRightRichText: string;
  metaRightFontSize: number;
  metaRightColor: string;
  observationCopy: Record<string, { richText: string; fontSize: number; color: string }>;
  sharedPracticeCopy: Record<string, { richText: string; fontSize: number; color: string }>;
  entries: Array<{
    key: string; title: string; description: string; enabled: boolean;
    contextRichText: string; contextFontSize: number; contextColor: string;
    titleRichText: string; titleFontSize: number; titleColor: string;
    descriptionRichText: string; descriptionFontSize: number; descriptionColor: string;
  }>;
}

export interface DailyObjectsContent {
  editVersion: number;
  brandName: string;
  brandSubtitle: string;
  bagLabel: string;
  bagCount: string;
  eyebrow: string;
  title: string;
  intro: string;
  previewNote: string;
  supportLabel: string;
  products: Array<{ id: string; name: string; english: string; image: string; price: string; priceLabel: string; description: string; optionDetails: string; dailyUseDetails: string; deliveryDetails: string; enabled: boolean }>;
}

export interface MinePageContent {
  editVersion?: number;
  title: string;
  intro: string;
  observationHeading: string;
  emptyTitle: string;
  emptyIntro: string;
  startButton: string;
  discussionHeading: string;
  discussionCount: string;
  discussionEmptyAction: string;
  discussionIntro: string;
  practiceHeading: string;
  practiceCount: string;
  practiceEmptyTitle: string;
  practiceIntro: string;
  privacyHeading: string;
  privacyAction: string;
}

export interface PrivacyCopyItem {
  richText: string;
  fontSize: number;
  color: string;
}

export interface PrivacyPageContent {
  editVersion: number;
  copy: Record<string, PrivacyCopyItem>;
}

export interface PrivacyPolicyContent {
  editVersion: number;
  version: string;
  title: PrivacyCopyItem;
  intro: PrivacyCopyItem;
  effectiveDate: string;
  updatedDate?: string;
  updateNotes: string;
  body: PrivacyCopyItem;
}

export interface AboutContent {
  editVersion: number;
  publishedVersion: number;
  brandIntro: string;
  contentSources: string;
  contactInfo: string;
}

export const DEFAULT_ABOUT_CONTENT: AboutContent = {
  editVersion: 1,
  publishedVersion: 1,
  brandIntro: 'MYRIAD SHE 是一个陪伴女性回到自身经验的观察与实践空间。',
  contentSources: '内容来自团队原创研究、实践设计与经授权引用的资料。',
  contactInfo: '如需联系，请通过应用内客服渠道与我们联系。',
};

export interface PublishedIssue {
  code: string;
  label: string;
  question: string;
}

export interface PublicArchiveIssue {
  code: string;
  label: string;
  month: string;
  theme: string;
  question: string;
  status: 'archived' | 'published';
  version: number;
  publishedAt: string;
}

export function isPublicArchive(value: unknown): value is { issues: PublicArchiveIssue[] } {
  if (!isRecord(value) || !Array.isArray(value.issues) || value.issues.length > 100) return false;
  return value.issues.every((issue) => isRecord(issue)
    && isBoundedText(issue.code, 64, 2) && isBoundedText(issue.label, 80, 2)
    && isBoundedText(issue.month, 40, 2) && isBoundedText(issue.theme, 200, 2)
    && isBoundedText(issue.question, 500, 2)
    && (issue.status === 'archived' || issue.status === 'published')
    && Number.isSafeInteger(issue.version) && Number(issue.version) >= 1
    && isBoundedText(issue.publishedAt, 80, 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBoundedText(value: unknown, maximum: number, minimum = 0): value is string {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum;
}

function isPublicMediaUrl(value: unknown) {
  return isBoundedText(value, 2048) && (value === '' || /^https?:\/\/[^\s]+$/i.test(value));
}

export function isPublicHomeContent(value: unknown): value is PublicHomeContent {
  if (!isRecord(value)) return false;
  const issue = value.issue;
  const voice = value.microVoice;
  const validIssue = issue === null || (isRecord(issue)
    && isBoundedText(issue.code, 64, 2) && isBoundedText(issue.label, 80, 2) && isBoundedText(issue.month, 40, 2)
    && isBoundedText(issue.theme, 200, 2) && isBoundedText(issue.question, 500, 2)
    && (issue.microVoiceTitle === null || isBoundedText(issue.microVoiceTitle, 120))
    && (issue.microVoiceDuration === null || isBoundedText(issue.microVoiceDuration, 20))
    && isBoundedText(issue.homeMetaRichText, 2000)
    && typeof issue.homeMetaFontSize === 'number' && Number.isSafeInteger(issue.homeMetaFontSize) && issue.homeMetaFontSize >= 12 && issue.homeMetaFontSize <= 48
    && typeof issue.homeMetaColor === 'string' && /^#[0-9a-f]{6}$/i.test(issue.homeMetaColor)
    && isBoundedText(issue.homeCoverCaptionLeft, 80) && !/[\r\n]/.test(issue.homeCoverCaptionLeft)
    && isBoundedText(issue.homeCoverCaptionRight, 80) && !/[\r\n]/.test(issue.homeCoverCaptionRight));
  return validIssue && isBoundedText(value.question, 500)
    && isPublicMediaUrl(value.coverUrl)
    && Array.isArray(value.sections) && value.sections.length <= 16 && value.sections.every((section) => isBoundedText(section, 80, 1))
    && isRecord(voice) && isBoundedText(voice.title, 120) && isBoundedText(voice.duration, 20)
    && isPublicMediaUrl(voice.url) && typeof voice.enabled === 'boolean'
    && (voice.enabled ? voice.url !== '' : voice.url === '')
    && (value.publishedVersion === undefined || (Number.isSafeInteger(value.publishedVersion) && Number(value.publishedVersion) >= 0))
    && (value.modules === undefined || (Array.isArray(value.modules) && value.modules.length <= 40 && value.modules.every(isPublicHomeModule)));
}

function isPublicHomeModule(value: unknown): value is PublicHomeModule {
  return isRecord(value) && isBoundedText(value.id, 64, 2) && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value.id)
    && isBoundedText(value.type, 48, 1) && Number.isSafeInteger(value.order) && Number(value.order) >= 0
    && typeof value.enabled === 'boolean'
    && Object.entries(value).every(([key, field]) => ['id', 'type', 'order', 'enabled'].includes(key)
      || (key === 'tracks' ? isPublicAudioTracks(field)
        : key.endsWith('Url') ? isPublicMediaUrl(field)
        : key.endsWith('FontSize') ? Number.isSafeInteger(field) && Number(field) >= 20 && Number(field) <= 120
          : key.endsWith('Color') ? typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field)
            : typeof field === 'string' && field.length <= 6000));
}

function isPublicAudioTracks(value: unknown): value is PublicAudioTrack[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  const ids = new Set<string>();
  return value.every((track) => isRecord(track)
    && isBoundedText(track.id, 64, 2) && /^[a-z0-9][a-z0-9-]{1,63}$/.test(track.id) && !ids.has(track.id) && Boolean(ids.add(track.id))
    && isBoundedText(track.title, 120) && isBoundedText(track.duration, 20) && isPublicMediaUrl(track.audioUrl)
    && isBoundedText(track.quote, 500) && isBoundedText(track.subtitle, 500) && isBoundedText(track.transcript, 6000));
}

function isCopyItem(value: unknown): value is { richText: string; fontSize: number; color: string } {
  return isRecord(value)
    && isBoundedText(value.richText, 2000, 1)
    && isPracticeFontSize(value.fontSize)
    && isPracticeColor(value.color);
}

export function isPracticeContent(value: unknown): value is PracticeContent {
  if (!isRecord(value) || !isBoundedText(value.title, 80, 1) || !isBoundedText(value.titleRichText, 2000, 1)
    || !isPracticeFontSize(value.titleFontSize) || !isPracticeColor(value.titleColor)
    || !isBoundedText(value.intro, 240, 1)
    || !isBoundedText(value.introRichText, 2000, 1) || !isPracticeFontSize(value.introFontSize)
    || !isPracticeColor(value.introColor)
    || !isBoundedText(value.metaLeftRichText, 2000, 1) || !isPracticeFontSize(value.metaLeftFontSize) || !isPracticeColor(value.metaLeftColor)
    || !isBoundedText(value.metaRightRichText, 2000, 1) || !isPracticeFontSize(value.metaRightFontSize) || !isPracticeColor(value.metaRightColor)
    || !isRecord(value.observationCopy) || !['metaLeft', 'metaRight', 'introTitle', 'introDescription', 'realityContext', 'realityTitle', 'realityDescription', 'realityAction', 'seasonContext', 'seasonTitle', 'seasonDescription', 'seasonGuide', 'seasonAction', 'privacyLabel', 'privacyCopy'].every((key) => Object.hasOwn(value.observationCopy as Record<string, unknown>, key))
    || !Object.values(value.observationCopy).every((item) => isRecord(item)
      && isBoundedText(item.richText, 2000, 1) && isPracticeFontSize(item.fontSize) && isPracticeColor(item.color))
    || !isRecord(value.sharedPracticeCopy) || !['topbarTitle', 'metaLeft', 'metaRight', 'heroTitle', 'heroIntro', 'onlineNumber', 'onlineContext', 'onlineIssueLabel', 'onlineIssueTheme', 'onlineQuestion', 'onlineCopy', 'onlineAction', 'offlineNumber', 'offlineContext', 'offlineTitle', 'offlineCopy', 'noticeLabel', 'noticeCode', 'rule1Number', 'rule1Title', 'rule1Copy', 'rule2Number', 'rule2Title', 'rule2Copy', 'rule3Number', 'rule3Title', 'rule3Copy', 'rule4Number', 'rule4Title', 'rule4Copy', 'nextAction'].every((key) => Object.hasOwn(value.sharedPracticeCopy as Record<string, unknown>, key))
    || !Object.entries(value.sharedPracticeCopy).every(([key, item]) => {
      if (key === 'onlineParagraphs') return Array.isArray(item) && item.length <= 12 && item.every(isCopyItem);
      if (key === 'rules') return Array.isArray(item) && item.length <= 12 && item.every((rule) => isRecord(rule) && isCopyItem(rule.number) && isCopyItem(rule.title) && isCopyItem(rule.copy));
      return isCopyItem(item);
    })
    || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 100) return false;
  const entries = value.entries;
  if (!entries.every((entry) => isRecord(entry)
    && typeof entry.key === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(entry.key)
    && isBoundedText(entry.title, 80, 1) && isBoundedText(entry.description, 240, 1) && typeof entry.enabled === 'boolean'
    && isBoundedText(entry.contextRichText, 2000, 1) && isPracticeFontSize(entry.contextFontSize) && isPracticeColor(entry.contextColor)
    && isBoundedText(entry.titleRichText, 2000, 1) && isPracticeFontSize(entry.titleFontSize) && isPracticeColor(entry.titleColor)
    && isBoundedText(entry.descriptionRichText, 2000, 1) && isPracticeFontSize(entry.descriptionFontSize) && isPracticeColor(entry.descriptionColor))) return false;
  const byKey = new Map(entries.map((entry) => [String((entry as Record<string, unknown>).key), entry as Record<string, unknown>]));
  return byKey.size === entries.length
    && byKey.has('observation');
}

export function isDailyObjectsContent(value: unknown): value is DailyObjectsContent {
  if (!isRecord(value) || !Number.isSafeInteger(value.editVersion) || Number(value.editVersion) < 1
    || !['brandName', 'brandSubtitle', 'bagLabel', 'bagCount', 'eyebrow', 'title', 'intro', 'previewNote', 'supportLabel'].every((key) => isBoundedText(value[key], 2048))
    || !Array.isArray(value.products) || value.products.length > 50) return false;
  const ids = new Set<string>();
  return value.products.every((item) => isRecord(item)
    && isBoundedText(item.id, 32, 2) && /^[a-z0-9][a-z0-9-]{1,31}$/.test(item.id) && !ids.has(item.id) && Boolean(ids.add(item.id))
    && isBoundedText(item.name, 80, 1) && isBoundedText(item.english, 80, 1) && isBoundedText(item.image, 2048, 1)
    && isBoundedText(item.price, 40) && isBoundedText(item.priceLabel, 80) && isBoundedText(item.description, 1000, 1)
    && isBoundedText(item.optionDetails, 1000) && isBoundedText(item.dailyUseDetails, 1000) && isBoundedText(item.deliveryDetails, 1000)
    && typeof item.enabled === 'boolean');
}

export interface StoreStatus {
  open: boolean;
}

/** 商城总闸状态：由后台系统设置的 store_enabled 与实践入口 daily-goods 共同决定。 */
export function isStoreStatus(value: unknown): value is StoreStatus {
  return isRecord(value) && typeof value.open === 'boolean';
}

function isPracticeFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 10 && value <= 48;
}

function isPracticeColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function isMinePageContent(value: unknown): value is MinePageContent {
  return isRecord(value)
    && isBoundedText(value.title, 6000, 1)
    && isBoundedText(value.intro, 6000, 1)
    && isBoundedText(value.observationHeading, 6000, 1)
    && isBoundedText(value.emptyTitle, 6000, 1)
    && isBoundedText(value.emptyIntro, 6000, 1)
    && isBoundedText(value.startButton, 6000, 1)
    && isBoundedText(value.discussionHeading, 6000, 1)
    && isBoundedText(value.discussionCount, 6000, 1)
    && isBoundedText(value.discussionEmptyAction, 6000, 1)
    && isBoundedText(value.discussionIntro, 6000, 1)
    && isBoundedText(value.practiceHeading, 6000, 1)
    && isBoundedText(value.practiceCount, 6000, 1)
    && isBoundedText(value.practiceEmptyTitle, 6000, 1)
    && isBoundedText(value.practiceIntro, 6000, 1)
    && isBoundedText(value.privacyHeading, 6000, 1)
    && isBoundedText(value.privacyAction, 6000, 1);
}

const privacyPageCopyKeys = [
  'topbarTitle', 'metaLeft', 'metaRight', 'heroTitle', 'heroIntro',
  'privacyNumber', 'privacyLabel', 'privacyTitle', 'privacyCopy', 'privacyStatus',
  'methodNumber', 'methodLabel', 'methodTitle', 'methodCopy', 'methodAction',
  'reminderNumber', 'reminderLabel', 'reminderTitle', 'reminderCopy', 'reminderAction',
  'aboutTitle', 'aboutCopy', 'aboutAction', 'localLabel', 'localTitle', 'localCopy',
  'localAction', 'localConfirm', 'footerCopy', 'policyTitle', 'policyCopy',
];

function isPrivacyCopyItem(value: unknown, maximum = 2000, allowEmpty = false): value is PrivacyCopyItem {
  return isRecord(value) && isBoundedText(value.richText, maximum, allowEmpty ? 0 : 1) && isPracticeFontSize(value.fontSize) && isPracticeColor(value.color);
}

export function isPrivacyPageContent(value: unknown): value is PrivacyPageContent {
  if (!isRecord(value) || !Number.isSafeInteger(value.editVersion) || Number(value.editVersion) < 1 || !isRecord(value.copy)) return false;
  const copy = value.copy as Record<string, unknown>;
  return privacyPageCopyKeys.every((key) => isPrivacyCopyItem(copy[key]));
}

export function isPrivacyPolicyContent(value: unknown): value is PrivacyPolicyContent {
  return isRecord(value) && Number.isSafeInteger(value.editVersion) && Number(value.editVersion) >= 1
    && isPrivacyCopyItem(value.title) && isPrivacyCopyItem(value.intro, 1000, true) && isBoundedText(value.effectiveDate, 80, 1)
    && isBoundedText(value.version, 16, 1) && /^\d{1,4}(\.\d{1,4}){0,2}$/.test(value.version)
    && isBoundedText(value.updateNotes, 1000)
    && (value.updatedDate === undefined || isBoundedText(value.updatedDate, 80))
    && isPrivacyCopyItem(value.body, 200000);
}

export function isAboutContent(value: unknown): value is AboutContent {
  return isRecord(value) && Number.isSafeInteger(value.editVersion) && Number(value.editVersion) > 0
    && Number.isSafeInteger(value.publishedVersion) && Number(value.publishedVersion) > 0
    && isBoundedText(value.brandIntro, 6000, 1) && isBoundedText(value.contentSources, 6000, 1)
    && isBoundedText(value.contactInfo, 6000, 1);
}

export function isPublishedIssue(value: unknown): value is PublishedIssue {
  return isRecord(value) && isBoundedText(value.code, 64, 2) && isBoundedText(value.label, 80, 2) && isBoundedText(value.question, 500, 2);
}

export interface LifeCard {
  month: number;
  day: number;
  suit: 'spade' | 'heart' | 'club' | 'diamond';
  rank: string;
  theme: string;
  title: string;
  summary: string;
  prompt: string;
  note: string;
  sourceNote: string;
}

export function isLifeCard(value: unknown): value is LifeCard {
  if (!isRecord(value)) return false;
  const suit = value.suit;
  return Number.isSafeInteger(value.month) && Number(value.month) >= 1 && Number(value.month) <= 12
    && Number.isSafeInteger(value.day) && Number(value.day) >= 1 && Number(value.day) <= 31
    && (suit === 'spade' || suit === 'heart' || suit === 'club' || suit === 'diamond')
    && isBoundedText(value.rank, 2, 1)
    && isBoundedText(value.theme, 40)
    && isBoundedText(value.title, 60, 1)
    && isBoundedText(value.summary, 600, 1)
    && isBoundedText(value.prompt, 300, 1)
    && isBoundedText(value.note, 400)
    && isBoundedText(value.sourceNote, 2000);
}