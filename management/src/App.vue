<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LegalDocumentManager from './components/LegalDocumentManager.vue';
import ModuleStateMachine from './components/ModuleStateMachine.vue';
import AnimatedNumber from './components/AnimatedNumber.vue';
import AdminCommandMenu from './components/AdminCommandMenu.vue';
import { useAdminDialogs } from './composables/useAdminDialogs';
import LegalHistoryPanel from './components/LegalHistoryPanel.vue';
import DatePickerField from './components/DatePickerField.vue';
import RichTextEditor from './components/RichTextEditor.vue';
import JournalRichTextField from './components/JournalRichTextField.vue';
import RichTextView from './components/RichTextView.vue';
import JournalHomePreview from './components/JournalHomePreview.vue';
import PracticePagePreview from './components/PracticePagePreview.vue';
import DailyObjectsPreview from './components/DailyObjectsPreview.vue';
import ImageCropDialog from './components/ImageCropDialog.vue';
import AboutPagePreview from './components/AboutPagePreview.vue';
import MinePagePreview from './components/MinePagePreview.vue';
import CopyPagePreview from './components/CopyPagePreview.vue';
import RealityStagesPreview from './components/RealityStagesPreview.vue';
import SeasonIntroPreview from './components/SeasonIntroPreview.vue';
import SeasonStagesPreview from './components/SeasonStagesPreview.vue';
import ObservationRecordPreview from './components/ObservationRecordPreview.vue';
import AudioPagePreview from './components/AudioPagePreview.vue';
import StoryDetailPreview from './components/StoryDetailPreview.vue';
import PracticeEntryEditor from './components/PracticeEntryEditor.vue';
import PracticeSaveBar from './components/PracticeSaveBar.vue';
import { practiceEntryFixedStyle, practiceEntryText } from './practiceEntry';
import { normalizePracticeContentResponse } from './practice-content-defaults';
import { createDefaultDiscussionContent } from './discussion-content';
import { isSeasonStagesCopy, seasonActionCopyGroups, seasonCardCopyGroups, seasonChoiceCopyGroups, seasonNowChangeCopyGroups, seasonNowRecentCopyGroups, seasonStageDefinitions, seasonStagesFormatIssue } from './season-stages';
import type { SeasonNowTab, SeasonStageKey, SeasonStagesCopy } from './season-stages';
import { isObservationRecordCopy, observationRecordCopyGroups, observationRecordFormatIssue } from './observation-record';
import type { ObservationRecordCopy } from './observation-record';
import type { DiscussionContent, DiscussionCopy } from './discussion-content';
import type { LegalContent, LegalKey } from './legal-document';
import { isAdminLoginResult, isAdminNotificationPage, isAdminNotificationReadResult, isAdminUnreadCount, isAuditPage, isIssueDashboardConsistent, isManagedIssueList, isManagedMediaKey, isManagedObservationDetail, isManagedObservationPage, isMediaAudioPage, isMediaDeleteResult, isMediaOrphanPage, isMediaUploadTarget, isMediaViewTarget, isObservationLifecycle, isPrivacyProcessResult, isPrivacyRequestPage, isPublicHome, isReencryptResult, isRetryResult } from './api-shapes';
import type { AdminNotification, AuditEntry, IssueLifecycle, ManagedAudioAction, ManagedAudioTrack, ManagedIssue, ManagedIssueModule, ManagedObservation, ManagedObservationDetail, MediaOrphan, ObservationLifecycle, PrivacyLifecycle, PrivacyRequest, PublicHome } from './api-shapes';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://192.168.1.32:61021/api';
useAdminDialogs();
const maxAdminTokenLength = 16_384;
const maxAdminSessionSeconds = 30 * 24 * 60 * 60;
function readAdminToken() {
  const value = localStorage.getItem('myriad_she_admin_token') || '';
  return value.length > 0 && value.length <= maxAdminTokenLength ? value : '';
}
function readAdminExpiry() {
  const value = Number(localStorage.getItem('myriad_she_admin_expires_at') || 0);
  const now = Date.now();
  return Number.isSafeInteger(value) && value > now && value <= now + maxAdminSessionSeconds * 1000 ? value : 0;
}
function positiveEnvNumber(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback;
}
const apiRequestTimeoutMs = positiveEnvNumber(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS, 12_000, 120_000);
const mediaUploadTimeoutMs = positiveEnvNumber(import.meta.env.VITE_MEDIA_UPLOAD_TIMEOUT_MS, 90_000, 300_000);
const username = ref('');
const password = ref('');
const token = ref(readAdminToken());
const sessionExpiresAt = ref(readAdminExpiry());
const loading = ref(false);
const error = ref('');
const wecomQrVisible = ref(false);
const wecomLoading = ref(false);
const wecomError = ref('');
type WecomLoginConfig = {
  enabled: boolean;
  appid?: string;
  agentid?: string;
  redirectUri?: string;
  state?: string;
  expiresIn?: number;
  qrConnectUrl?: string;
};
type WecomLoginInstance = { destroyed?: () => void };
let wecomQrInstance: WecomLoginInstance | null = null;
let wecomSdkPromise: Promise<void> | null = null;
const home = ref<PublicHome | null>(null);
const issues = ref<ManagedIssue[]>([]);
const issueLifecycle = ref<IssueLifecycle | null>(null);
type PracticeEntry = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
  target?: string;
  contextRichText: string;
  contextFontSize: number;
  contextColor: string;
  titleRichText: string;
  titleFontSize: number;
  titleColor: string;
  descriptionRichText: string;
  descriptionFontSize: number;
  descriptionColor: string;
};
type ObservationCopyKey = 'metaLeft' | 'metaRight' | 'introTitle' | 'introDescription' | 'realityContext' | 'realityTitle' | 'realityDescription' | 'realityAction' | 'seasonContext' | 'seasonTitle' | 'seasonDescription' | 'seasonGuide' | 'seasonAction' | 'privacyLabel' | 'privacyCopy';
type ObservationCopyItem = { richText: string; fontSize: number; color: string };
type RealityStageKey = 'situation' | 'body' | 'need' | 'nextAction';
type RealityStageCopyKey = 'stageLabel' | 'title' | 'description' | 'inputLabel' | 'placeholder' | 'nextLabel' | 'previousLabel' | 'footer';
type RealityStageCopy = Record<RealityStageCopyKey, ObservationCopyItem> & {
  align: 'left' | 'center' | 'right';
  spacing: 'compact' | 'standard' | 'roomy';
};
type SeasonIntroCopyKey = 'navTitle' | 'metaLeft' | 'metaRight' | 'heroTitle' | 'heroDescription' | 'guideTitle' | 'guideRequired' | 'guideRead' | 'guideParagraphOne' | 'guideParagraphTwo' | 'guideSteps' | 'guideGateNote' | 'guideConfirm' | 'birthdayLabel' | 'monthLabel' | 'dayLabel' | 'monthPlaceholder' | 'dayPlaceholder' | 'birthdayNote' | 'rememberTitle' | 'rememberNote' | 'primaryAction' | 'primaryLockedAction' | 'realityAction' | 'skipAction';
type SeasonIntroCopy = Record<SeasonIntroCopyKey, ObservationCopyItem> & {
  align: 'left' | 'center' | 'right';
  spacing: 'compact' | 'standard' | 'roomy';
};
type PracticeObservationCopy = Record<ObservationCopyKey, ObservationCopyItem> & {
  realityStages: Record<RealityStageKey, RealityStageCopy>;
  seasonIntro: SeasonIntroCopy;
  seasonStages: SeasonStagesCopy;
  record: ObservationRecordCopy;
};
const realityStageDefinitions: Array<{ key: RealityStageKey; label: string }> = [
  { key: 'situation', label: '底色' },
  { key: 'body', label: '此刻' },
  { key: 'need', label: '选择' },
  { key: 'nextAction', label: '行动' },
];
const realityStageCopyFields: Array<{ key: RealityStageCopyKey; label: string }> = [
  { key: 'stageLabel', label: '阶段名' },
  { key: 'title', label: '标题' },
  { key: 'description', label: '说明' },
  { key: 'inputLabel', label: '输入提示' },
  { key: 'placeholder', label: '占位文案' },
  { key: 'nextLabel', label: '下一步按钮' },
  { key: 'previousLabel', label: '上一步按钮' },
  { key: 'footer', label: '底部说明' },
];
const seasonIntroCopyGroups: Array<{ title: string; fields: Array<{ key: SeasonIntroCopyKey; label: string }> }> = [
  { title: '导航与页眉', fields: [{ key: 'navTitle', label: '导航栏标题' }, { key: 'metaLeft', label: '左侧页眉' }, { key: 'metaRight', label: '右侧页眉' }] },
  { title: '标题区', fields: [{ key: 'heroTitle', label: '主标题' }, { key: 'heroDescription', label: '主说明' }] },
  { title: '方法说明', fields: [{ key: 'guideTitle', label: '说明标题' }, { key: 'guideRequired', label: '未读状态' }, { key: 'guideRead', label: '已读状态' }, { key: 'guideParagraphOne', label: '说明第一段' }, { key: 'guideParagraphTwo', label: '说明第二段' }, { key: 'guideSteps', label: '阶段路径' }, { key: 'guideGateNote', label: '确认前提示' }, { key: 'guideConfirm', label: '确认按钮' }] },
  { title: '生日选择', fields: [{ key: 'birthdayLabel', label: '生日标题' }, { key: 'monthLabel', label: '月份标签' }, { key: 'dayLabel', label: '日期标签' }, { key: 'monthPlaceholder', label: '月份占位文案' }, { key: 'dayPlaceholder', label: '日期占位文案' }, { key: 'birthdayNote', label: '生日说明' }] },
  { title: '记住生日', fields: [{ key: 'rememberTitle', label: '选项标题' }, { key: 'rememberNote', label: '选项说明' }] },
  { title: '页面操作', fields: [{ key: 'primaryAction', label: '主按钮' }, { key: 'primaryLockedAction', label: '锁定主按钮' }, { key: 'realityAction', label: '现实处境按钮' }, { key: 'skipAction', label: '稍后使用按钮' }] },
];
type SharedPracticeCopyKey = 'topbarTitle' | 'metaLeft' | 'metaRight' | 'heroTitle' | 'heroIntro' | 'onlineNumber' | 'onlineContext' | 'onlineIssueLabel' | 'onlineIssueTheme' | 'onlineQuestion' | 'onlineCopy' | 'onlineAction' | 'offlineNumber' | 'offlineContext' | 'offlineTitle' | 'offlineCopy' | 'noticeLabel' | 'noticeCode' | 'rule1Number' | 'rule1Title' | 'rule1Copy' | 'rule2Number' | 'rule2Title' | 'rule2Copy' | 'rule3Number' | 'rule3Title' | 'rule3Copy' | 'rule4Number' | 'rule4Title' | 'rule4Copy' | 'nextAction';
type PracticeFooterCopyKey = 'brand' | 'line1' | 'label' | 'line2';
type PracticeContent = { editVersion: number; draft?: boolean; title: string; titleRichText: string; titleFontSize: number; titleColor: string; intro: string; introRichText: string; introFontSize: number; introColor: string; metaLeftRichText: string; metaLeftFontSize: number; metaLeftColor: string; metaRightRichText: string; metaRightFontSize: number; metaRightColor: string; observationCopy: PracticeObservationCopy; sharedPracticeCopy: Record<SharedPracticeCopyKey, ObservationCopyItem>; footerCopy: Record<PracticeFooterCopyKey, ObservationCopyItem>; entries: PracticeEntry[] };
const practiceContent = ref<PracticeContent | null>(null);
type PrivacyCopyItem = { richText: string; fontSize: number; color: string };
type AboutPageContent = { editVersion: number; brandIntro: string; contentSources: string; contactInfo: string };
type PublishedRevision = { version: number; publishedAt: string; publishedBy: string | null; content: Record<string, unknown> | null };
const privacyDocumentManager = ref<InstanceType<typeof LegalDocumentManager> | null>(null);
const agreementDocumentManager = ref<InstanceType<typeof LegalDocumentManager> | null>(null);
const moduleStateMachine = ref<InstanceType<typeof ModuleStateMachine> | null>(null);
const legalHistoryPanel = ref<InstanceType<typeof LegalHistoryPanel> | null>(null);
const privacyPageContent = ref<AboutPageContent | null>(null);
const privacyPagePublishedVersion = ref(1);
const privacyPagePublishedAt = ref('');
const privacyPageRevisions = ref<PublishedRevision[]>([]);
const privacyPageRevisionsLoading = ref(false);
const privacyPageDirty = ref(false);
const privacyPageSaving = ref(false);
const privacyPageConflict = ref(false);
const privacyPageMessage = ref('');
const privacyPageError = ref('');
type DailyObjectsProduct = { id: string; name: string; english: string; image: string; price: string; priceLabel: string; description: string; optionDetails: string; dailyUseDetails: string; deliveryDetails: string; enabled: boolean };
type DailyObjectsContent = {
  editVersion: number; draft?: boolean; brandName: string; brandSubtitle: string; bagLabel: string; bagCount: string; eyebrow: string; title: string; intro: string; previewNote: string; supportLabel: string;
  landingTitle: string; landingIntro: string; landingStatus: string;
  herDaysTitle: string; herDaysEnglish: string; articleLabel: string; articleTitle: string; articleExcerpt: string; articleImage: string; articleImageAlt: string; articleCaption: string; officialArticleUrl: string; officialArticleButton: string;
  everydayObjectsTitle: string; everydayObjectsEnglish: string; everydayObjectsIntro: string;
  products: DailyObjectsProduct[];
};
const dailyObjectsContent = ref<DailyObjectsContent | null>(null);
const dailyObjectsDirty = ref(false);
const dailyObjectsSaving = ref(false);
const dailyObjectsConflict = ref(false);
const dailyObjectsMessage = ref('');
const dailyObjectsError = ref('');
const dailyObjectUploadingId = ref('');
const dailyObjectPreviewUrls = ref<Record<string, string>>({});
const dailyObjectArticlePreviewUrl = ref('');
const dailyObjectsPreviewMode = ref<'landing' | 'shop'>('landing');
const observationCopyGroups: Array<{ title: string; fields: Array<{ key: ObservationCopyKey; label: string }> }> = [
  { title: '页眉与主说明', fields: [{ key: 'metaLeft', label: '左侧页眉' }, { key: 'metaRight', label: '右侧英文标识' }, { key: 'introTitle', label: '主标题' }, { key: 'introDescription', label: '主说明' }] },
  { title: '现实处境路径', fields: [{ key: 'realityContext', label: '序号旁提示' }, { key: 'realityTitle', label: '路径标题' }, { key: 'realityDescription', label: '路径说明' }, { key: 'realityAction', label: '操作按钮文字' }] },
  { title: '四时气韵路径', fields: [{ key: 'seasonContext', label: '序号旁提示' }, { key: 'seasonTitle', label: '路径标题' }, { key: 'seasonDescription', label: '路径说明' }, { key: 'seasonGuide', label: '了解说明链接文字' }, { key: 'seasonAction', label: '操作按钮文字' }] },
  { title: '隐私说明', fields: [{ key: 'privacyLabel', label: '提示标题' }, { key: 'privacyCopy', label: '提示内容' }] },
];
const sharedPracticeCopyGroups: Array<{ title: string; fields: Array<{ key: SharedPracticeCopyKey; label: string }> }> = [
  { title: '页眉与首屏', fields: [{ key: 'topbarTitle', label: '导航栏标题' }, { key: 'metaLeft', label: '左侧页眉' }, { key: 'metaRight', label: '右侧英文标识' }, { key: 'heroTitle', label: '主标题' }, { key: 'heroIntro', label: '主说明' }] },
  { title: '线上 · 本期讨论', fields: [{ key: 'onlineNumber', label: '栏目序号' }, { key: 'onlineContext', label: '线上栏目说明' }, { key: 'onlineIssueLabel', label: '期号文字' }, { key: 'onlineIssueTheme', label: '本期主题' }, { key: 'onlineQuestion', label: '本期问题' }, { key: 'onlineCopy', label: '讨论说明' }, { key: 'onlineAction', label: '操作按钮文字' }] },
  { title: '线下 · 未来相见', fields: [{ key: 'offlineNumber', label: '栏目序号' }, { key: 'offlineContext', label: '线下栏目说明' }, { key: 'offlineTitle', label: '线下状态标题' }, { key: 'offlineCopy', label: '线下状态说明' }, { key: 'noticeLabel', label: '提示文字' }, { key: 'noticeCode', label: '提示英文标识' }] },
  { title: '线下活动说明', fields: [{ key: 'rule1Number', label: '第 1 项序号' }, { key: 'rule1Title', label: '第 1 项标题' }, { key: 'rule1Copy', label: '第 1 项说明' }, { key: 'rule2Number', label: '第 2 项序号' }, { key: 'rule2Title', label: '第 2 项标题' }, { key: 'rule2Copy', label: '第 2 项说明' }, { key: 'rule3Number', label: '第 3 项序号' }, { key: 'rule3Title', label: '第 3 项标题' }, { key: 'rule3Copy', label: '第 3 项说明' }, { key: 'rule4Number', label: '第 4 项序号' }, { key: 'rule4Title', label: '第 4 项标题' }, { key: 'rule4Copy', label: '第 4 项说明' }, { key: 'nextAction', label: '底部行动文字' }] },
];
const practiceContentDirty = ref(false);
const practiceContentSaving = ref(false);
const practiceContentConflict = ref(false);
const practiceContentMessage = ref('');
const practiceContentError = ref('');
type MinePageContent = {
  editVersion: number;
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
};
const minePageContent = ref<MinePageContent | null>(null);
const minePageContentDirty = ref(false);
const minePageContentSaving = ref(false);
const minePageContentConflict = ref(false);
const minePageContentMessage = ref('');
const minePageContentError = ref('');
type MinePageEditorTab = 'intro' | 'observations' | 'discussions' | 'practice' | 'privacy';
const minePageEditorTab = ref<MinePageEditorTab>('intro');
const defaultHomeIntroduction = '记录女性的真实经历，也邀请你观察自己的生活';
function createDefaultIssueModules(): ManagedIssueModule[] {
  return [
    { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: '本期策展', month: '', edition: 'A CURATED EDITION', introduction: defaultHomeIntroduction },
    { id: 'cover-story', type: 'coverStory', order: 1, enabled: true, imageObjectKey: '', altText: '', captionLeft: '人物纪实·时雨', captionRight: '本期封面', eyebrow: '本期主题', title: '', titleFontSize: 72, titleColor: '#59483d', body: '', bodyFontSize: 30, bodyColor: '#40362f', byline: '策展与编辑 · MYRIAD SHE' },
    { id: 'quote', type: 'quote', order: 2, enabled: true, text: '我后来才知道，放下不等于认输。', attribution: '' },
    { id: 'story', type: 'story', order: 3, enabled: true, eyebrow: '人物纪实·时雨', title: '', body: '', imageObjectKey: '', altText: '', captionLeft: '纪实剪辑·时雨', captionRight: '恢复并不是回到从前，而是慢慢学会全新的方式生活。' },
    { id: 'story-action', type: 'storyAction', order: 4, enabled: true, title: '进入本期人物', body: '', targetId: 'story' },
    { id: 'image', type: 'image', order: 5, enabled: false, imageObjectKey: '', altText: '', caption: '' },
    { id: 'audio', type: 'audio', order: 6, enabled: false, title: '', duration: '', mediaType: 'audio', audioObjectKey: '', videoObjectKey: '', detailTitle: '', description: '', quote: '', subtitle: '', transcript: '', tracks: [createIssueAudioTrack(1)] },
    { id: 'question', type: 'question', order: 7, enabled: true, eyebrow: '从她的经验，回到你的此刻', title: '', body: '' },
    { id: 'observation-action', type: 'observationAction', order: 8, enabled: true, title: '留给自己观察', body: '从现实处境开始，记录保持私密' },
    { id: 'shared-practice-action', type: 'sharedPracticeAction', order: 9, enabled: true, title: '一起谈谈', body: '围绕本期问题，听见不同的生活经验' },
    { id: 'contents', type: 'contents', order: 10, enabled: true, title: '本期目录', entry1Label: '人物纪实', entry1Summary: '', entry2Label: '微声音', entry2Summary: '第一个普通早晨', entry3Label: '此刻观察', entry3Summary: '从本期问题继续', entry4Label: '本期讨论', entry4Summary: '一起听见不同的经历' },
    { id: 'archive', type: 'archive', order: 11, enabled: true, title: '策展档案', entryLabel: 'ISSUE 01 · 往期精彩示意', entryTitle: '留住没有答案的时刻' },
    { id: 'brand-footer', type: 'brandFooter', order: 12, enabled: true, title: '我有我的时节', body: '记录真实的女性经验，也为看见之后的生活留下一条可行的路。' },
  ];
}
const maxIssueAudioTracks = 20;
const maxIssueAudioActions = 8;

function createEditorRecordId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const DECORATIVE_ACTION_ARROWS = /[↗→›»➜➝➞➡⟶➔]/g;
function cleanIssueAudioActionLabel(value: string) {
  return value.replace(DECORATIVE_ACTION_ARROWS, '').replace(/\s{2,}/g, ' ').trim();
}

function createIssueAudioAction(number: number, source: Partial<ManagedAudioAction> = {}): ManagedAudioAction {
  const kind: ManagedAudioAction['kind'] = source.kind === 'web' || source.kind === 'share' ? source.kind : 'page';
  return {
    id: source.id || `action-${String(number).padStart(2, '0')}`,
    label: cleanIssueAudioActionLabel(typeof source.label === 'string' ? source.label : '') || (kind === 'share' ? '分享给朋友' : '了解更多'),
    ...(source.labelRichText !== undefined ? { labelRichText: source.labelRichText } : {}),
    kind,
    ...(kind === 'page' ? { path: source.path || '' } : {}),
    ...(kind === 'web' ? { url: source.url || '' } : {}),
  };
}

function createIssueAudioTrack(number: number, source: Partial<ManagedAudioTrack> = {}): ManagedAudioTrack {
  const mediaType: 'audio' | 'video' = source.mediaType === 'video' || (!source.mediaType && Boolean(source.videoObjectKey) && !source.audioObjectKey) ? 'video' : 'audio';
  const actions = Array.isArray(source.actions)
    ? source.actions.slice(0, maxIssueAudioActions).map((action, index) => createIssueAudioAction(index + 1, action))
    : [createIssueAudioAction(1, { kind: 'share', label: '分享给朋友' })];
  return {
    id: source.id || `voice-${String(number).padStart(2, '0')}`,
    title: source.title || `微声音 ${String(number).padStart(2, '0')}`,
    ...(source.titleRichText !== undefined ? { titleRichText: source.titleRichText } : {}),
    duration: source.duration || '',
    mediaType,
    audioObjectKey: source.audioObjectKey || '',
    videoObjectKey: source.videoObjectKey || '',
    detailTitle: source.detailTitle || '',
    ...(source.detailTitleRichText !== undefined ? { detailTitleRichText: source.detailTitleRichText } : {}),
    description: source.description || '',
    ...(source.descriptionRichText !== undefined ? { descriptionRichText: source.descriptionRichText } : {}),
    quote: source.quote || '',
    ...(source.quoteRichText !== undefined ? { quoteRichText: source.quoteRichText } : {}),
    subtitle: source.subtitle || '',
    ...(source.subtitleRichText !== undefined ? { subtitleRichText: source.subtitleRichText } : {}),
    transcript: source.transcript || '',
    ...(source.transcriptRichText !== undefined ? { transcriptRichText: source.transcriptRichText } : {}),
    actions,
  };
}
function legacyAudioModuleLinkAction(module: ManagedIssueModule): ManagedAudioAction | null {
  const label = cleanIssueAudioActionLabel(String(module.linkLabel || '')).slice(0, 40) || '了解更多';
  const labelRichText = typeof module.linkLabelRichText === 'string' ? module.linkLabelRichText : undefined;
  if (module.linkType === 'page') {
    const path = String(module.linkPath || '').trim();
    if (!path || path.length > 512 || path.includes('..') || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(path)) return null;
    return { id: 'module-link', label, ...(labelRichText !== undefined ? { labelRichText } : {}), kind: 'page', path };
  }
  if (module.linkType === 'web') {
    const url = String(module.linkUrl || '').trim();
    if (!url || url.length > 2048 || !/^https:\/\/[^\s<>]+$/i.test(url)) return null;
    return { id: 'module-link', label, ...(labelRichText !== undefined ? { labelRichText } : {}), kind: 'web', url };
  }
  return null;
}
function mergeLegacyAudioModuleLink(tracks: ManagedAudioTrack[], link: ManagedAudioAction | null) {
  if (!link || !tracks.length) return;
  const first = tracks[0];
  const current = Array.isArray(first.actions) ? first.actions : [];
  const duplicate = current.some((action) => action.kind === link.kind
    && (link.kind === 'page' ? action.path === link.path : action.url === link.url));
  if (duplicate) return;
  const actions = current.slice(0, maxIssueAudioActions);
  if (actions.length >= maxIssueAudioActions) actions.pop();
  const ids = new Set(actions.map((action) => action.id));
  let id = link.id;
  let suffix = 2;
  while (ids.has(id)) id = `module-link-${suffix++}`;
  first.actions = [...actions, { ...link, id }];
}
function normalizeIssueAudioModule(module: ManagedIssueModule): ManagedIssueModule {
  const legacyActions = Array.isArray(module.actions) ? module.actions as ManagedAudioAction[] : undefined;
  const sourceTracks = Array.isArray(module.tracks) ? module.tracks.slice(0, maxIssueAudioTracks) : [];
  const tracks = sourceTracks.length
    ? sourceTracks.map((track, index) => createIssueAudioTrack(index + 1, index === 0 && legacyActions && !Array.isArray(track.actions)
      ? { ...track, actions: legacyActions }
      : track))
    : [createIssueAudioTrack(1, {
      id: 'voice-01', title: String(module.title || ''), duration: String(module.duration || ''),
      ...(typeof module.titleRichText === 'string' ? { titleRichText: module.titleRichText } : {}),
      mediaType: module.mediaType === 'video' ? 'video' : 'audio',
      audioObjectKey: String(module.audioObjectKey || ''), videoObjectKey: String(module.videoObjectKey || ''),
      detailTitle: String(module.detailTitle || ''), description: String(module.description || ''),
      ...(typeof module.detailTitleRichText === 'string' ? { detailTitleRichText: module.detailTitleRichText } : {}),
      ...(typeof module.descriptionRichText === 'string' ? { descriptionRichText: module.descriptionRichText } : {}),
      quote: String(module.quote || ''), subtitle: String(module.subtitle || ''), transcript: String(module.transcript || ''),
      ...(typeof module.quoteRichText === 'string' ? { quoteRichText: module.quoteRichText } : {}),
      ...(typeof module.subtitleRichText === 'string' ? { subtitleRichText: module.subtitleRichText } : {}),
      ...(typeof module.transcriptRichText === 'string' ? { transcriptRichText: module.transcriptRichText } : {}),
      ...(legacyActions ? { actions: legacyActions } : {}),
    })];
  mergeLegacyAudioModuleLink(tracks, legacyAudioModuleLinkAction(module));
  const normalized: ManagedIssueModule = { ...module, tracks };
  delete normalized.actions;
  delete normalized.linkType;
  delete normalized.linkPath;
  delete normalized.linkUrl;
  delete normalized.linkLabel;
  delete normalized.linkLabelRichText;
  return normalized;
}
function issueAudioTrackPayload(track: ManagedAudioTrack): ManagedAudioTrack {
  return {
    id: track.id,
    title: track.title || '',
    ...(track.titleRichText !== undefined ? { titleRichText: track.titleRichText } : {}),
    duration: track.duration || '',
    mediaType: track.mediaType === 'video' ? 'video' : 'audio',
    audioObjectKey: track.audioObjectKey || '',
    videoObjectKey: track.videoObjectKey || '',
    detailTitle: track.detailTitle || '',
    ...(track.detailTitleRichText !== undefined ? { detailTitleRichText: track.detailTitleRichText } : {}),
    description: track.description || '',
    ...(track.descriptionRichText !== undefined ? { descriptionRichText: track.descriptionRichText } : {}),
    quote: track.quote || '',
    ...(track.quoteRichText !== undefined ? { quoteRichText: track.quoteRichText } : {}),
    subtitle: track.subtitle || '',
    ...(track.subtitleRichText !== undefined ? { subtitleRichText: track.subtitleRichText } : {}),
    transcript: track.transcript || '',
    ...(track.transcriptRichText !== undefined ? { transcriptRichText: track.transcriptRichText } : {}),
    actions: (track.actions || []).slice(0, maxIssueAudioActions).map((action, index) => createIssueAudioAction(index + 1, action)),
  };
}
function issueDraftContentPayload(content: ManagedIssue['draftContent']): ManagedIssue['draftContent'] {
  return {
    ...content,
    sections: content.sections.map((module) => {
      if (module.type !== 'audio') return module;
      const normalized = normalizeIssueAudioModule(module);
      return { ...normalized, tracks: (normalized.tracks || []).map(issueAudioTrackPayload) };
    }),
  };
}
function combineCoverAndOpener(modules: ManagedIssueModule[]) {
  const coverIndex = modules.findIndex((module) => module.type === 'cover' || module.type === 'coverStory');
  const openerIndex = modules.findIndex((module) => module.type === 'opener');
  let normalizedModules = modules;
  if (coverIndex >= 0 && openerIndex >= 0) {
    const cover = modules[coverIndex];
    const opener = modules[openerIndex];
    const combined: ManagedIssueModule = cover.type === 'coverStory' ? cover : {
      id: 'cover-story', type: 'coverStory', order: Math.min(cover.order, opener.order), enabled: cover.enabled || opener.enabled,
      imageObjectKey: cover.imageObjectKey || '', altText: cover.altText || '', captionLeft: cover.captionLeft || '', captionRight: cover.captionRight || '',
      ...(typeof cover.captionLeftRichText === 'string' ? { captionLeftRichText: cover.captionLeftRichText } : {}),
      ...(typeof cover.captionRightRichText === 'string' ? { captionRightRichText: cover.captionRightRichText } : {}),
      eyebrow: opener.eyebrow || '本期主题', title: opener.title || '', titleFontSize: opener.titleFontSize || 72, titleColor: opener.titleColor || '#59483d', body: opener.body || '', bodyFontSize: opener.bodyFontSize || 30, bodyColor: opener.bodyColor || '#40362f', byline: cover.byline || '策展与编辑 · MYRIAD SHE',
      ...(typeof opener.eyebrowRichText === 'string' ? { eyebrowRichText: opener.eyebrowRichText } : {}),
      ...(typeof opener.titleRichText === 'string' ? { titleRichText: opener.titleRichText } : {}),
      ...(typeof opener.bodyRichText === 'string' ? { bodyRichText: opener.bodyRichText } : {}),
      ...(typeof cover.bylineRichText === 'string' ? { bylineRichText: cover.bylineRichText } : {}),
    };
    normalizedModules = modules.filter((module) => module !== cover && module !== opener).concat(combined).sort((left, right) => left.order - right.order).map((module, order) => ({ ...module, order }));
  }
  return normalizedModules.map((rawModule) => {
    const module = rawModule.type === 'audio' ? normalizeIssueAudioModule(rawModule) : rawModule;
    return module.type === 'audio' ? { ...module, quote: module.quote || '', subtitle: module.subtitle || '' } : module;
  });
}
function issuePreviewContents(module: ManagedIssueModule) {
  const value = (field: string, fallback: string) => {
    const candidate = module[field];
    return typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
  };
  return [
    { number: '01', label: value('entry1Label', '人物纪实'), summary: value('entry1Summary', issueForm.value.theme) },
    { number: '02', label: value('entry2Label', '微声音'), summary: value('entry2Summary', '第一个普通早晨') },
    { number: '03', label: value('entry3Label', '此刻观察'), summary: value('entry3Summary', '从本期问题继续') },
    { number: '04', label: value('entry4Label', '本期讨论'), summary: value('entry4Summary', '一起听见不同的经历') },
  ];
}
// 与小程序首页保持一致：第一栏排成「当期策展 / ISSUE 02 / SEPTEMBER 2026 · 英文刊期标识」。
const issuePreviewKicker = '当期策展';
const issuePreviewTagline = 'A CURATED EDITION';
const issuePreviewMonthNames: Record<string, string> = {
  JAN: 'JANUARY', FEB: 'FEBRUARY', MAR: 'MARCH', APR: 'APRIL', MAY: 'MAY', JUN: 'JUNE',
  JUL: 'JULY', AUG: 'AUGUST', SEP: 'SEPTEMBER', SEPT: 'SEPTEMBER', OCT: 'OCTOBER', NOV: 'NOVEMBER', DEC: 'DECEMBER',
};
function previewIssueText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
// 英文刊期按杂志排印展开缩写（Sep 2026 → SEPTEMBER 2026）；中文月份写法保持原样。
function expandPreviewIssueMonth(value: string) {
  return value.toUpperCase().replace(
    /(^|[^A-Z])(SEPT|SEP|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|OCT|NOV|DEC)\.?(?![A-Z])/g,
    (_match, prefix: string, month: string) => `${prefix}${issuePreviewMonthNames[month] || month}`,
  );
}
function issuePreviewIssueNumber(module: ManagedIssueModule) {
  const label = previewIssueText(module.eyebrow) || previewIssueText(issueForm.value.label);
  if (label) return label.toUpperCase();
  const digits = previewIssueText(issueForm.value.code).match(/(\d+)/);
  return digits ? `ISSUE ${digits[1].padStart(2, '0')}` : '';
}
function issuePreviewIssueEdition(module: ManagedIssueModule) {
  const month = previewIssueText(module.month) || previewIssueText(issueForm.value.month);
  return month ? expandPreviewIssueMonth(month) : '';
}
function issuePreviewIssueEditionSuffix(module: ManagedIssueModule) {
  const edition = module.edition === undefined ? issuePreviewTagline : previewIssueText(module.edition);
  const month = issuePreviewIssueEdition(module);
  return edition ? `${month ? ' · ' : ''}${edition}` : '';
}
function issuePreviewRichText(module: ManagedIssueModule, field: string) {
  return previewIssueText(module[field]);
}
const issueForm = ref({ code: '', label: '', labelRichText: '', month: '', monthRichText: '', theme: '', themeRichText: '', question: '', questionRichText: '', status: 'draft', microVoiceTitle: '', microVoiceDuration: '', coverObjectKey: '', microVoiceObjectKey: '', homeBackgroundObjectKey: '', homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '本期封面', homeCoverCaptionRightRichText: '', draftContent: { sections: createDefaultIssueModules(), discussion: createDefaultDiscussionContent() } });
type IssueForm = typeof issueForm.value;
const originalIssueForm = ref<IssueForm>({ ...issueForm.value });
function cloneIssueForm(form: IssueForm): IssueForm { return JSON.parse(JSON.stringify(form)) as IssueForm; }
const issueMetaRichTextInput = ref<HTMLTextAreaElement | null>(null);
const editingIssueId = ref('');
const editingIssueEditVersion = ref(0);
const originalIssueStatus = ref('');
const issueConflict = ref(false);
const issueConflictResolved = ref('');
const issueSaveMessage = ref('');
const issueValidationMessage = ref('');
const issueValidationDialogOpen = ref(false);
type IssueFieldKey = 'code' | 'label' | 'month' | 'edition' | 'theme' | 'question';
const issueFieldErrors = ref<Partial<Record<IssueFieldKey, string>>>({});
const issueHistory = ref<Array<{ version: number; publishedAt: string; publishedBy: string | null; snapshot: unknown }>>([]);
type IssueLifecycleAction = 'archive' | 'restore' | 'delete';
const pendingIssueAction = ref<{ issue: ManagedIssue; action: IssueLifecycleAction } | null>(null);
const issueActionBusy = ref(false);
const issueActionError = ref('');
const issueModulePreviewUrls = ref<Record<string, string>>({});
const selectedIssueModuleId = ref('cover-story');
const discussionPageEditVersion = ref(0);
const discussionPagePublishedVersion = ref(0);
const discussionPagePublishedAt = ref<string | null>(null);
const discussionPageLoading = ref(false);
const discussionPageSaving = ref(false);
const discussionPagePublishing = ref(false);
const discussionPageMessage = ref('');
const discussionPageError = ref('');
const discussionPageLoadedIssueId = ref('');

/* ---------- 共同实践文案：按期 + 列表化 ---------- */
type CopyItem = { richText: string; fontSize: number; color: string };
const practiceCopyIssueCode = ref('');
const practiceCopySource = ref<'issue' | 'global'>('global');
const practiceCopyLoading = ref(false);
const practiceCopySaving = ref(false);
const practiceCopyError = ref('');
const practiceCopyMessage = ref('');
const practiceCopyOfflinePublished = ref(false);
const visibleSharedPracticeCopyGroups = computed(() => (
  practiceCopyOfflinePublished.value
    ? sharedPracticeCopyGroups
    : sharedPracticeCopyGroups.filter((group) => group.title !== '线下活动说明')
));
const practiceCopyParagraphs = ref<CopyItem[]>([]);
const practiceCopyRules = ref<Array<{ number: CopyItem; title: CopyItem; copy: CopyItem }>>([]);

const newCopyItem = (text: string, fontSize: number, color: string): CopyItem => ({ richText: text, fontSize, color });

async function loadPracticeCopy() {
  const code = practiceCopyIssueCode.value.trim();
  if (!code) { practiceCopyError.value = '请先选择期刊'; return; }
  practiceCopyLoading.value = true;
  practiceCopyError.value = '';
  practiceCopyMessage.value = '';
  practiceCopyOfflinePublished.value = false;
  try {
    const response = await apiFetch(`${apiBase}/content/practice-copy/manage?issueCode=${encodeURIComponent(code)}`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取该期文案'));
    const result = await response.json();
    practiceCopySource.value = result.source === 'issue' ? 'issue' : 'global';
    practiceCopyOfflinePublished.value = result.offlineActivitiesPublished === true;
    practiceCopyParagraphs.value = Array.isArray(result.copy?.onlineParagraphs) ? result.copy.onlineParagraphs : [];
    practiceCopyRules.value = Array.isArray(result.copy?.rules) ? result.copy.rules : [];
  } catch (caught) {
    practiceCopyError.value = caught instanceof Error ? caught.message : '无法读取该期文案';
  } finally {
    practiceCopyLoading.value = false;
  }
}

async function savePracticeCopy() {
  if (practiceCopySaving.value) return;
  const code = practiceCopyIssueCode.value.trim();
  if (!code) { practiceCopyError.value = '请先选择期刊'; return; }
  practiceCopySaving.value = true;
  practiceCopyError.value = '';
  practiceCopyMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/practice-copy/manage`, {
      method: 'PUT',
      headers: adminHeaders(true),
      body: JSON.stringify({
        issueCode: code,
        offlineActivitiesPublished: practiceCopyOfflinePublished.value,
        copy: {
          onlineParagraphs: practiceCopyParagraphs.value,
          rules: practiceCopyRules.value,
        },
      }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '保存失败'));
    const result = await response.json();
    practiceCopyOfflinePublished.value = result.offlineActivitiesPublished === true;
    practiceCopyMessage.value = '已保存该期文案与线下活动发布状态';
  } catch (caught) {
    practiceCopyError.value = caught instanceof Error ? caught.message : '保存失败';
  } finally {
    practiceCopySaving.value = false;
  }
}

async function copyPracticeFromOtherIssue() {
  const code = practiceCopyIssueCode.value.trim();
  if (!code) { practiceCopyError.value = '请先选择期刊'; return; }
  const current = issues.value.findIndex((issue) => issue.code === code);
  const source = issues.value[current - 1] ?? issues.value[current + 1];
  if (!source) { practiceCopyError.value = '没有可复制的其他期刊'; return; }
  practiceCopySaving.value = true;
  practiceCopyError.value = '';
  practiceCopyMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/practice-copy/manage/copy-from`, {
      method: 'POST',
      headers: adminHeaders(true),
      body: JSON.stringify({ fromIssueCode: source.code, toIssueCode: code }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '复制失败'));
    const result = await response.json();
    practiceCopyParagraphs.value = Array.isArray(result.copy?.onlineParagraphs) ? result.copy.onlineParagraphs : [];
    practiceCopyRules.value = Array.isArray(result.copy?.rules) ? result.copy.rules : [];
    practiceCopySource.value = 'issue';
    practiceCopyMessage.value = `已从 ${source.code} 复制`;
  } catch (caught) {
    practiceCopyError.value = caught instanceof Error ? caught.message : '复制失败';
  } finally {
    practiceCopySaving.value = false;
  }
}

function moveParagraph(index: number, delta: number) {
  const next = [...practiceCopyParagraphs.value];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  practiceCopyParagraphs.value = next;
}

function addParagraph() {
  practiceCopyParagraphs.value = [...practiceCopyParagraphs.value, newCopyItem('', 15, '#5c493c')];
}

function removeParagraph(index: number) {
  practiceCopyParagraphs.value = practiceCopyParagraphs.value.filter((_, i) => i !== index);
}

function moveRule(index: number, delta: number) {
  const next = [...practiceCopyRules.value];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  practiceCopyRules.value = next;
}

function addRule() {
  const index = practiceCopyRules.value.length + 1;
  practiceCopyRules.value = [...practiceCopyRules.value, {
    number: newCopyItem(String(index).padStart(2, '0'), 11, '#8b6b58'),
    title: newCopyItem('', 15, '#5c493c'),
    copy: newCopyItem('', 12, '#5c493c'),
  }];
}

function removeRule(index: number) {
  practiceCopyRules.value = practiceCopyRules.value.filter((_, i) => i !== index);
}

watch(practiceCopyIssueCode, (code) => { if (code) void loadPracticeCopy(); });

const issueDraftDirty = computed(() => JSON.stringify(issueForm.value) !== JSON.stringify(originalIssueForm.value));
watch(issueDraftDirty, (dirty) => {
  if (dirty) issueSaveMessage.value = '';
});
const observations = ref<ManagedObservation[]>([]);
const selectedObservation = ref<ManagedObservationDetail | null>(null);
const selectedObservationLoading = ref(false);
const selectedObservationError = ref('');
const observationAnswerLabels: Record<string, string> = {
  situation: '底色 · 处境', body: '此刻 · 身体感受', need: '选择 · 需要', nextAction: '行动 · 下一步',
  birthDate: '底色 · 生日', experience: '此刻 · 这件事是怎样发生的', season: '此刻 · 与底色的关系', seasonNote: '此刻 · 哪些有关，哪些不同', seasonStates: '此刻 · 我辨认的变化', seasonInsight: '此刻 · 还看见了什么',
  keepUnderstanding: '选择 · 我想保留的', rejectUnderstanding: '选择 · 我不接受的', sevenDayAction: '行动 · 接下来七天',
};
// 展示顺序（未列出的字段排在最后）
const observationAnswerOrder = ['birthDate', 'experience', 'season', 'seasonNote', 'seasonStates', 'seasonStatesDetail', 'seasonInsight', 'keepUnderstanding', 'rejectUnderstanding', 'sevenDayAction', 'situation', 'body', 'need', 'nextAction'];
const observationStateLabels: Record<string, string> = { 生: '正在开始', 长: '继续培育', 收: '完成与取舍', 藏: '暂停与保存', 暂时说不清: '暂时说不清' };
const selectedObservationAnswers = computed(() => {
  const answers = selectedObservation.value?.answers ?? {};
  const hidden = new Set(['seasonStatesDetail']);
  return Object.entries(answers)
    .filter(([key]) => !hidden.has(key))
    .sort(([a], [b]) => {
      const ia = observationAnswerOrder.indexOf(a);
      const ib = observationAnswerOrder.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    })
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return {
        key,
        label: observationAnswerLabels[key] ?? key,
        empty: text === '',
        value: text === ''
          ? '未填写'
          : (key === 'seasonStates'
            ? text.split(',').map((item) => observationStateLabels[item.trim()] ?? item.trim()).filter(Boolean).join('、')
            : text),
      };
    });
});
const observationLifecycle = ref<ObservationLifecycle | null>(null);
const observationTotal = ref(0);
const observationOffset = ref(0);
const observationHasMore = ref(false);
const observationLoadingMore = ref(false);
const observationMoreError = ref('');
const observationPageSize = 50;
type DiscussionPublicationStatus = 'pending' | 'published' | 'hidden' | 'rejected';
type DiscussionRestrictionMode = 'temporary' | 'permanent';
type ManagedDiscussionContribution = {
  id: string;
  revision: number;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  publicationStatus: DiscussionPublicationStatus;
  userId: string;
  nickname: string | null;
  publishedAt: string | null;
  featuredAt: string | null;
  featuredOrder: number;
  bodyPreview: string;
  createdAt: string;
  updatedAt: string;
};
type ManagedDiscussionContributionDetail = ManagedDiscussionContribution & { body: string };
type DiscussionRestrictionStatus = 'active' | 'scheduled' | 'expired' | 'revoked';
type ManagedDiscussionRestriction = {
  id: string;
  userId: string;
  nickname: string | null;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  effectiveStatus: DiscussionRestrictionStatus;
};
const discussionContributions = ref<ManagedDiscussionContribution[]>([]);
const discussionContributionPublicationStatus = ref<DiscussionPublicationStatus | ''>('pending');
const discussionContributionKind = ref<'' | 'experience' | 'reply'>('');
const discussionContributionIssueCode = ref('');
const discussionContributionSummary = ref<Record<DiscussionPublicationStatus, number>>({ pending: 0, published: 0, hidden: 0, rejected: 0 });
const discussionContributionTotal = ref(0);
const discussionContributionOffset = ref(0);
const discussionContributionHasMore = ref(false);
const discussionContributionLoading = ref(false);
const discussionContributionLoadingMore = ref(false);
const discussionContributionMoreError = ref('');
const discussionContributionError = ref('');
const selectedDiscussionContribution = ref<ManagedDiscussionContributionDetail | null>(null);
const selectedDiscussionContributionLoading = ref(false);
const selectedDiscussionContributionError = ref('');
const discussionContributionSaving = ref(false);
const discussionContributionActionMessage = ref('');
const discussionContributionFeaturedOrder = ref('10');
const discussionContributionPageSize = 50;
let discussionContributionGeneration = 0;
const discussionRestrictions = ref<ManagedDiscussionRestriction[]>([]);
const discussionRestrictionStatus = ref<DiscussionRestrictionStatus | ''>('active');
const discussionRestrictionSummary = ref<Record<DiscussionRestrictionStatus, number>>({ active: 0, scheduled: 0, expired: 0, revoked: 0 });
const discussionRestrictionTotal = ref(0);
const discussionRestrictionOffset = ref(0);
const discussionRestrictionHasMore = ref(false);
const discussionRestrictionLoading = ref(false);
const discussionRestrictionLoadingMore = ref(false);
const discussionRestrictionMoreError = ref('');
const discussionRestrictionError = ref('');
const discussionRestrictionActionMessage = ref('');
const discussionRestrictionSavingId = ref('');
const discussionRestrictionCreating = ref(false);
const discussionRestrictionCreateMessage = ref('');
const discussionRestrictionCreateError = ref('');
const discussionRestrictionPrefillNickname = ref('');
const discussionRestrictionDialogOpen = ref(false);
const discussionRestrictionEarliestEndsAt = ref('');
const discussionRestrictionMode = ref<DiscussionRestrictionMode>('temporary');
const discussionRestrictionForm = ref({ userId: '', reason: '', endsAt: '' });
const discussionRestrictionPageSize = 50;
let discussionRestrictionGeneration = 0;
type DiscussionReportStatus = 'pending' | 'handled' | 'dismissed';
type ManagedDiscussionReport = { id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null; threadBody: string | null; reason: string; detail: string | null; status: DiscussionReportStatus; createdAt: string; updatedAt: string };
const discussionReports = ref<ManagedDiscussionReport[]>([]);
const discussionReportStatus = ref<DiscussionReportStatus | ''>('pending');
const discussionReportIssueCode = ref('');
const discussionReportTotal = ref(0);
const discussionReportOffset = ref(0);
const discussionReportHasMore = ref(false);
const discussionReportSummary = ref<Record<DiscussionReportStatus, number>>({ pending: 0, handled: 0, dismissed: 0 });
const discussionReportLoading = ref(false);
const discussionReportActionMessage = ref('');
const discussionReportError = ref('');
const discussionReportSavingId = ref('');
const discussionReportPageSize = 20;
let discussionReportGeneration = 0;
const discussionReportReasonLabels: Record<string, string> = { inappropriate: '不适当内容', spam: '垃圾信息', privacy: '隐私问题', other: '其他' };
function discussionReportReasonLabel(reason: string) { return discussionReportReasonLabels[reason] ?? reason; }
const privacyRequests = ref<PrivacyRequest[]>([]);
const privacyLifecycle = ref<PrivacyLifecycle | null>(null);
const privacyTotal = ref(0);
const privacyOffset = ref(0);
const privacyHasMore = ref(false);
const privacyLoadingMore = ref(false);
const privacyMoreError = ref('');
const privacyRefreshing = ref(false);
const privacyActionMessage = ref('');
const privacyActionError = ref('');
const privacyPageSize = 50;
const privacyStatus = ref('');
const auditLogs = ref<AuditEntry[]>([]);
const auditTotal = ref(0);
const auditOffset = ref(0);
const auditHasMore = ref(false);
const auditLoadingMore = ref(false);
const auditMoreError = ref('');
const auditActorType = ref('');
const auditAction = ref('');
const auditExpandedId = ref('');
type MemberAddress = { userName: string; telNumber: string; provinceName: string; cityName: string; countyName: string; detailInfo: string; postalCode?: string; nationalCode?: string };
type Member = { id: string; status: 'active' | 'suspended'; createdAt: string; updatedAt: string; observationCount: number; nickname: string | null; avatarUrl: string | null; phoneMasked: string | null; phoneNumber?: string | null; birthMonth: number | null; birthDay: number | null; address?: MemberAddress | null };
type MemberDetail = Member & { openId: string; maskedUnionId: string | null; phoneNumber?: string | null; privacyRequests: Array<{ id: string; status: string; requestedAt: string; scheduledFor: string }> };
const members = ref<Member[]>([]);
const memberTotal = ref(0);
const memberOffset = ref(0);
const memberQuery = ref('');
const memberFrom = ref('');
const memberTo = ref('');
const memberDetail = ref<MemberDetail | null>(null);
const memberError = ref('');
const memberLoading = ref(false);
const memberPageSize = 50;
type BrandPopupFrequency = 'every_launch' | 'daily' | 'once';
type SystemSettings = {
  store_enabled: boolean;
  maintenance_notice: string;
  support_contact: string;
  discussion_appeal_contact: string;
  brand_popup_enabled: boolean;
  brand_popup_image: string;
  brand_popup_duration: number;
  brand_popup_frequency: BrandPopupFrequency;
  brand_popup_alt: string;
  brand_popup_closable: boolean;
};
const initialSystemSettings: SystemSettings = {
  store_enabled: false,
  maintenance_notice: '',
  support_contact: '',
  discussion_appeal_contact: '',
  brand_popup_enabled: false,
  brand_popup_image: '',
  brand_popup_duration: 3,
  brand_popup_frequency: 'every_launch',
  brand_popup_alt: '',
  brand_popup_closable: true,
};
const systemSettings = ref<SystemSettings>({ ...initialSystemSettings });
const systemSettingsOriginal = ref<SystemSettings>({ ...systemSettings.value });
const brandPopupPreviewUrl = ref('');
const brandPopupUploading = ref(false);
const brandPopupFileInput = ref<HTMLInputElement | null>(null);

interface LifeCardRow { month: number; day: number; suit: string; rank: string; theme: string; title: string; summary: string; prompt: string; note: string; sourceNote: string }
const lifeCards = ref<LifeCardRow[]>([]);
const lifeCardSuits = [{ key: 'spade', label: '黑桃 ♠' }, { key: 'heart', label: '红桃 ♥' }, { key: 'club', label: '梅花 ♣' }, { key: 'diamond', label: '方块 ♦' }];
const lifeCardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const lifeCardMonth = ref(1);
const lifeCardImporting = ref(false);
const lifeCardDraft = ref<LifeCardRow | null>(null);
const lifeCardsLoading = ref(false);
const lifeCardsSaving = ref(false);
const lifeCardsError = ref('');
const lifeCardsMessage = ref('');
const lifeCardMonthDays = computed(() => lifeCards.value.filter((card) => card.month === lifeCardMonth.value));

interface LifeCardViewRow { id: string; userId: string; nickname: string | null; month: number; day: number; suit: string; rank: string; viewedAt: string }
const lifeCardViews = ref<LifeCardViewRow[]>([]);
const lifeCardViewsTotal = ref(0);
const lifeCardViewsLoading = ref(false);
const lifeCardViewsMore = ref(false);
const lifeCardViewsError = ref('');
const lifeCardViewPageSize = 30;
const lifeCardViewFilter = ref({ from: '', to: '', user: '', suit: '', rank: '' });

const lifeCardSuitSymbol = (suit: string) => (suit === 'spade' ? '♠' : suit === 'heart' ? '♥' : suit === 'club' ? '♣' : '♦');

function resetLifeCardViewFilter() {
  lifeCardViewFilter.value = { from: '', to: '', user: '', suit: '', rank: '' };
  void loadLifeCardViews();
}

async function loadLifeCardViews(more = false) {
  if (lifeCardViewsLoading.value) return;
  lifeCardViewsLoading.value = true;
  if (!more) lifeCardViewsError.value = '';
  try {
    const offset = more ? lifeCardViews.value.length : 0;
    const query = new URLSearchParams({ limit: String(lifeCardViewPageSize), offset: String(offset) });
    const filterValues = lifeCardViewFilter.value;
    if (filterValues.from) query.set('from', filterValues.from);
    if (filterValues.to) query.set('to', filterValues.to);
    if (filterValues.user.trim()) query.set('user', filterValues.user.trim());
    if (filterValues.suit) query.set('suit', filterValues.suit);
    if (filterValues.rank) query.set('rank', filterValues.rank);
    const response = await apiFetch(`${apiBase}/content/life-card-views/manage?${query.toString()}`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取查看记录'));
    const result = await response.json();
    const items = Array.isArray(result.items) ? result.items as LifeCardViewRow[] : [];
    lifeCardViews.value = more ? [...lifeCardViews.value, ...items] : items;
    lifeCardViewsTotal.value = Number(result.total) || 0;
    lifeCardViewsMore.value = lifeCardViews.value.length < lifeCardViewsTotal.value;
  } catch (caught) {
    lifeCardViewsError.value = caught instanceof Error ? caught.message : '无法读取查看记录';
  } finally {
    lifeCardViewsLoading.value = false;
  }
}

async function loadLifeCards() {
  lifeCardsLoading.value = true;
  lifeCardsError.value = '';
  lifeCardsMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/life-cards/manage`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取生命牌文案'));
    const result = await response.json();
    const items = Array.isArray(result.items) ? result.items : [];
    lifeCards.value = items.filter((item: unknown): item is LifeCardRow => Boolean(item && typeof item === 'object'
      && typeof (item as LifeCardRow).month === 'number' && typeof (item as LifeCardRow).day === 'number'
      && typeof (item as LifeCardRow).suit === 'string' && typeof (item as LifeCardRow).rank === 'string'
      && typeof (item as LifeCardRow).title === 'string' && typeof (item as LifeCardRow).summary === 'string'
      && typeof (item as LifeCardRow).prompt === 'string' && typeof (item as LifeCardRow).theme === 'string'
      && typeof (item as LifeCardRow).note === 'string' && typeof (item as LifeCardRow).sourceNote === 'string'));
    const selected = lifeCards.value.find((card) => card.month === lifeCardMonth.value);
    lifeCardDraft.value = selected ? { ...selected } : null;
  } catch (caught) {
    lifeCardsError.value = caught instanceof Error ? caught.message : '无法读取生命牌文案';
  } finally {
    lifeCardsLoading.value = false;
  }
}

async function exportLifeCards() {
  try {
    const response = await apiFetch(`${apiBase}/content/life-cards/manage/export`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '导出失败'));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `life-cards-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    lifeCardsMessage.value = '已导出 CSV';
  } catch (caught) {
    lifeCardsError.value = caught instanceof Error ? caught.message : '导出失败';
  }
}

async function importLifeCards(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || lifeCardImporting.value) return;
  lifeCardImporting.value = true;
  lifeCardsError.value = '';
  lifeCardsMessage.value = '';
  try {
    const csv = await file.text();
    const response = await apiFetch(`${apiBase}/content/life-cards/manage/import`, {
      method: 'POST',
      headers: adminHeaders(true),
      body: JSON.stringify({ csv }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '导入失败'));
    const result = await response.json() as { updated: number; skipped: number };
    lifeCardsMessage.value = `导入完成：更新 ${result.updated} 条${result.skipped ? `，跳过 ${result.skipped} 条` : ''}`;
    await loadLifeCards();
  } catch (caught) {
    lifeCardsError.value = caught instanceof Error ? caught.message : '导入失败';
  } finally {
    lifeCardImporting.value = false;
  }
}

function editLifeCard(card: LifeCardRow) {
  lifeCardDraft.value = { ...card };
  lifeCardsMessage.value = '';
  lifeCardsError.value = '';
}

function selectLifeCardMonth(month: number) {
  lifeCardMonth.value = month;
  const selected = lifeCards.value.find((card) => card.month === month);
  lifeCardDraft.value = selected ? { ...selected } : null;
}

async function saveLifeCard() {
  const draft = lifeCardDraft.value;
  if (!draft || lifeCardsSaving.value) return;
  lifeCardsSaving.value = true;
  lifeCardsError.value = '';
  lifeCardsMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/life-cards/manage/${draft.month}/${draft.day}`, {
      method: 'PATCH',
      headers: adminHeaders(true),
      body: JSON.stringify({ suit: draft.suit, rank: draft.rank, theme: draft.theme, title: draft.title, summary: draft.summary, prompt: draft.prompt, note: draft.note, sourceNote: draft.sourceNote }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '保存失败'));
    const saved = await response.json() as LifeCardRow;
    lifeCards.value = lifeCards.value.map((card) => (card.month === saved.month && card.day === saved.day ? saved : card));
    lifeCardDraft.value = { ...saved };
    lifeCardsMessage.value = `已保存 ${saved.month} 月 ${saved.day} 日`;
  } catch (caught) {
    lifeCardsError.value = caught instanceof Error ? caught.message : '保存失败';
  } finally {
    lifeCardsSaving.value = false;
  }
}
const settingsMessage = ref('');
const settingsError = ref('');
const settingsLoading = ref(false);
const settingsSaving = ref(false);
// 后台模块授权：模块 id 必须与后端 backend/src/auth/admin-permissions.ts 保持一致。
const adminModules = [
  { id: 'journal', label: '期刊与首页策展', description: '期刊列表、首页栏目、人物故事、微声音、本期讨论与往期策展' },
  { id: 'practice', label: '实践页面与目录', description: '实践文案、目录设置、共同实践与日常之物' },
  { id: 'pages', label: '页面与协议', description: '隐私政策、用户协议、关于 MYRIAD SHE 与发布历史' },
  { id: 'media', label: '媒体库', description: '上传图片与音频、查询孤儿媒体与预览地址' },
  { id: 'contributions', label: '一起谈谈', description: '互动内容审核、精华设置与一起谈谈权限管理' },
  { id: 'discussion-reports', label: '用户举报', description: '用户举报的讨论内容、原因与处理状态' },
  { id: 'observations', label: '观察记录管理', description: '私密观察记录列表、生命周期统计与详情' },
  { id: 'privacy', label: '隐私申请', description: '账户删除申请的处理与重试' },
  { id: 'members', label: '会员列表', description: '会员目录与会员详情（停用仍仅超级管理员）' },
  { id: 'audit', label: '操作记录', description: '查看谁在什么时候做了什么' },
  { id: 'life-cards', label: '生命牌文案', description: '生命牌文案的查看、导入与逐日编辑' },
  { id: 'life-card-views', label: '生命牌查看记录', description: '小程序生命牌查看记录' },
  { id: 'settings', label: '系统设置', description: '业务设置只读与数据库迁移状态' },
] as const;
type AdminModuleId = typeof adminModules[number]['id'];
const adminRoleDefaultModules: Record<string, AdminModuleId[]> = {
  super_admin: adminModules.map((module) => module.id),
  content_editor: ['journal', 'practice', 'pages', 'media', 'contributions', 'discussion-reports'],
  support_readonly: ['members', 'settings'],
};
const adminModulesById = new Map<string, { id: AdminModuleId; label: string; description: string }>(adminModules.map((module) => [module.id, module]));
function effectiveModulesForRole(role: string, override: readonly string[] | null | undefined): AdminModuleId[] {
  const source = override ?? adminRoleDefaultModules[role] ?? [];
  const result: AdminModuleId[] = [];
  for (const item of source) {
    if (adminModulesById.has(item) && !result.includes(item as AdminModuleId)) result.push(item as AdminModuleId);
  }
  return result;
}
type Employee = {
  id: string;
  username: string;
  displayName: string;
  role: 'super_admin' | 'content_editor' | 'support_readonly';
  status: 'active' | 'disabled';
  wecomUserId?: string | null;
  passwordChangeRequired?: boolean;
  avatarUrl?: string | null;
  modulePermissions?: string[] | null;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};
const employees = ref<Employee[]>([]);
const employeeForm = ref({
  username: '', displayName: '', password: '', role: 'content_editor' as Employee['role'], wecomUserId: '',
});
const employeeFormError = ref('');
const employeeError = ref('');
const employeeMessage = ref('');
const employeeLoading = ref(false);
const employeeSaving = ref(false);
const employeeBusyId = ref('');
const createEmployeeOpen = ref(false);
const employeeEditorOpen = ref(false);
const editingEmployee = ref<Employee | null>(null);
const employeeEditForm = ref({
  displayName: '',
  wecomUserId: '',
  role: 'content_editor' as Employee['role'],
  status: 'active' as Employee['status'],
  modulePermissions: null as AdminModuleId[] | null,
});
const employeeAvatarFile = ref<File | null>(null);
const employeeAvatarPreview = ref('');
const employeeAvatarRemove = ref(false);
const employeeAvatarError = ref('');
const employeeEditError = ref('');
const employeeEditSaving = ref(false);
const employeeSearch = ref('');
const employeeStatusFilter = ref<'all' | 'active' | 'disabled'>('all');
const employeeRoleFilter = ref<'all' | Employee['role']>('all');
const employeeRoleGuides = [
  { role: 'super_admin' as const, label: '超级管理员', scope: '全部权限', detail: '系统设置、员工与权限、会员敏感操作、内容发布与审计。' },
  { role: 'content_editor' as const, label: '内容编辑', scope: '内容与审核', detail: '期刊、实践页面、日常之物、关于页面和一起谈谈。' },
  { role: 'support_readonly' as const, label: '客服只读', scope: '只读查询', detail: '仅可查看会员目录和业务设置，不能修改内容或员工权限。' },
];
const employeeStats = computed(() => {
  const active = employees.value.filter((employee) => employee.status === 'active');
  return {
    total: employees.value.length,
    active: active.length,
    disabled: employees.value.length - active.length,
    wecomBound: employees.value.filter((employee) => Boolean(employee.wecomUserId)).length,
  };
});
const employeeFiltersActive = computed(() => Boolean(employeeSearch.value.trim())
  || employeeStatusFilter.value !== 'all'
  || employeeRoleFilter.value !== 'all');
const filteredEmployees = computed(() => {
  const query = employeeSearch.value.trim().toLowerCase();
  return employees.value.filter((employee) => {
    if (employeeStatusFilter.value !== 'all' && employee.status !== employeeStatusFilter.value) return false;
    if (employeeRoleFilter.value !== 'all' && employee.role !== employeeRoleFilter.value) return false;
    if (!query) return true;
    return [employee.displayName, employee.username, employee.wecomUserId || '']
      .some((value) => value.toLowerCase().includes(query));
  });
});
function clearEmployeeFilters() {
  employeeSearch.value = '';
  employeeStatusFilter.value = 'all';
  employeeRoleFilter.value = 'all';
}
// 内置环境管理员来自服务器环境变量，不存在于 admin_accounts，因此不会出现在员工列表里。
const builtInAdminHint = computed(() => {
  const profile = adminProfile.value;
  if (!profile || !profile.id.startsWith('admin:')) return '';
  const name = profile.username || profile.displayName || '环境管理员';
  return `当前登录的是内置环境管理员「${name}」：它由服务器环境变量提供，不是员工账号，不在下方列表中，也不能停用、改角色或单独授权。需要可管理的超级管理员，请点击「创建员工账号」新建一个。`;
});
const passwordRotation = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const passwordRotationError = ref('');
const passwordRotationSaving = ref(false);
const adminRole = computed(() => {
  try {
    const payload = token.value.split('.')[1];
    return payload ? String(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role || '') : '';
  } catch { return ''; }
});
const adminTokenPayload = computed<Record<string, unknown>>(() => {
  try {
    const payload = token.value.split('.')[1];
    return payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown> : {};
  } catch { return {}; }
});
const adminRoleLabels: Record<string, string> = { super_admin: '超级管理员', content_editor: '内容编辑', support_readonly: '客服只读' };
type AdminProfile = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  canEditAvatar: boolean;
  lastLoginAt?: string | null;
  permissions?: string[];
};
const adminProfile = ref<AdminProfile | null>(null);
const adminPermissions = ref<AdminModuleId[] | null>(null);
const adminIdentity = computed(() => {
  const payload = adminTokenPayload.value;
  const raw = String(adminProfile.value?.displayName || payload.displayName || payload.username || payload.sub || '').replace(/^admin:(?:wecom:)?/, '');
  const name = raw || '管理员';
  return {
    name,
    avatarUrl: adminProfile.value?.avatarUrl || '',
    roleLabel: adminRoleLabels[adminProfile.value?.role || adminRole.value] || '管理员',
    username: adminProfile.value?.username || '',
  };
});
const accountMenuOpen = ref(false);
const sidebarAccountMenuOpen = ref(false);
const notificationsOpen = ref(false);
const notificationItems = ref<AdminNotification[]>([]);
const notificationUnreadCount = ref(0);
const notificationsLoading = ref(false);
const notificationsError = ref('');
const notificationsMarkingId = ref('');
const notificationsMarkingAll = ref(false);
let notificationPollTimer: ReturnType<typeof setInterval> | null = null;
const profileDialogOpen = ref(false);
const profileAvatarSaving = ref(false);
const profileAvatarError = ref('');
const profileAvatarMessage = ref('');
const passwordDialogOpen = ref(false);
const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const passwordSaving = ref(false);
const passwordError = ref('');
const passwordMessage = ref('');

function closeAccountMenu() {
  accountMenuOpen.value = false;
  sidebarAccountMenuOpen.value = false;
}

function toggleAccountMenu() {
  sidebarAccountMenuOpen.value = false;
  notificationsOpen.value = false;
  accountMenuOpen.value = !accountMenuOpen.value;
}

function toggleSidebarAccountMenu() {
  accountMenuOpen.value = false;
  notificationsOpen.value = false;
  sidebarAccountMenuOpen.value = !sidebarAccountMenuOpen.value;
}

function notificationTimeLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function notificationExactTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '';
}

function stopNotificationPolling() {
  if (notificationPollTimer) clearInterval(notificationPollTimer);
  notificationPollTimer = null;
}

function resetAdminNotifications() {
  stopNotificationPolling();
  notificationsOpen.value = false;
  notificationItems.value = [];
  notificationUnreadCount.value = 0;
  notificationsLoading.value = false;
  notificationsError.value = '';
  notificationsMarkingId.value = '';
  notificationsMarkingAll.value = false;
}

async function refreshNotificationUnreadCount(silent = true) {
  if (!loggedIn.value || adminPasswordChangeRequired.value) return;
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/admin/notifications/unread-count`, { headers: adminHeaders() });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) {
      if (!silent && session === sessionGeneration) notificationsError.value = await responseMessage(response, '无法读取未读通知数量');
      return;
    }
    const result: unknown = await response.json().catch(() => null);
    if (!isAdminUnreadCount(result)) {
      if (!silent && session === sessionGeneration) notificationsError.value = '通知服务返回了无效数据';
      return;
    }
    if (session === sessionGeneration && loggedIn.value) notificationUnreadCount.value = result.unreadCount;
  } catch (caught) {
    if (!silent && session === sessionGeneration && loggedIn.value) {
      notificationsError.value = caught instanceof Error ? caught.message : '无法读取未读通知数量';
    }
  }
}

function startNotificationPolling() {
  stopNotificationPolling();
  if (!loggedIn.value || adminPasswordChangeRequired.value) return;
  void refreshNotificationUnreadCount();
  notificationPollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshNotificationUnreadCount();
  }, 30_000);
}

async function loadNotifications() {
  if (!loggedIn.value || adminPasswordChangeRequired.value || notificationsLoading.value) return;
  const session = sessionGeneration;
  notificationsLoading.value = true;
  notificationsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/notifications?limit=30&offset=0`, { headers: adminHeaders() });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取通知'));
    const result: unknown = await response.json().catch(() => null);
    if (!isAdminNotificationPage(result)) throw new Error('通知服务返回了无效数据');
    if (session !== sessionGeneration || !loggedIn.value) return;
    notificationItems.value = result.items;
    notificationUnreadCount.value = result.unreadCount;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      notificationsError.value = caught instanceof Error ? caught.message : '无法读取通知';
    }
  } finally {
    if (session === sessionGeneration) notificationsLoading.value = false;
  }
}

function closeNotificationPanel() {
  notificationsOpen.value = false;
}

function toggleNotificationPanel() {
  if (notificationsOpen.value) {
    closeNotificationPanel();
    return;
  }
  closeAccountMenu();
  commandMenuOpen.value = false;
  notificationsOpen.value = true;
  void loadNotifications();
}

function handleNotificationWindowFocus() {
  if (document.visibilityState !== 'visible' || !loggedIn.value || adminPasswordChangeRequired.value) return;
  void refreshNotificationUnreadCount();
  if (notificationsOpen.value) void loadNotifications();
}

async function markNotificationRead(notification: AdminNotification) {
  if (!loggedIn.value || notification.isRead || notificationsMarkingId.value || notificationsMarkingAll.value) return;
  const session = sessionGeneration;
  notificationsMarkingId.value = notification.id;
  notificationsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/notifications/${encodeURIComponent(notification.id)}/read`, {
      method: 'POST',
      headers: adminHeaders(),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '通知未能标记为已读'));
    const result: unknown = await response.json().catch(() => null);
    if (!isAdminNotificationReadResult(result)) throw new Error('通知服务返回了无效数据');
    if (session !== sessionGeneration || !loggedIn.value) return;
    notificationItems.value = notificationItems.value.map((item) => item.id === notification.id ? { ...item, isRead: true } : item);
    notificationUnreadCount.value = result.unreadCount;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      notificationsError.value = caught instanceof Error ? caught.message : '通知未能标记为已读';
    }
  } finally {
    if (session === sessionGeneration) notificationsMarkingId.value = '';
  }
}

async function markAllNotificationsRead() {
  if (!loggedIn.value || notificationsMarkingAll.value || notificationsMarkingId.value || notificationUnreadCount.value === 0) return;
  const session = sessionGeneration;
  notificationsMarkingAll.value = true;
  notificationsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/notifications/read-all`, {
      method: 'POST',
      headers: adminHeaders(),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '通知未能全部标记为已读'));
    const result: unknown = await response.json().catch(() => null);
    if (!isAdminNotificationReadResult(result)) throw new Error('通知服务返回了无效数据');
    if (session !== sessionGeneration || !loggedIn.value) return;
    notificationItems.value = notificationItems.value.map((item) => ({ ...item, isRead: true }));
    notificationUnreadCount.value = result.unreadCount;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      notificationsError.value = caught instanceof Error ? caught.message : '通知未能全部标记为已读';
    }
  } finally {
    if (session === sessionGeneration) notificationsMarkingAll.value = false;
  }
}

function openProfileDialog() {
  closeAccountMenu();
  profileAvatarError.value = '';
  profileAvatarMessage.value = '';
  profileDialogOpen.value = true;
}

async function loadAdminProfile() {
  if (!token.value) return;
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/admin/me`, { headers: adminHeaders() });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) return;
    const result = await response.json().catch(() => null) as AdminProfile | null;
    if (!result || typeof result.id !== 'string' || typeof result.displayName !== 'string') return;
    if (session !== sessionGeneration || !loggedIn.value) return;
    adminProfile.value = {
      id: result.id,
      username: String(result.username || ''),
      displayName: result.displayName,
      role: String(result.role || adminRole.value),
      avatarUrl: typeof result.avatarUrl === 'string' ? result.avatarUrl : null,
      canEditAvatar: result.canEditAvatar === true,
      lastLoginAt: result.lastLoginAt || null,
      permissions: Array.isArray(result.permissions) ? result.permissions.filter((item): item is string => typeof item === 'string') : undefined,
    };
    adminPermissions.value = Array.isArray(result.permissions)
      ? effectiveModulesForRole(String(result.role || adminRole.value), result.permissions)
      : null;
  } catch {
    // Identity falls back to the JWT payload when this non-critical request fails.
  }
}

function validateAvatarFile(file: File | null | undefined) {
  if (!file) throw new Error('请选择头像图片');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('头像仅支持 JPEG、PNG 或 WebP 图片');
  if (file.size > 2 * 1024 * 1024) throw new Error('头像大小不能超过 2 MB');
  return file;
}

async function uploadMyAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || profileAvatarSaving.value) return;
  profileAvatarError.value = '';
  profileAvatarMessage.value = '';
  const session = sessionGeneration;
  try {
    const avatar = validateAvatarFile(file);
    profileAvatarSaving.value = true;
    const form = new FormData();
    form.append('avatar', avatar);
    const response = await apiFetch(`${apiBase}/admin/me/avatar`, {
      method: 'POST',
      headers: adminHeaders(),
      body: form,
    }, mediaUploadTimeoutMs);
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '头像上传失败'));
    const result = await response.json().catch(() => null) as { avatarUrl?: string } | null;
    if (!result || typeof result.avatarUrl !== 'string') throw new Error('头像上传结果无效');
    if (session !== sessionGeneration) return;
    adminProfile.value = adminProfile.value
      ? { ...adminProfile.value, avatarUrl: result.avatarUrl }
      : { id: '', username: '', displayName: adminIdentity.value.name, role: adminRole.value, avatarUrl: result.avatarUrl, canEditAvatar: true };
    profileAvatarMessage.value = '头像已更新。';
  } catch (caught) {
    if (session === sessionGeneration) profileAvatarError.value = caught instanceof Error ? caught.message : '头像上传失败';
  } finally {
    if (session === sessionGeneration) profileAvatarSaving.value = false;
  }
}

async function removeMyAvatar() {
  if (profileAvatarSaving.value) return;
  profileAvatarError.value = '';
  profileAvatarMessage.value = '';
  const session = sessionGeneration;
  try {
    profileAvatarSaving.value = true;
    const response = await apiFetch(`${apiBase}/admin/me/avatar`, { method: 'DELETE', headers: adminHeaders() });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '恢复默认头像失败'));
    if (session !== sessionGeneration) return;
    if (adminProfile.value) adminProfile.value = { ...adminProfile.value, avatarUrl: null };
    profileAvatarMessage.value = '已恢复默认 M 头像。';
  } catch (caught) {
    if (session === sessionGeneration) profileAvatarError.value = caught instanceof Error ? caught.message : '恢复默认头像失败';
  } finally {
    if (session === sessionGeneration) profileAvatarSaving.value = false;
  }
}

function openPasswordDialog() {
  closeAccountMenu();
  passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
  passwordError.value = '';
  passwordMessage.value = '';
  passwordDialogOpen.value = true;
}

async function submitPasswordChange() {
  if (passwordSaving.value) return;
  const form = passwordForm.value;
  if (!form.currentPassword) { passwordError.value = '请输入当前密码'; return; }
  if (form.newPassword.length < 12) { passwordError.value = '新密码至少需要 12 位'; return; }
  if (form.newPassword !== form.confirmPassword) { passwordError.value = '两次输入的新密码不一致'; return; }
  passwordSaving.value = true;
  passwordError.value = '';
  passwordMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/admin/me/password`, {
      method: 'PATCH',
      headers: adminHeaders(true),
      body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '密码修改失败，请检查当前密码后重试。'));
    const result = await response.json().catch(() => null) as { accessToken?: string; expiresIn?: number } | null;
    if (result?.accessToken && Number.isFinite(result.expiresIn)) {
      token.value = result.accessToken;
      localStorage.setItem('myriad_she_admin_token', token.value);
      sessionGeneration += 1;
      scheduleSessionExpiry(Number(result.expiresIn));
    }
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    passwordDialogOpen.value = false;
    passwordMessage.value = '密码已更新';
    startNotificationPolling();
    window.setTimeout(() => { passwordMessage.value = ''; }, 4000);
  } catch (caught) {
    passwordError.value = caught instanceof Error ? caught.message : '密码修改失败';
  } finally {
    passwordSaving.value = false;
  }
}

const adminPasswordChangeRequired = computed(() => {
  try {
    const payload = token.value.split('.')[1];
    return payload ? JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).passwordChangeRequired === true : false;
  } catch { return false; }
});
const isSuperAdmin = computed(() => adminRole.value === 'super_admin');
const adminModuleList = computed<AdminModuleId[]>(() => adminPermissions.value ?? effectiveModulesForRole(adminRole.value, null));
const canAccessAnyModule = computed(() => adminModuleList.value.length > 0);
const overviewGreeting = computed(() => {
  const hour = new Date().getHours();
  const period = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  return `${period}，${adminIdentity.value.name}`;
});
type AuditCategory = '内容发布' | '讨论管理' | '会员操作' | '观察记录' | '账户与权限' | '隐私与安全' | '系统设置';
type AuditActionDefinition = { label: string; category: AuditCategory };
const auditActionDefinitions: Record<string, AuditActionDefinition> = {
  'admin.auth.login_succeeded': { label: '成功登录后台', category: '账户与权限' },
  'admin.auth.login_failed': { label: '登录后台失败', category: '账户与权限' },
  'admin.auth.provisioned': { label: '首次扫码并创建了管理员账号', category: '账户与权限' },
  'admin.password.changed': { label: '修改了登录密码', category: '账户与权限' },
  'admin.profile.avatar.updated': { label: '更换了个人头像', category: '账户与权限' },
  'admin.profile.avatar.removed': { label: '移除了个人头像', category: '账户与权限' },
  'admin.employee.created': { label: '创建了员工账号', category: '账户与权限' },
  'admin.employee.updated': { label: '修改了员工账号权限', category: '账户与权限' },
  'admin.employee.avatar.updated': { label: '更换了员工头像', category: '账户与权限' },
  'admin.employee.avatar.removed': { label: '移除了员工头像', category: '账户与权限' },
  'admin.employees.listed': { label: '查看了员工列表', category: '账户与权限' },
  'audit.logs.viewed': { label: '查看了操作记录', category: '账户与权限' },
  'user.created': { label: '创建了账号', category: '账户与权限' },
  'user.profile.updated': { label: '修改了个人资料', category: '账户与权限' },
  'user.address.updated': { label: '修改了收货地址', category: '账户与权限' },
  'user.phone_number.updated': { label: '修改了绑定手机号', category: '账户与权限' },
  'user.settings.updated': { label: '修改了个人设置', category: '账户与权限' },
  'member.listed': { label: '查看了会员列表', category: '会员操作' },
  'member.viewed': { label: '查看了会员详情', category: '会员操作' },
  'member.phone.viewed': { label: '查看了会员手机号', category: '会员操作' },
  'member.addresses.viewed': { label: '查看了会员收货地址', category: '会员操作' },
  'member.address.viewed': { label: '查看了会员收货地址', category: '会员操作' },
  'member.suspended': { label: '停用了会员账号', category: '会员操作' },
  'member.active': { label: '恢复了会员账号', category: '会员操作' },
  'observation.listed': { label: '查看了观察记录列表', category: '观察记录' },
  'observation.admin.viewed': { label: '查看了观察记录详情', category: '观察记录' },
  'observation.created': { label: '新建了观察记录', category: '观察记录' },
  'observation.saved': { label: '保存了观察记录', category: '观察记录' },
  'observation.updated': { label: '更新了观察记录', category: '观察记录' },
  'observation.deleted': { label: '删除了观察记录', category: '观察记录' },
  'observation.answers.reencrypted': { label: '重新加密了观察记录', category: '观察记录' },
  'discussion_contribution.saved': { label: '提交了讨论内容', category: '讨论管理' },
  'discussion_contribution.deleted': { label: '删除了讨论内容', category: '讨论管理' },
  'discussion_contribution.admin.viewed': { label: '查看了讨论内容', category: '讨论管理' },
  'discussion_contribution.publication.updated': { label: '调整了讨论发布状态', category: '讨论管理' },
  'discussion_contribution.status.updated': { label: '调整了讨论状态', category: '讨论管理' },
  'discussion_contribution.featured.updated': { label: '调整了精华内容', category: '讨论管理' },
  'discussion_report.created': { label: '提交了用户举报', category: '讨论管理' },
  'discussion_report.status.updated': { label: '处理了用户举报', category: '讨论管理' },
  'discussion_restriction.created': { label: '停用了会员的一起谈谈权限', category: '讨论管理' },
  'discussion_restriction.revoked': { label: '恢复了会员的一起谈谈权限', category: '讨论管理' },
  'privacy.requests.listed': { label: '查看了删除申请', category: '隐私与安全' },
  'privacy.deletion.requested': { label: '申请了删除账号', category: '隐私与安全' },
  'privacy.deletion.cancelled': { label: '取消了删除账号', category: '隐私与安全' },
  'privacy.deletion.started': { label: '开始执行账号删除', category: '隐私与安全' },
  'privacy.deletion.completed': { label: '完成了账号删除', category: '隐私与安全' },
  'privacy.deletion.failed': { label: '账号删除失败', category: '隐私与安全' },
  'privacy.deletion.retry_requested': { label: '重新处理账号删除', category: '隐私与安全' },
  'privacy.deletion.orphan_reconciled': { label: '清理了未完成的账号删除', category: '隐私与安全' },
  'privacy.data.exported': { label: '导出了个人数据', category: '隐私与安全' },
  'content.about.draft_saved': { label: '保存了关于页面草稿', category: '内容发布' },
  'content.about.published': { label: '发布了关于页面', category: '内容发布' },
  'content.daily_objects.draft_saved': { label: '保存了日常之物草稿', category: '内容发布' },
  'content.daily_objects.published': { label: '发布了日常之物', category: '内容发布' },
  'content.discussion.draft_saved': { label: '保存了本期讨论草稿', category: '内容发布' },
  'content.discussion.published': { label: '发布了本期讨论', category: '内容发布' },
  'content.issue_practice_copy.copied': { label: '复制了期刊实践文案', category: '内容发布' },
  'content.issue_practice_copy.saved': { label: '保存了期刊实践文案', category: '内容发布' },
  'content.issue.auto_archived': { label: '自动归档了期刊', category: '内容发布' },
  'content.issue.archived': { label: '归档了期刊', category: '内容发布' },
  'content.issue.created': { label: '创建了期刊', category: '内容发布' },
  'content.issue.deleted': { label: '删除期刊', category: '内容发布' },
  'content.issue.published': { label: '发布了期刊', category: '内容发布' },
  'content.issue.restored': { label: '恢复期刊为草稿', category: '内容发布' },
  'content.issue.updated': { label: '更新了期刊', category: '内容发布' },
  'content.legal_document.draft_saved': { label: '保存了协议草稿', category: '内容发布' },
  'content.legal_document.published': { label: '发布了协议页面', category: '内容发布' },
  'content.life_card.updated': { label: '更新了生命牌文案', category: '内容发布' },
  'content.life_cards.imported': { label: '导入了生命牌文案', category: '内容发布' },
  'content.media.deleted': { label: '删除了媒体文件', category: '内容发布' },
  'content.media.deletion_failed': { label: '删除媒体文件失败', category: '内容发布' },
  'content.media.deletion_requested': { label: '发起了媒体文件删除', category: '内容发布' },
  'content.mine_page.updated': { label: '更新了“我的页面”', category: '内容发布' },
  'content.practice.draft_saved': { label: '保存了实践页面草稿', category: '内容发布' },
  'content.practice.published': { label: '发布了实践页面', category: '内容发布' },
  'content.practice.updated': { label: '更新了实践页面', category: '内容发布' },
  'system.settings.updated': { label: '修改了系统设置', category: '系统设置' },
};
const auditCategoryOrder: AuditCategory[] = ['内容发布', '讨论管理', '会员操作', '观察记录', '账户与权限', '隐私与安全', '系统设置'];
const auditActionGroups = auditCategoryOrder.map((category) => ({
  category,
  actions: Object.entries(auditActionDefinitions)
    .filter(([, definition]) => definition.category === category)
    .map(([value, definition]) => ({ value, label: definition.label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
}));
const auditResourceLabels: Record<string, string> = {
  about_content: '关于页面',
  admin_account: '管理员账号',
  admin_accounts: '管理员账号列表',
  admin_login: '后台登录',
  audit_logs: '操作记录',
  content_discussion_page: '本期讨论',
  content_issue: '期刊',
  content_life_card: '生命牌文案',
  content_media: '媒体文件',
  daily_objects_content: '日常之物',
  discussion_contribution: '讨论内容',
  discussion_contributions: '讨论内容',
  discussion_report: '用户举报',
  discussion_user_restriction: '一起谈谈权限',
  legal_document: '协议页面',
  mine_page_content: '我的页面',
  observation: '观察记录',
  observation_batch: '观察记录',
  observations: '观察记录',
  practice_content: '实践页面',
  privacy_request: '删除申请',
  privacy_requests: '删除申请',
  system_settings: '系统设置',
  user: '会员',
  user_export: '个人数据',
  user_profile: '个人资料',
  user_settings: '个人设置',
  users: '会员列表',
};
function auditActionLabel(action: string) { return auditActionDefinitions[action]?.label ?? '执行了一项后台操作'; }
function auditActionCategory(action: string) { return auditActionDefinitions[action]?.category ?? '其他操作'; }
function auditResourceLabel(resourceType: string) { return auditResourceLabels[resourceType] ?? '后台数据'; }
function auditActorLabel(actorType: AuditEntry['actorType']) { return actorType === 'admin' ? '管理员' : actorType === 'user' ? '用户' : '系统'; }
function auditActorInitial(actorType: AuditEntry['actorType']) { return actorType === 'admin' ? '管' : actorType === 'user' ? '用' : '系'; }
function auditMetadataText(value: unknown) {
  if (value === null || value === undefined) return '无附加信息';
  try {
    const text = JSON.stringify(value, null, 2);
    return text && text !== '{}' ? text : '无附加信息';
  } catch {
    return String(value);
  }
}
function overviewAuditAction(action: string) { return auditActionLabel(action); }
function overviewAuditResource(resourceType: string) { return auditResourceLabel(resourceType); }
function canAccessModule(id: AdminModuleId) { return adminModuleList.value.includes(id); }
const observationStatus = ref('');
const observationMethod = ref('');
const observationIssueCode = ref('');
const observationStaleOnly = ref(false);
const observationStatusBeforeStale = ref<string | null>(null);
const dashboardLoading = ref(false);
const overviewUpdatedAt = ref('');
const overviewSyncError = ref('');
const currentPageRefreshing = ref(false);
type DashboardSection = 'overview' | 'practice' | 'content' | 'observations' | 'contributions' | 'discussion-restrictions' | 'discussion-reports' | 'privacy' | 'audit' | 'members' | 'settings' | 'store-settings' | 'status-machine' | 'employees' | 'life-cards' | 'life-card-views';
type JournalSection = 'journal-list' | 'journal-home' | 'journal-story' | 'journal-audio' | 'journal-discussion' | 'journal-archive';
type PageSection = 'mine' | 'privacy-policy' | 'user-agreement' | 'legal-history' | 'privacy-page' | 'about-history';
type PracticeSection = 'practice' | 'practice-directory' | 'observation' | 'shared-practice' | 'daily-objects';
type ContentSection = JournalSection | PageSection | PracticeSection | 'media';
const dashboardSectionKeys = new Set<DashboardSection>(['overview', 'practice', 'content', 'observations', 'contributions', 'discussion-restrictions', 'discussion-reports', 'privacy', 'audit', 'members', 'settings', 'store-settings', 'status-machine', 'employees', 'life-cards', 'life-card-views']);
const contentSectionKeys = new Set<ContentSection>(['practice', 'practice-directory', 'observation', 'shared-practice', 'daily-objects', 'privacy-page', 'about-history', 'privacy-policy', 'user-agreement', 'legal-history', 'media', 'mine', 'journal-list', 'journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive']);
const journalSections: JournalSection[] = ['journal-list', 'journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive'];
const pageSections: PageSection[] = ['mine', 'privacy-policy', 'user-agreement', 'legal-history', 'privacy-page', 'about-history'];
const practiceSections: PracticeSection[] = ['practice', 'practice-directory', 'observation', 'shared-practice', 'daily-objects'];
const operationsSections = ['contributions', 'discussion-restrictions', 'discussion-reports', 'observations', 'privacy', 'audit'] as const;
const settingsSections = ['settings', 'store-settings'] as const;
const systemSections = [...settingsSections, 'status-machine', 'employees'] as const;
const lifeCardSections = ['life-cards', 'life-card-views'] as const;
type OperationsSection = typeof operationsSections[number];
type SettingsSection = typeof settingsSections[number];
type SystemSection = typeof systemSections[number];
type LifeCardSection = typeof lifeCardSections[number];
const operationsSectionModules: Record<OperationsSection, AdminModuleId> = {
  contributions: 'contributions',
  'discussion-restrictions': 'contributions',
  'discussion-reports': 'discussion-reports',
  observations: 'observations',
  privacy: 'privacy',
  audit: 'audit',
};
function isOperationsSection(section: DashboardSection | string): section is OperationsSection {
  return (operationsSections as readonly string[]).includes(section);
}
function isSettingsSection(section: DashboardSection | string): section is SettingsSection {
  return (settingsSections as readonly string[]).includes(section);
}
function isSystemSection(section: DashboardSection | string): section is SystemSection {
  return (systemSections as readonly string[]).includes(section);
}
function isLifeCardSection(section: DashboardSection | string): section is LifeCardSection {
  return (lifeCardSections as readonly string[]).includes(section);
}
const journalModuleSections = ['journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive'] as const;
function isJournalSection(section: ContentSection | string): section is JournalSection { return (journalSections as string[]).includes(section); }
function isPageSection(section: ContentSection | string): section is PageSection { return (pageSections as string[]).includes(section); }
function isPracticeSection(section: ContentSection | string): section is PracticeSection { return (practiceSections as string[]).includes(section); }
function readDashboardLocation() {
  try {
    const raw = JSON.parse(localStorage.getItem('myriad_she_admin_location') || '{}') as Record<string, unknown>;
    const storedSection = raw.section === 'brand-popup-settings' ? 'settings' : raw.section;
    let section = dashboardSectionKeys.has(storedSection as DashboardSection) ? storedSection as DashboardSection : 'overview';
    const legacySection = raw.contentSection === 'issues' ? 'journal-list' : raw.contentSection;
    const contentSection = contentSectionKeys.has(legacySection as ContentSection) ? legacySection as ContentSection : 'practice';
    if (section === 'content' && isPracticeSection(contentSection)) section = 'practice';
    if (section === 'practice' && !isPracticeSection(contentSection)) section = 'content';
    return { section, contentSection };
  } catch {
    return { section: 'overview' as DashboardSection, contentSection: 'practice' as ContentSection };
  }
}
const initialDashboardLocation = readDashboardLocation();
const activeSection = ref<DashboardSection>(initialDashboardLocation.section);
const activeContentSection = ref<ContentSection>(initialDashboardLocation.contentSection);
// 员工登录后的默认落点：按已授权模块选择第一个可用页面。
const staffLandingCandidates: Array<{ section: DashboardSection; contentSection: ContentSection; module: AdminModuleId }> = [
  { section: 'practice', contentSection: 'practice', module: 'practice' },
  { section: 'content', contentSection: 'journal-list', module: 'journal' },
  { section: 'content', contentSection: 'privacy-page', module: 'pages' },
  { section: 'content', contentSection: 'media', module: 'media' },
  { section: 'contributions', contentSection: 'practice', module: 'contributions' },
  { section: 'discussion-reports', contentSection: 'practice', module: 'discussion-reports' },
  { section: 'observations', contentSection: 'practice', module: 'observations' },
  { section: 'privacy', contentSection: 'practice', module: 'privacy' },
  { section: 'audit', contentSection: 'practice', module: 'audit' },
  { section: 'members', contentSection: 'practice', module: 'members' },
  { section: 'settings', contentSection: 'practice', module: 'settings' },
  { section: 'store-settings', contentSection: 'practice', module: 'settings' },
  { section: 'status-machine', contentSection: 'practice', module: 'settings' },
  { section: 'life-cards', contentSection: 'practice', module: 'life-cards' },
  { section: 'life-card-views', contentSection: 'practice', module: 'life-card-views' },
];

function resolveLandingLocation() {
  const match = staffLandingCandidates.find((candidate) => canAccessModule(candidate.module));
  return match
    ? { section: match.section, contentSection: match.contentSection }
    : { section: activeSection.value, contentSection: activeContentSection.value };
}

async function enterDashboardByPermissions() {
  if (isSuperAdmin.value) {
    await loadDashboard();
    if (activeSection.value === 'members' && !members.value.length) await refreshMembers();
    if (activeSection.value === 'employees' && !employees.value.length) await loadEmployees();
    if (activeSection.value === 'life-cards' && !lifeCards.value.length) await loadLifeCards();
    if (activeSection.value === 'life-card-views' && !lifeCardViews.value.length) await loadLifeCardViews();
    return;
  }
  const landing = resolveLandingLocation();
  activeSection.value = landing.section;
  activeContentSection.value = landing.contentSection;
  await loadDashboard();
  if (landing.section === 'content' && landing.contentSection === 'media') await loadOrphanMedia(true);
  if (landing.section === 'members') await refreshMembers();
  if (isSettingsSection(landing.section)) await loadSystemSettings();
  if (landing.section === 'life-cards') await loadLifeCards();
  if (landing.section === 'life-card-views') await loadLifeCardViews();
  if (landing.section === 'contributions') await refreshDiscussionContributions();
  if (landing.section === 'discussion-reports') await refreshDiscussionReports();
}
const sidebarCollapsed = ref(localStorage.getItem('myriad_she_admin_sidebar_collapsed') === 'true');
watch(sidebarCollapsed, (collapsed) => localStorage.setItem('myriad_she_admin_sidebar_collapsed', String(collapsed)));
const commandMenuOpen = ref(false);
function openCommandMenu() {
  closeAccountMenu();
  notificationsOpen.value = false;
  commandMenuOpen.value = true;
}
function handleWorkspaceShortcut(event: KeyboardEvent) {
  if (!loggedIn.value || adminPasswordChangeRequired.value || event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if (!commandMenuOpen.value && document.querySelector('[aria-modal="true"]')) return;
    event.preventDefault();
    if (commandMenuOpen.value) commandMenuOpen.value = false;
    else openCommandMenu();
  }
  if (event.key === 'Escape') {
    closeAccountMenu();
    closeNotificationPanel();
  }
}
// 回到顶部：滚动超过一屏后出现，避免长表格页无处可回去。
const showBackToTop = ref(false);

function handleWorkspaceScroll() {
  showBackToTop.value = window.scrollY > 480;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
const practiceNavigationExpanded = ref(initialDashboardLocation.section === 'practice');
const journalNavigationExpanded = ref(initialDashboardLocation.section === 'content' && (isJournalSection(initialDashboardLocation.contentSection) || initialDashboardLocation.contentSection === 'media'));
const pageNavigationExpanded = ref(initialDashboardLocation.section === 'content' && isPageSection(initialDashboardLocation.contentSection));
const operationsNavigationExpanded = ref(isOperationsSection(initialDashboardLocation.section));
const systemNavigationExpanded = ref(isSystemSection(initialDashboardLocation.section));
const lifeCardNavigationExpanded = ref(isLifeCardSection(initialDashboardLocation.section));
function openJournalNavigation() {
  const onJournal = activeSection.value === 'content' && (isJournalSection(activeContentSection.value) || activeContentSection.value === 'media');
  const shouldCollapse = !sidebarCollapsed.value && onJournal && journalNavigationExpanded.value;
  sidebarCollapsed.value = false;
  activeSection.value = 'content';
  journalNavigationExpanded.value = !shouldCollapse;
  pageNavigationExpanded.value = false;
  operationsNavigationExpanded.value = false;
  systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  if (!shouldCollapse && !onJournal) activeContentSection.value = 'journal-list';
}
async function openJournalSubsection(section: JournalSection | 'media') {
  activeSection.value = 'content';
  activeContentSection.value = section;
  journalNavigationExpanded.value = true;
  pageNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  issueSaveMessage.value = '';
  if (!editingIssueId.value && (journalSections as string[]).includes(section) && section !== 'journal-list') {
    const preferred = issues.value.find((issue) => issue.status === 'published') || issues.value[0];
    if (preferred) await editIssue(preferred);
  }
  ensureJournalModuleSelection();
  if (section === 'journal-discussion') void loadDiscussionPageDraft();
}
async function ensureJournalIssueSelection() {
  if (editingIssueId.value || uploading.value || !issues.value.length) return;
  if (activeSection.value !== 'content' || !(journalSections as string[]).includes(activeContentSection.value) || activeContentSection.value === 'journal-list') return;
  const preferred = issues.value.find((issue) => issue.status === 'published') || issues.value[0];
  if (preferred) await editIssue(preferred);
  ensureJournalModuleSelection();
}
function openPageNavigation() {
  const onPage = activeSection.value === 'content' && isPageSection(activeContentSection.value);
  const shouldCollapse = !sidebarCollapsed.value && onPage && pageNavigationExpanded.value;
  sidebarCollapsed.value = false;
  activeSection.value = 'content';
  pageNavigationExpanded.value = !shouldCollapse;
  journalNavigationExpanded.value = false;
  operationsNavigationExpanded.value = false;
  systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  if (!shouldCollapse && !onPage) activeContentSection.value = isSuperAdmin.value ? 'mine' : 'privacy-policy';
}
async function restoreLegalVersion(payload: { key: LegalKey; content: LegalContent }) {
  const target = payload.key === 'privacy-policy' ? privacyDocumentManager.value : agreementDocumentManager.value;
  activeSection.value = 'content';
  activeContentSection.value = payload.key;
  pageNavigationExpanded.value = true;
  lifeCardNavigationExpanded.value = false;
  await nextTick();
  await target?.restore(payload.content);
}
function openPracticeNavigation() {  const shouldCollapse = !sidebarCollapsed.value
    && activeSection.value === 'practice'
    && practiceNavigationExpanded.value;
  sidebarCollapsed.value = false;
  activeSection.value = 'practice';
  practiceNavigationExpanded.value = !shouldCollapse;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
  operationsNavigationExpanded.value = false;
  systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  if (!shouldCollapse && !isPracticeSection(activeContentSection.value)) {
    activeContentSection.value = 'practice';
  }
}
function openOperationsNavigation() {
  const onOperations = isOperationsSection(activeSection.value);
  const shouldCollapse = !sidebarCollapsed.value && onOperations && operationsNavigationExpanded.value;
  sidebarCollapsed.value = false;
  if (!onOperations) {
    const first = operationsSections.find((section) => canAccessModule(operationsSectionModules[section]));
    if (first) activeSection.value = first;
  }
  operationsNavigationExpanded.value = !shouldCollapse;
  systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
}
function openOperationsSubsection(section: OperationsSection) {
  sidebarCollapsed.value = false;
  activeSection.value = section;
  operationsNavigationExpanded.value = true;
  systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
}
function openMembersNavigation() {
  sidebarCollapsed.value = false;
  activeSection.value = 'members';
  systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  operationsNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
  void refreshMembers();
}
function openSystemNavigation() {
  const onSystem = isSystemSection(activeSection.value);
  const shouldCollapse = !sidebarCollapsed.value && onSystem && systemNavigationExpanded.value;
  sidebarCollapsed.value = false;
  if (!onSystem) {
    const first = systemSections.find((section) => {
      if (section === 'employees') return isSuperAdmin.value;
      return canAccessModule('settings');
    });
    if (first) activeSection.value = first;
  }
  systemNavigationExpanded.value = !shouldCollapse;
  operationsNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
}
function openSystemSubsection(section: SystemSection) {
  sidebarCollapsed.value = false;
  activeSection.value = section;
  systemNavigationExpanded.value = true;
  operationsNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  if (isSettingsSection(section)) {
    settingsMessage.value = '';
    settingsError.value = '';
    void loadSystemSettings();
  }
  if (section === 'employees') void loadEmployees();
}
function openLifeCardNavigation() {
  const onLifeCard = isLifeCardSection(activeSection.value);
  const shouldCollapse = !sidebarCollapsed.value && onLifeCard && lifeCardNavigationExpanded.value;
  sidebarCollapsed.value = false;
  if (!onLifeCard) {
    const first = lifeCardSections.find((section) => canAccessModule(section));
    if (first) activeSection.value = first;
  }
  lifeCardNavigationExpanded.value = !shouldCollapse;
  systemNavigationExpanded.value = false;
  operationsNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
}
function openLifeCardSubsection(section: LifeCardSection) {
  sidebarCollapsed.value = false;
  activeSection.value = section;
  lifeCardNavigationExpanded.value = true;
  systemNavigationExpanded.value = false;
  operationsNavigationExpanded.value = false;
  practiceNavigationExpanded.value = false;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
  if (section === 'life-cards') void loadLifeCards();
  if (section === 'life-card-views') void loadLifeCardViews();
}
function enterSubnav(element: Element) {
  const nav = element as HTMLElement;
  nav.style.height = '0px';
  nav.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    nav.style.height = `${nav.scrollHeight}px`;
  });
}
function afterEnterSubnav(element: Element) {
  const nav = element as HTMLElement;
  nav.style.height = '';
  nav.style.overflow = '';
}
function leaveSubnav(element: Element) {
  const nav = element as HTMLElement;
  nav.style.height = `${nav.scrollHeight}px`;
  nav.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    nav.style.height = '0px';
  });
}
function afterLeaveSubnav(element: Element) {
  const nav = element as HTMLElement;
  nav.style.height = '';
  nav.style.overflow = '';
}
watch([activeSection, activeContentSection], ([section, contentSection]) => {
  localStorage.setItem('myriad_she_admin_location', JSON.stringify({ section, contentSection }));
});
watch(activeSection, (section) => {
  if (isOperationsSection(section)) operationsNavigationExpanded.value = true;
  if (isSystemSection(section)) systemNavigationExpanded.value = true;
  if (isLifeCardSection(section)) lifeCardNavigationExpanded.value = true;
  if (section === 'contributions' && loggedIn.value) void refreshDiscussionContributions();
  if (section === 'discussion-restrictions' && loggedIn.value) void refreshDiscussionRestrictions();
  if (section !== 'discussion-restrictions') discussionRestrictionDialogOpen.value = false;
  if (section === 'discussion-reports' && loggedIn.value) void refreshDiscussionReports();
});
const currentView = computed(() => {
  if (activeSection.value === 'practice') {
    if (activeContentSection.value === 'practice-directory') return { eyebrow: 'PRACTICE / DIRECTORY', title: '实践目录' };
    if (activeContentSection.value === 'observation') return { eyebrow: 'PRACTICE / CONTENT / OBSERVATION', title: '此刻观察' };
    if (activeContentSection.value === 'shared-practice') return { eyebrow: 'PRACTICE / CONTENT / SHARED PRACTICE', title: '共同实践' };
    if (activeContentSection.value === 'daily-objects') return { eyebrow: 'PRACTICE / DAILY OBJECTS', title: '日常之物' };
    if (activeContentSection.value === 'privacy-page') return { eyebrow: 'PRIVACY / ABOUT', title: '关于 MYRIAD SHE' };
    if (activeContentSection.value === 'about-history') return { eyebrow: 'PRIVACY / ABOUT / HISTORY', title: '关于发布历史' };
    if (activeContentSection.value === 'privacy-policy') return { eyebrow: 'MINE / PRIVACY / POLICY', title: '隐私政策' };
    return { eyebrow: 'PRACTICE / PAGE COPY', title: '实践页面' };
  }
  if (activeSection.value === 'content') {
    const contentViews: Record<ContentSection, { eyebrow: string; title: string }> = {
      practice: { eyebrow: 'PRACTICE / PAGE COPY', title: '实践页面' },
      'practice-directory': { eyebrow: 'PRACTICE / DIRECTORY', title: '实践目录' },
      observation: { eyebrow: 'PRACTICE / CONTENT / OBSERVATION', title: '此刻观察' },
      'shared-practice': { eyebrow: 'PRACTICE / CONTENT / SHARED PRACTICE', title: '共同实践' },
      'daily-objects': { eyebrow: 'PRACTICE / DAILY OBJECTS', title: '日常之物' },
      mine: { eyebrow: 'PAGES / MINE', title: '我的页面设置' },
      media: { eyebrow: 'EDITORIAL / MEDIA', title: '媒体库' },
      'journal-list': { eyebrow: 'EDITORIAL / ISSUES', title: '期刊列表' },
      'journal-home': { eyebrow: 'EDITORIAL / HOME', title: '首页策展' },
      'journal-story': { eyebrow: 'EDITORIAL / STORY', title: '人物故事' },
      'journal-audio': { eyebrow: 'EDITORIAL / VOICE', title: '微声音' },
      'journal-discussion': { eyebrow: 'EDITORIAL / DISCUSSION', title: '本期讨论' },
      'journal-archive': { eyebrow: 'EDITORIAL / ARCHIVE', title: '往期策展' },
      'privacy-page': { eyebrow: 'PAGES / ABOUT', title: '关于 MYRIAD SHE' },
      'about-history': { eyebrow: 'PAGES / ABOUT / HISTORY', title: '关于发布历史' },
      'privacy-policy': { eyebrow: 'PAGES / PRIVACY / POLICY', title: '隐私政策' },
      'user-agreement': { eyebrow: 'PAGES / USER / AGREEMENT', title: '用户协议' },
      'legal-history': { eyebrow: 'PAGES / LEGAL / HISTORY', title: '历史版本' },
    };
    return contentViews[activeContentSection.value];
  }
  const views: Record<Exclude<DashboardSection, 'content' | 'practice'>, { eyebrow: string; title: string }> = {
    overview: { eyebrow: 'WORKSPACE / OVERVIEW', title: '工作台' },
    observations: { eyebrow: 'OBSERVATIONS / MANAGEMENT', title: '观察记录管理' },
    contributions: { eyebrow: 'TOGETHER / CONTENT', title: '一起谈谈内容' },
    'discussion-restrictions': { eyebrow: 'TOGETHER / ACCESS', title: '一起谈谈权限' },
    'discussion-reports': { eyebrow: 'DISCUSSION / REPORTS', title: '用户举报' },
    privacy: { eyebrow: 'PRIVACY / REQUESTS', title: '隐私申请' },
    audit: { eyebrow: 'AUDIT LOG / 操作记录', title: '操作记录' },
    members: { eyebrow: 'MEMBERS / DIRECTORY', title: '会员列表' },
    settings: { eyebrow: 'SYSTEM / SETTINGS', title: '系统设置' },
    'store-settings': { eyebrow: 'COMMERCE / STORE', title: '商城开放' },
    'status-machine': { eyebrow: 'SYSTEM / MODULE STATES', title: '模块状态机' },
    employees: { eyebrow: 'SYSTEM / EMPLOYEES', title: '员工与权限' },
    'life-cards': { eyebrow: 'CONTENT / LIFE CARDS', title: '生命牌文案' },
    'life-card-views': { eyebrow: 'CONTENT / LIFE CARD VIEWS', title: '生命牌查看' },
  };
  return views[activeSection.value];
});
type AdminDestination = {
  id: string;
  label: string;
  group: string;
  description: string;
  keywords: string;
  section: DashboardSection;
  contentSection?: ContentSection;
  module?: AdminModuleId;
  superOnly?: boolean;
};
const adminDestinations: AdminDestination[] = [
  { id: 'overview', label: '工作台', group: '总览', description: '查看关键数据、待办与最近操作。', keywords: 'dashboard home overview', section: 'overview', superOnly: true },
  ...([
    ['practice', '实践页面', '管理实践入口、介绍与页面文案。'],
    ['practice-directory', '实践目录', '配置实践目录与各个内容入口。'],
    ['observation', '此刻观察', '编辑观察引导，让每一次记录更有温度。'],
    ['shared-practice', '共同实践', '管理共同实践的介绍、规则与引导。'],
    ['daily-objects', '日常之物', '维护物品内容，预览并发布草稿。'],
  ] as const).map(([id, label, description]) => ({ id, label, description, group: '实践', keywords: 'practice', section: 'practice' as const, contentSection: id, module: 'practice' as const })),
  ...([
    ['journal-list', '期刊列表', '管理每一期内容，从草稿到正式发布。'],
    ['journal-home', '首页策展', '编排首页栏目与期刊展示内容。'],
    ['journal-story', '人物故事', '编辑人物叙事，实时预览阅读效果。'],
    ['journal-audio', '微声音', '管理音频、文案与收听入口。'],
    ['journal-discussion', '本期讨论', '设置讨论话题、引导与互动内容。'],
    ['journal-archive', '往期策展', '整理往期期刊与归档展示。'],
  ] as const).map(([id, label, description]) => ({ id, label, description, group: '期刊', keywords: 'journal editorial', section: 'content' as const, contentSection: id, module: 'journal' as const })),
  { id: 'media', label: '媒体库', group: '期刊', description: '查找音频与媒体文件，清理未引用资源。', keywords: 'audio image media', section: 'content', contentSection: 'media', module: 'media' },
  ...([
    ['mine', '我的页面设置', '维护个人页面的模块与显示文案。'],
    ['privacy-page', '关于 MYRIAD SHE', '编辑品牌介绍，检查预览并发布。'],
    ['about-history', '关于发布历史', '查看关于页面的历史发布内容。'],
    ['privacy-policy', '隐私政策', '维护隐私政策草稿、预览与发布版本。'],
    ['user-agreement', '用户协议', '维护用户协议，核对版本后发布。'],
    ['legal-history', '历史版本', '查询政策与协议的历史发布版本。'],
  ] as const).map(([id, label, description]) => ({ id, label, description, group: '页面与协议', keywords: 'pages legal privacy agreement', section: 'content' as const, contentSection: id, module: 'pages' as const, superOnly: id === 'mine' })),
  { id: 'members', label: '会员列表', group: '会员', description: '按昵称与注册时间查找会员，查看账号详情。', keywords: 'users members', section: 'members', module: 'members' },
  { id: 'contributions', label: '一起谈谈内容', group: '运营管理', description: '审核互动内容、设置精华与公开状态。', keywords: 'together discussion content moderation', section: 'contributions', module: 'contributions' },
  { id: 'discussion-restrictions', label: '一起谈谈权限', group: '运营管理', description: '停用或恢复会员在一起谈谈中的发布与回复权限。', keywords: 'together discussion access restriction', section: 'discussion-restrictions', module: 'contributions' },
  ...([
    ['discussion-reports', '用户举报', '核对举报原因与讨论内容，跟进处理状态。'],
    ['observations', '观察记录管理', '筛选观察记录，查看记录状态与生命周期。'],
    ['privacy', '隐私申请', '跟进账户删除申请与处理进度。'],
    ['audit', '操作记录', '查看谁在什么时候做了什么，需要时再展开技术详情。'],
  ] as const).map(([id, label, description]) => ({ id, label, description, group: '运营管理', keywords: 'operations review', section: id, module: id })),
  ...([
    ['life-cards', '生命牌文案', '按月份与日期编辑生命牌的说明和观察提示。'],
    ['life-card-views', '生命牌查看', '筛选生命牌的查看记录与使用情况。'],
  ] as const).map(([id, label, description]) => ({ id, label, description, group: '生命牌', keywords: 'life cards', section: id, module: id })),
  { id: 'settings', label: '系统设置', group: '系统管理', description: '管理维护公告、支持渠道与品牌图弹窗。', keywords: 'system settings support maintenance brand popup launch image', section: 'settings', module: 'settings' },
  { id: 'store-settings', label: '商城开放', group: '系统管理', description: '独立控制商城是否对外营业，并查看目录入口联动规则。', keywords: 'store commerce shop settings', section: 'store-settings', module: 'settings' },
  { id: 'status-machine', label: '模块状态机', group: '系统管理', description: '观察各模块运行状态、维护窗口与最近变化。', keywords: 'system module states runtime', section: 'status-machine', module: 'settings' },
  { id: 'employees', label: '员工与权限', group: '系统管理', description: '管理员工账号、角色与模块授权。', keywords: 'admin employees permissions', section: 'employees', superOnly: true },
];
const navigationItems = computed(() => adminDestinations
  .filter((item) => (!item.superOnly || isSuperAdmin.value) && (!item.module || canAccessModule(item.module)))
  .map((item) => ({ ...item, active: item.section === activeSection.value && (!item.contentSection || item.contentSection === activeContentSection.value) })));
const currentDestination = computed(() => adminDestinations.find((item) => item.section === activeSection.value && (!item.contentSection || item.contentSection === activeContentSection.value)));
async function selectAdminDestination(id: string) {
  const target = navigationItems.value.find((item) => item.id === id);
  if (!target) return;
  commandMenuOpen.value = false;
  if (target.section === 'content' && target.contentSection) {
    if (isJournalSection(target.contentSection) || target.contentSection === 'media') {
      await openJournalSubsection(target.contentSection as JournalSection | 'media');
      if (target.contentSection === 'media') void loadAudioLibrary(true);
    } else {
      activeSection.value = 'content';
      activeContentSection.value = target.contentSection;
      pageNavigationExpanded.value = true;
      journalNavigationExpanded.value = false;
      practiceNavigationExpanded.value = false;
      operationsNavigationExpanded.value = false;
      systemNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
    }
  } else if (target.section === 'practice') {
    activeSection.value = 'practice';
    activeContentSection.value = target.contentSection || 'practice';
    practiceNavigationExpanded.value = true;
    if (target.contentSection === 'daily-objects') openDailyObjectsEditor();
  } else if (target.section === 'members') openMembersNavigation();
  else if (isOperationsSection(target.section)) openOperationsSubsection(target.section);
  else if (isLifeCardSection(target.section)) openLifeCardSubsection(target.section);
  else if (isSystemSection(target.section)) openSystemSubsection(target.section);
  else activeSection.value = target.section;
  await nextTick();
  document.querySelector<HTMLElement>('.topbar h1')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
}
watch(token, (value) => { if (!value) commandMenuOpen.value = false; });
const processingPrivacyId = ref('');
const retryingPrivacyId = ref('');
const privacyControlsBusy = computed(() => Boolean(dashboardLoading.value || privacyRefreshing.value || privacyLoadingMore.value || processingPrivacyId.value || retryingPrivacyId.value));
const reencrypting = ref(false);
const reencryptCursor = ref<{ updatedAt: string; id: string } | null>(null);
const reencryptMessage = ref('');
const coverFile = ref<File | null>(null);
const voiceFile = ref<File | null>(null);
const originalMediaKeys = ref({ cover: '', background: '', voice: [] as string[] });
const mediaPreviewUrls = ref({ cover: '', voice: '' });
const mediaPreviewLoading = ref<'cover' | 'voice' | ''>('');
const mediaPreviewError = ref('');
const homeBackgroundFileInput = ref<HTMLInputElement | null>(null);
const homeBackgroundPreviewUrl = ref('');
const homeBackgroundPreviewLoading = ref(false);
const homeBackgroundError = ref('');
let homeBackgroundPreviewGeneration = 0;
type PendingImageCrop = {
  id: number;
  file: File;
  title: string;
  apply: (file: File) => void | Promise<void>;
};
let pendingImageCropId = 0;
const pendingImageCrop = ref<PendingImageCrop | null>(null);

function requestImageCrop(file: File, title: string, apply: PendingImageCrop['apply']) {
  pendingImageCrop.value = {
    id: ++pendingImageCropId,
    file,
    title,
    apply,
  };
}

function cancelImageCrop() {
  pendingImageCrop.value = null;
}

function confirmImageCrop(file: File) {
  const pending = pendingImageCrop.value;
  pendingImageCrop.value = null;
  if (pending) void pending.apply(file);
}
const orphanMedia = ref<MediaOrphan[]>([]);
const orphanMediaToken = ref('');
const orphanMediaHasMore = ref(false);
const orphanMediaScanned = ref(false);
const orphanMediaLoading = ref(false);
const orphanMediaDeleting = ref('');
const orphanMediaError = ref('');
const orphanMediaMessage = ref('');
const orphanMediaGraceHours = ref(24);
const audioLibrary = ref<MediaOrphan[]>([]);
const audioLibraryToken = ref('');
const audioLibraryHasMore = ref(false);
const audioLibraryScanned = ref(false);
const audioLibraryLoading = ref(false);
const audioLibraryPreviewLoading = ref('');
const audioLibraryPreviewUrls = ref<Record<string, string>>({});
const audioLibraryError = ref('');
const adminErrorDialog = ref('');
const adminErrorButton = ref<HTMLButtonElement | null>(null);
let adminErrorAfterClose: (() => void) | null = null;
function presentAdminError(message: string, afterClose?: () => void) {
  const text = String(message || '').trim();
  adminErrorDialog.value = text || '操作未完成，请稍后重试。';
  adminErrorAfterClose = afterClose ?? null;
}
function closeAdminError() {
  const afterClose = adminErrorAfterClose;
  adminErrorAfterClose = null;
  adminErrorDialog.value = '';
  if (afterClose) void nextTick(afterClose);
}
const adminErrorSources = [
  error, privacyPageError, dailyObjectsError, practiceContentError, minePageContentError,
  practiceCopyError, selectedObservationError, observationMoreError, discussionContributionMoreError,
  discussionContributionError, selectedDiscussionContributionError, discussionRestrictionMoreError,
  discussionRestrictionError, privacyMoreError, privacyActionError,
  auditMoreError, memberError, lifeCardsError, lifeCardViewsError, settingsError, employeeError,
  passwordRotationError, passwordError, mediaPreviewError, orphanMediaError, audioLibraryError,
];
for (const source of adminErrorSources) {
  watch(source, (message) => {
    if (!message) return;
    presentAdminError(message);
    source.value = '';
  }, { flush: 'sync' });
}
watch(adminErrorDialog, (message) => {
  if (message) void nextTick(() => adminErrorButton.value?.focus());
});
function readPendingCleanupKeys(): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('myriad_she_pending_media_cleanup') || '[]');
    return Array.isArray(value) ? value.filter((key): key is string => isManagedMediaKey(key, 'content/image/') || isManagedMediaKey(key, 'content/audio/')) : [];
  } catch {
    sessionStorage.removeItem('myriad_she_pending_media_cleanup');
    return [];
  }
}
function readPendingCleanupTokens(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('myriad_she_pending_media_cleanup_tokens') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, token]) => (isManagedMediaKey(key, 'content/image/') || isManagedMediaKey(key, 'content/audio/'))
      && typeof token === 'string' && token.length > 0 && token.length <= 4096));
  } catch {
    sessionStorage.removeItem('myriad_she_pending_media_cleanup_tokens');
    return {};
  }
}
const uploadedMediaKeys = ref<string[]>(readPendingCleanupKeys());
const mediaCleanupTokens = ref<Record<string, string>>(readPendingCleanupTokens());
type MediaCleanupCandidate = { objectKey: string; purpose: 'orphan' | 'temporary'; cleanupToken?: string };
const uploading = ref(false);
const loggedIn = computed(() => Boolean(token.value && sessionExpiresAt.value > Date.now()));
let sessionExpiryTimer: ReturnType<typeof setTimeout> | null = null;
let sessionGeneration = 0;
let dashboardRequestGeneration = 0;
let practiceContentRequestGeneration = 0;
let minePageContentRequestGeneration = 0;
let privacyPageContentRequestGeneration = 0;
let observationRequestGeneration = 0;
let privacyRequestGeneration = 0;
let auditRequestGeneration = 0;
let orphanMediaRequestGeneration = 0;
let audioLibraryRequestGeneration = 0;

function issueLabel(code?: string) {
  return issues.value.find((issue) => issue.code === code)?.label || code || '未关联';
}

const journalCurrentIssue = computed(() => issues.value.find((issue) => issue.id === editingIssueId.value) || null);
const journalCoverModule = computed(() => issueForm.value.draftContent.sections.find((module) => module.type === 'coverStory' || module.type === 'cover') || null);
const journalQuestionModule = computed(() => issueForm.value.draftContent.sections.find((module) => module.type === 'question') || null);
const journalCoverTitle = computed(() => String(journalCoverModule.value?.title || issueForm.value.theme || '').trim());
const journalCoverTitleRichText = computed(() => {
  const moduleTitle = String(journalCoverModule.value?.title || '').trim();
  return moduleTitle
    ? String(journalCoverModule.value?.titleRichText || '').trim()
    : String(issueForm.value.themeRichText || '').trim();
});
const journalQuestionTitle = computed(() => String(journalQuestionModule.value?.title || issueForm.value.question || '').trim());
const journalQuestionTitleRichText = computed(() => {
  const moduleTitle = String(journalQuestionModule.value?.title || '').trim();
  return moduleTitle
    ? String(journalQuestionModule.value?.titleRichText || '').trim()
    : String(issueForm.value.questionRichText || '').trim();
});
watch(
  () => [issueForm.value.code, issueForm.value.label, issueForm.value.month, issueForm.value.theme, issueForm.value.question] as const,
  (values, previous = values) => {
    (['code', 'label', 'month', 'theme', 'question'] as const).forEach((key, index) => {
      if (values[index] !== previous[index]) clearIssueFieldError(key);
    });
  },
  { flush: 'sync' },
);
const journalPastIssues = computed(() => [...issues.value]
  .filter((issue) => (issue.status === 'published' || issue.status === 'archived') && issue.id !== editingIssueId.value)
  .sort((left, right) => (right.publishedVersion || 0) - (left.publishedVersion || 0) || right.month.localeCompare(left.month)));
const journalSectionDescription = computed(() => {
  switch (activeContentSection.value) {
    case 'journal-home': return '刊期信息、封面主题、首页栏目顺序与整期手机预览。';
    case 'journal-story': return '分两个编辑页：「首页入口」改首页那张人物纪实卡片（图片、引言、图上说明），「详情页」改点进去之后的正文、图片说明与公众号链接。标题与导语来自「首页策展」的本期主题，保存后一起生效。';
    case 'journal-audio': return '本期最多可放 20 段微声音，每段可以是声音或视频；至少 1 段有可播放文件即可。每段详情页还可配置多个页面、网站或分享操作。';
    case 'journal-discussion': return '讨论页固定文案、示例经历与写作页预览；可在讨论页单独保存/发布，也可随整期发布。';
    case 'journal-archive': return '首页「策展档案」入口文案，以及已发布/已归档期次列表。';
    case 'journal-list': return '期号创建、线上状态、整期发布与发布记录。';
    default: return '';
  }
});
const journalModuleWorkspaceTitle = computed(() => {
  switch (activeContentSection.value) {
    case 'journal-story': return '人物故事栏目';
    case 'journal-audio': return '微声音栏目';
    case 'journal-archive': return '策展档案栏目';
    default: return '首页栏目编排';
  }
});
const issueModuleTypeLabels: Partial<Record<ManagedIssueModule['type'], string>> = {
  story: '人物图文',
  storyAction: '人物入口',
  image: '图片与说明',
  quote: '引言',
  audio: '微声音',
  archive: '策展档案',
};
const journalAddableModuleTypes = computed<ManagedIssueModule['type'][]>(() => {
  switch (activeContentSection.value) {
    case 'journal-home': return ['story', 'storyAction', 'image', 'quote', 'audio'];
    case 'journal-story': return ['story', 'storyAction'];
    case 'journal-audio': return ['audio'];
    case 'journal-archive': return ['archive'];
    default: return [];
  }
});
function journalIssueStatusLabel(status: ManagedIssue['status'] | string) {
  if (status === 'published') return '线上发布';
  if (status === 'archived') return '已归档';
  return '草稿';
}
function journalModuleSectionLabel(module: ManagedIssueModule) {
  if (module.type === 'story' || module.type === 'storyAction') return '人物故事';
  if (module.type === 'audio') return '微声音';
  if (module.type === 'archive') return '往期策展';
  return '首页策展';
}
function issueModuleTypeLabel(type: ManagedIssueModule['type']) {
  return issueModuleTypeLabels[type] || String(type);
}
function isIssueModuleVisibleInJournalSection(module: ManagedIssueModule) {
  if (activeContentSection.value === 'journal-story') return module.type === 'story' || module.type === 'storyAction';
  if (activeContentSection.value === 'journal-audio') return module.type === 'audio';
  if (activeContentSection.value === 'journal-archive') return module.type === 'archive';
  return true;
}
function ensureJournalModuleSelection() {
  if (!(journalModuleSections as readonly string[]).includes(activeContentSection.value)) return;
  const visible = issueForm.value.draftContent.sections.filter(isIssueModuleVisibleInJournalSection);
  if (visible.some((module) => module.id === selectedIssueModuleId.value)) return;
  selectedIssueModuleId.value = visible[0]?.id || '';
}
function selectJournalModule(module: ManagedIssueModule | null) {
  if (module) selectedIssueModuleId.value = module.id;
}
// 左侧首页预览只在编辑具体栏目时出现（本期讨论有自己的预览）。
const showJournalPreview = computed(() => activeContentSection.value !== 'journal-discussion' && Boolean(editingIssueId.value));
const journalIssueMetaModule = computed(
  () => issueForm.value.draftContent.sections.find((module) => module.type === 'issueMeta') || null,
);
const journalHomeIntroduction = computed({
  get: () => typeof journalIssueMetaModule.value?.introduction === 'string'
    ? journalIssueMetaModule.value.introduction : defaultHomeIntroduction,
  set: (value: string) => {
    let meta = journalIssueMetaModule.value;
    if (!meta) {
      const sections = issueForm.value.draftContent.sections;
      const ids = new Set(sections.map((module) => module.id));
      let id = 'issue-meta';
      for (let suffix = 2; ids.has(id); suffix += 1) id = `issue-meta-${suffix}`;
      meta = { id, type: 'issueMeta', order: 0, enabled: true, eyebrow: issueForm.value.label, month: issueForm.value.month };
      sections.unshift(meta);
      sections.forEach((module, order) => { module.order = order; });
    }
    meta.introduction = value;
  },
});
const journalIssueEdition = computed<string>({
  get: () => {
    const edition = journalIssueMetaModule.value?.edition;
    return edition === undefined ? issuePreviewTagline : previewIssueText(edition);
  },
  set: (value: string) => {
    let meta = journalIssueMetaModule.value;
    if (!meta) {
      const sections = issueForm.value.draftContent.sections;
      const ids = new Set(sections.map((module) => module.id));
      let id = 'issue-meta';
      for (let suffix = 2; ids.has(id); suffix += 1) id = `issue-meta-${suffix}`;
      meta = {
        id, type: 'issueMeta', order: 0, enabled: true,
        eyebrow: issueForm.value.label,
        month: issueForm.value.month,
        edition: value,
      };
      sections.unshift(meta);
      sections.forEach((module, order) => { module.order = order; });
    }
    meta.edition = value;
    clearIssueFieldError('edition');
  },
});
const journalPreviewIssueNumber = computed(
  () => (journalIssueMetaModule.value ? issuePreviewIssueNumber(journalIssueMetaModule.value) : ''),
);
const journalPreviewIssueEdition = computed(
  () => (journalIssueMetaModule.value ? issuePreviewIssueEdition(journalIssueMetaModule.value) : ''),
);
const journalPreviewIssueNumberRichText = computed(
  () => (journalIssueMetaModule.value ? issuePreviewRichText(journalIssueMetaModule.value, 'eyebrowRichText') : ''),
);
const journalPreviewIssueEditionRichText = computed(
  () => (journalIssueMetaModule.value ? issuePreviewRichText(journalIssueMetaModule.value, 'monthRichText') : ''),
);
const journalPreviewIssueEditionSuffix = computed(
  () => (journalIssueMetaModule.value ? issuePreviewIssueEditionSuffix(journalIssueMetaModule.value) : ''),
);
// 点预览里的区块：切到对应栏目，并把右侧那张卡片滚进视野、闪一下。
function focusIssueModule(key: string) {
  const module = issueForm.value.draftContent.sections.find((item) => item.id === key);
  if (!module) return;
  selectedIssueModuleId.value = module.id;
  nextTick(() => {
    const card = document.querySelector<HTMLElement>(`[data-issue-module="${module.id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('is-locating');
    window.setTimeout(() => card.classList.remove('is-locating'), 1400);
  });
}
// 在右侧点进某个栏目的任意字段时，左侧预览跟着高亮到同一块。
function focusModuleFromEditor(event: FocusEvent) {
  const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-issue-module]');
  const id = card?.dataset.issueModule;
  if (id && id !== selectedIssueModuleId.value) selectedIssueModuleId.value = id;
}
function goToJournalSection(section: JournalSection | 'media') {
  openJournalSubsection(section);
}
async function selectJournalIssue(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const issue = issues.value.find((item) => item.id === target.value);
  if (!issue) {
    target.value = editingIssueId.value;
    return;
  }
  if (issueDraftDirty.value && editingIssueId.value && editingIssueId.value !== issue.id && !window.confirm('当前期刊有未保存的修改。切换期刊会放弃这些修改，继续吗？')) {
    target.value = editingIssueId.value;
    return;
  }
  await editIssue(issue);
}
async function startNewIssue() {
  if (issueDraftDirty.value && editingIssueId.value && !window.confirm('当前期刊有未保存的修改。仍要开始新建期刊吗？')) return;
  await resetIssue();
  activeSection.value = 'content';
  activeContentSection.value = 'journal-list';
  journalNavigationExpanded.value = true;
  pageNavigationExpanded.value = false;
  lifeCardNavigationExpanded.value = false;
  issueSaveMessage.value = '';
}
function seedIssueModulesFromForm() {
  if (editingIssueId.value) return;
  const sections = issueForm.value.draftContent.sections;
  const meta = sections.find((module) => module.type === 'issueMeta');
  if (meta) {
    meta.eyebrow = issueForm.value.label;
    meta.eyebrowRichText = issueForm.value.labelRichText;
    meta.month = issueForm.value.month;
    meta.monthRichText = issueForm.value.monthRichText;
  }
  const cover = sections.find((module) => module.type === 'coverStory' || module.type === 'cover');
  if (cover && !String(cover.title || '').trim() && issueForm.value.theme.trim()) {
    cover.title = issueForm.value.theme.trim();
    cover.titleRichText = issueForm.value.themeRichText;
  }
  const question = sections.find((module) => module.type === 'question');
  if (question && !String(question.title || '').trim() && issueForm.value.question.trim()) {
    question.title = issueForm.value.question.trim();
    question.titleRichText = issueForm.value.questionRichText;
  }
}
watch(activeContentSection, () => {
  ensureJournalModuleSelection();
});

function displayDate(value?: string | null) {
  if (!value) return '无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function memberBirthday(member: Pick<Member, 'birthMonth' | 'birthDay'>) {
  const month = member.birthMonth;
  const day = member.birthDay;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !month || !day) return '未保存';
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function memberAddressRegion(address?: MemberAddress | null) {
  if (!address) return '未保存';
  return [address.provinceName, address.cityName].filter(Boolean).join(' ') || '未保存';
}

function memberAddressLabel(address?: MemberAddress | null) {
  if (!address) return '未保存';
  return [address.provinceName, address.cityName, address.countyName, address.detailInfo].filter(Boolean).join(' ') || '未保存';
}

function displayFileSize(value?: number) {
  if (!Number.isFinite(value) || value === undefined || value < 0) return '大小未知';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function conciseResponseMessage(message: string) {
  return message
    .replace(/[（(]\s*(?:请求编号|request\s*id)\s*[:：]\s*[^）)]+\s*[）)]/gi, '')
    .replace(/\s*(?:请求编号|request\s*id)\s*[:：]\s*[0-9a-z-]+\s*/gi, '')
    .trim();
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: string | string[] };
    const raw = Array.isArray(body.message) ? body.message.join('；') : body.message;
    if (typeof raw === 'string' && raw) {
      const concise = conciseResponseMessage(raw);
      if (concise) return concise;
    }
  } catch {
    // Keep the caller's stable fallback when the response is not JSON.
  }
  return conciseResponseMessage(fallback);
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = apiRequestTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') throw new Error('请求超时，请检查网络后重试。');
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

function isPracticeContent(raw: unknown): raw is PracticeContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  const boundedText = (candidate: unknown, maximum: number, minimum = 0) => typeof candidate === 'string' && candidate.length >= minimum && candidate.length <= maximum;
  const isCopyItem = (item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    && boundedText((item as Record<string, unknown>).richText, 2000, 1)
    && typeof (item as Record<string, unknown>).fontSize === 'number' && Number.isSafeInteger((item as Record<string, unknown>).fontSize) && Number((item as Record<string, unknown>).fontSize) >= 10 && Number((item as Record<string, unknown>).fontSize) <= 48
    && typeof (item as Record<string, unknown>).color === 'string' && /^#[0-9a-f]{6}$/i.test(String((item as Record<string, unknown>).color));
  const isRealityStage = (stage: unknown) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return false;
    const record = stage as Record<string, unknown>;
    return realityStageCopyFields.every((field) => isCopyItem(record[field.key]))
      && ['left', 'center', 'right'].includes(String(record.align))
      && ['compact', 'standard', 'roomy'].includes(String(record.spacing));
  };
  const isSeasonIntro = (copy: unknown) => {
    if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return false;
    const record = copy as Record<string, unknown>;
    return seasonIntroCopyGroups.flatMap((group) => group.fields).every((field) => isCopyItem(record[field.key]))
      && ['left', 'center', 'right'].includes(String(record.align))
      && ['compact', 'standard', 'roomy'].includes(String(record.spacing));
  };
  const observation = value.observationCopy && typeof value.observationCopy === 'object' && !Array.isArray(value.observationCopy)
    ? value.observationCopy as Record<string, unknown>
    : null;
  const realityStages = observation?.realityStages && typeof observation.realityStages === 'object' && !Array.isArray(observation.realityStages)
    ? observation.realityStages as Record<string, unknown>
    : null;
  if (!value.footerCopy || typeof value.footerCopy !== 'object' || Array.isArray(value.footerCopy)
    || !['brand', 'line1', 'label', 'line2'].every((key) => isCopyItem((value.footerCopy as Record<string, unknown>)[key]))) return false;
  if (typeof value.editVersion !== 'number' || !Number.isSafeInteger(value.editVersion) || value.editVersion < 1
    || !boundedText(value.title, 80, 1) || !boundedText(value.titleRichText, 2000, 1)
    || typeof value.titleFontSize !== 'number' || !Number.isSafeInteger(value.titleFontSize) || value.titleFontSize < 10 || value.titleFontSize > 48
    || typeof value.titleColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.titleColor)
    || !boundedText(value.intro, 240, 1)
    || !boundedText(value.introRichText, 2000, 1)
    || typeof value.introFontSize !== 'number' || !Number.isSafeInteger(value.introFontSize) || value.introFontSize < 10 || value.introFontSize > 48
    || typeof value.introColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.introColor)
    || !boundedText(value.metaLeftRichText, 2000, 1) || typeof value.metaLeftFontSize !== 'number' || !Number.isSafeInteger(value.metaLeftFontSize) || value.metaLeftFontSize < 10 || value.metaLeftFontSize > 48 || typeof value.metaLeftColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.metaLeftColor)
    || !boundedText(value.metaRightRichText, 2000, 1) || typeof value.metaRightFontSize !== 'number' || !Number.isSafeInteger(value.metaRightFontSize) || value.metaRightFontSize < 10 || value.metaRightFontSize > 48 || typeof value.metaRightColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.metaRightColor)
    || !observation
    || !observationCopyGroups.flatMap((group) => group.fields).every((field) => Object.hasOwn(observation, field.key))
    || !observationCopyGroups.flatMap((group) => group.fields).every((field) => isCopyItem(observation[field.key]))
    || !realityStages
    || !realityStageDefinitions.every((stage) => isRealityStage(realityStages[stage.key]))
    || !isSeasonIntro(observation.seasonIntro)
    || !isSeasonStagesCopy(observation.seasonStages)
    || !isObservationRecordCopy(observation.record)
    || !value.sharedPracticeCopy || typeof value.sharedPracticeCopy !== 'object' || Array.isArray(value.sharedPracticeCopy)
    || !sharedPracticeCopyGroups.flatMap((group) => group.fields).every((field) => Object.hasOwn(value.sharedPracticeCopy as object, field.key))
|| !Object.entries(value.sharedPracticeCopy as Record<string, unknown>).every(([key, item]) => {
  if (key === 'onlineParagraphs' || key === 'rules') return Array.isArray(item);
  const record = item as Record<string, unknown>;
  return item && typeof item === 'object' && !Array.isArray(item)
    && boundedText(record.richText, 2000, 1)
    && typeof record.fontSize === 'number' && Number.isSafeInteger(record.fontSize) && Number(record.fontSize) >= 10 && Number(record.fontSize) <= 48
    && typeof record.color === 'string' && /^#[0-9a-f]{6}$/i.test(String(record.color));
})
    || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 100) return false;
  const entries = value.entries as unknown[];
  if (!entries.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof (entry as Record<string, unknown>).key === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(String((entry as Record<string, unknown>).key))
    && boundedText((entry as Record<string, unknown>).title, 80, 1)
    && boundedText((entry as Record<string, unknown>).description, 240, 1)
    && boundedText((entry as Record<string, unknown>).contextRichText, 2000, 1)
    && typeof (entry as Record<string, unknown>).contextFontSize === 'number' && Number.isSafeInteger((entry as Record<string, unknown>).contextFontSize) && Number((entry as Record<string, unknown>).contextFontSize) >= 10 && Number((entry as Record<string, unknown>).contextFontSize) <= 48
    && typeof (entry as Record<string, unknown>).contextColor === 'string' && /^#[0-9a-f]{6}$/i.test(String((entry as Record<string, unknown>).contextColor))
    && boundedText((entry as Record<string, unknown>).titleRichText, 2000, 1)
    && typeof (entry as Record<string, unknown>).titleFontSize === 'number' && Number.isSafeInteger((entry as Record<string, unknown>).titleFontSize) && Number((entry as Record<string, unknown>).titleFontSize) >= 10 && Number((entry as Record<string, unknown>).titleFontSize) <= 48
    && typeof (entry as Record<string, unknown>).titleColor === 'string' && /^#[0-9a-f]{6}$/i.test(String((entry as Record<string, unknown>).titleColor))
    && boundedText((entry as Record<string, unknown>).descriptionRichText, 2000, 1)
    && typeof (entry as Record<string, unknown>).descriptionFontSize === 'number' && Number.isSafeInteger((entry as Record<string, unknown>).descriptionFontSize) && Number((entry as Record<string, unknown>).descriptionFontSize) >= 10 && Number((entry as Record<string, unknown>).descriptionFontSize) <= 48
    && typeof (entry as Record<string, unknown>).descriptionColor === 'string' && /^#[0-9a-f]{6}$/i.test(String((entry as Record<string, unknown>).descriptionColor))
    && typeof (entry as Record<string, unknown>).enabled === 'boolean')) return false;
  const byKey = new Map<unknown, Record<string, unknown>>();
  for (const entry of entries) {
    const record = entry as Record<string, unknown>;
    byKey.set(record.key, record);
  }
  return byKey.size === entries.length
    && byKey.has('observation');
}

function practiceContentFormatError(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '实践页面配置格式无效：API 返回内容不是对象。';
  const value = raw as Record<string, unknown>;
  const footerLabels: Record<string, string> = { brand: '页尾品牌', line1: '页尾主文案一', label: '页尾小标题', line2: '页尾主文案二' };
  if (!value.footerCopy || typeof value.footerCopy !== 'object' || Array.isArray(value.footerCopy)) {
    return '实践页面配置格式无效：API 尚未返回页尾文案，请确认 API 已更新并刷新页面。';
  }
  const footer = value.footerCopy as Record<string, unknown>;
  const missingFooter = Object.keys(footerLabels).filter((key) => !Object.hasOwn(footer, key));
  if (missingFooter.length) return `实践页面配置格式无效：页尾文案缺少“${footerLabels[missingFooter[0]]}”，请刷新后重试。`;
  const invalidFooter = Object.keys(footerLabels).find((key) => {
    const item = footer[key];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
    const copy = item as Record<string, unknown>;
    return typeof copy.richText !== 'string' || copy.richText.length < 1 || copy.richText.length > 2000
      || typeof copy.fontSize !== 'number' || !Number.isSafeInteger(copy.fontSize) || copy.fontSize < 10 || copy.fontSize > 48
      || typeof copy.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(copy.color);
  });
  if (invalidFooter) return `实践页面配置格式无效：页尾文案“${footerLabels[invalidFooter]}”的文字、字号或颜色无效，请刷新后重试。`;
  if (!value.sharedPracticeCopy || typeof value.sharedPracticeCopy !== 'object' || Array.isArray(value.sharedPracticeCopy)) {
    return '实践页面配置格式无效：API 尚未返回共同实践文案，请确认 API 已更新并刷新页面。';
  }
  const missing = sharedPracticeCopyGroups.flatMap((group) => group.fields).map((field) => field.key)
    .filter((key) => !Object.hasOwn(value.sharedPracticeCopy as object, key));
  if (missing.length) return `实践页面配置格式无效：共同实践文案缺少 ${missing.join('、')}，请刷新后重试。`;
  const observation = value.observationCopy && typeof value.observationCopy === 'object' && !Array.isArray(value.observationCopy)
    ? value.observationCopy as Record<string, unknown>
    : null;
  if (!observation) return '实践页面配置格式无效：API 尚未返回此刻观察文案，请确认 API 已更新并刷新页面。';
  const flatMissing = observationCopyGroups.flatMap((group) => group.fields).map((field) => field.key)
    .filter((key) => !Object.hasOwn(observation, key));
  if (flatMissing.length) return `实践页面配置格式无效：此刻观察文案缺少 ${flatMissing.join('、')}，请刷新后重试。`;
  if (!observation.realityStages || typeof observation.realityStages !== 'object' || Array.isArray(observation.realityStages)) {
    return '实践页面配置格式无效：API 尚未返回现实处境四页文案，请确认 API 已更新并刷新页面。';
  }
  const stages = observation.realityStages as Record<string, unknown>;
  for (const stage of realityStageDefinitions) {
    const stageCopy = stages[stage.key];
    if (!stageCopy || typeof stageCopy !== 'object' || Array.isArray(stageCopy)) {
      return `实践页面配置格式无效：现实处境“${stage.label}”阶段缺失，请刷新后重试。`;
    }
    const record = stageCopy as Record<string, unknown>;
    const fieldMissing = realityStageCopyFields.filter((field) => !Object.hasOwn(record, field.key));
    if (fieldMissing.length) return `实践页面配置格式无效：现实处境“${stage.label}”阶段缺少“${fieldMissing[0].label}”，请刷新后重试。`;
    const invalidField = realityStageCopyFields.find((field) => {
      const item = record[field.key] as Record<string, unknown> | undefined;
      return !item || typeof item.richText !== 'string' || !item.richText.length || item.richText.length > 2000
        || typeof item.fontSize !== 'number' || !Number.isSafeInteger(item.fontSize) || item.fontSize < 10 || item.fontSize > 48
        || typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color);
    });
    if (invalidField) return `实践页面配置格式无效：现实处境“${stage.label}”阶段的“${invalidField.label}”文字、字号或颜色无效，请刷新后重试。`;
    if (!['left', 'center', 'right'].includes(String(record.align))) return `实践页面配置格式无效：现实处境“${stage.label}”阶段的对齐方式无效，请刷新后重试。`;
    if (!['compact', 'standard', 'roomy'].includes(String(record.spacing))) return `实践页面配置格式无效：现实处境“${stage.label}”阶段的间距无效，请刷新后重试。`;
  }
  const seasonIntro = observation.seasonIntro;
  if (!seasonIntro || typeof seasonIntro !== 'object' || Array.isArray(seasonIntro)) {
    return '实践页面配置格式无效：API 尚未返回四时气韵入口页文案，请确认 API 已更新并刷新页面。';
  }
  const seasonRecord = seasonIntro as Record<string, unknown>;
  const seasonMissing = seasonIntroCopyGroups.flatMap((group) => group.fields).filter((field) => !Object.hasOwn(seasonRecord, field.key));
  if (seasonMissing.length) return `实践页面配置格式无效：四时气韵入口页缺少“${seasonMissing[0].label}”，请刷新后重试。`;
  const invalidSeasonField = seasonIntroCopyGroups.flatMap((group) => group.fields).find((field) => {
    const item = seasonRecord[field.key] as Record<string, unknown> | undefined;
    return !item || typeof item.richText !== 'string' || !item.richText.length || item.richText.length > 2000
      || typeof item.fontSize !== 'number' || !Number.isSafeInteger(item.fontSize) || item.fontSize < 10 || item.fontSize > 48
      || typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color);
  });
  if (invalidSeasonField) return `实践页面配置格式无效：四时气韵入口页的“${invalidSeasonField.label}”文字、字号或颜色无效，请刷新后重试。`;
  if (!['left', 'center', 'right'].includes(String(seasonRecord.align))) return '实践页面配置格式无效：四时气韵入口页的对齐方式无效，请刷新后重试。';
  if (!['compact', 'standard', 'roomy'].includes(String(seasonRecord.spacing))) return '实践页面配置格式无效：四时气韵入口页的间距无效，请刷新后重试。';
  const seasonStagesIssue = seasonStagesFormatIssue(observation.seasonStages);
  if (seasonStagesIssue) return `实践页面配置格式无效：${seasonStagesIssue}，请刷新后重试。`;
  const observationRecordIssue = observationRecordFormatIssue(observation.record);
  if (observationRecordIssue) return `实践页面配置格式无效：${observationRecordIssue}，请刷新后重试。`;
  const shared = value.sharedPracticeCopy as Record<string, unknown>;
  const invalid = sharedPracticeCopyGroups.flatMap((group) => group.fields).map((field) => field.key).find((key) => {
    const item = shared[key] as Record<string, unknown> | undefined;
    return !item || typeof item.richText !== 'string' || !item.richText.length || item.richText.length > 2000
      || typeof item.fontSize !== 'number' || !Number.isSafeInteger(item.fontSize) || item.fontSize < 10 || item.fontSize > 48
      || typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color);
  });
  if (invalid) return `实践页面配置格式无效：共同实践文案“${invalid}”的文字、字号或颜色无效，请在后台调整后重新读取。`;
  return '实践页面格式无效：实践目录字段无效，请刷新页面重新读取。';
}

function isPrivacyCopyItem(value: unknown, maximum = 2000): value is PrivacyCopyItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.richText === 'string' && item.richText.length > 0 && item.richText.length <= maximum
    && Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48
    && typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color);
}

function isPrivacyPageContent(raw: unknown): raw is AboutPageContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  return Number.isSafeInteger(value.editVersion) && Number(value.editVersion) >= 1
    && ['brandIntro', 'contentSources', 'contactInfo'].every((key) => typeof value[key] === 'string' && String(value[key]).trim().length > 0 && String(value[key]).length <= 6000);
}

function markPracticeContentDirty() {
  if (!practiceContentSaving.value) {
    practiceContentDirty.value = true;
    practiceContentMessage.value = '';
    practiceContentError.value = '';
  }
}

// 每个实践目录都有两页：首页里那一行入口，和点进去之后的详情页。
const practiceEntryTabs = ref<Record<string, 'home' | 'detail'>>({});
const newPracticeEntryTarget = ref<'observation' | 'shared-practice' | 'daily-goods'>('observation');
type PracticeEntryTarget = 'observation' | 'shared-practice' | 'daily-goods';

const practiceEntrySectionByKey: Record<string, PracticeSection> = {
  observation: 'observation',
  'shared-practice': 'shared-practice',
  'daily-goods': 'daily-objects',
};

function practiceEntryTab(section: string) {
  return practiceEntryTabs.value[section] ?? 'detail';
}

function setPracticeEntryTab(section: string, tab: 'home' | 'detail') {
  practiceEntryTabs.value = { ...practiceEntryTabs.value, [section]: tab };
}

// 目录条目可以新增 / 删除：条目归属哪一页由 target 决定，老数据没有 target 时用 key 兜底。
function practiceEntrySectionOf(entry: PracticeEntry): PracticeSection | null {
  return practiceEntrySectionByKey[entry.target || entry.key] ?? null;
}

function practiceEntriesFor(section: string) {
  return (practiceContent.value?.entries ?? []).filter((entry) => practiceEntrySectionOf(entry) === section);
}

function practiceEntryIndex(key: string) {
  const index = practiceContent.value?.entries.findIndex((entry) => entry.key === key) ?? -1;
  return index + 1;
}

function practiceEntrySectionLabel(entry: PracticeEntry) {
  const section = practiceEntrySectionOf(entry);
  if (section === 'observation') return '此刻观察';
  if (section === 'shared-practice') return '共同实践';
  if (section === 'daily-objects') return '日常之物';
  return '未指定';
}

function movePracticeEntry(entry: PracticeEntry, delta: number) {
  const content = practiceContent.value;
  if (!content || practiceContentSaving.value || practiceContentConflict.value) return;
  const index = content.entries.findIndex((item) => item.key === entry.key);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= content.entries.length) return;
  const entries = [...content.entries];
  [entries[index], entries[next]] = [entries[next], entries[index]];
  content.entries = entries;
  markPracticeContentDirty();
}

function openPracticeEntry(entry: PracticeEntry) {
  const section = practiceEntrySectionOf(entry);
  activePracticeKey.value = `entry:${entry.key}`;
  if (!section) { activeContentSection.value = 'practice-directory'; return; }
  activeContentSection.value = section;
  setPracticeEntryTab(section, 'home');
}

function addPracticeEntry(target: PracticeEntryTarget = newPracticeEntryTarget.value) {
  const content = practiceContent.value;
  if (!content || practiceContentSaving.value || practiceContentConflict.value) return;
  if (content.entries.length >= 100) {
    practiceContentError.value = '最多可以设置 100 个目录。';
    return;
  }
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const entry: PracticeEntry = {
    key: `directory-${suffix}`,
    target,
    enabled: true,
    contextRichText: '一个新的实践情境',
    contextFontSize: practiceEntryFixedStyle.context.fontSize,
    contextColor: practiceEntryFixedStyle.context.color,
    title: '新的实践目录',
    titleRichText: '新的实践目录',
    titleFontSize: practiceEntryFixedStyle.title.fontSize,
    titleColor: practiceEntryFixedStyle.title.color,
    description: '一句话说明它是什么',
    descriptionRichText: '一句话说明它是什么',
    descriptionFontSize: practiceEntryFixedStyle.description.fontSize,
    descriptionColor: practiceEntryFixedStyle.description.color,
  };
  content.entries = [...content.entries, entry];
  activePracticeKey.value = `entry:${entry.key}`;
  markPracticeContentDirty();
}

function removePracticeEntry(entry: PracticeEntry) {
  const content = practiceContent.value;
  if (!content || practiceContentSaving.value || practiceContentConflict.value) return;
  if (content.entries.length <= 1) {
    practiceContentError.value = '至少要保留一个目录。';
    return;
  }
  const name = practiceEntryText(entry.titleRichText) || '这个目录';
  if (!window.confirm(`删除「${name}」？保存后小程序实践页将不再显示它。`)) return;
  content.entries = content.entries.filter((item) => item.key !== entry.key);
  markPracticeContentDirty();
}

// 实践页预览的当前高亮项：meta / title / intro / directory，或 entry:<key>。
const activePracticeKey = ref('');

function practiceFieldElement(key: string) {
  return document.querySelector<HTMLElement>(`[data-practice-field="${key}"]`);
}

// 点预览里的区块：切到对应的编辑子页、滚到那个字段并闪一下。
function pickPracticeKey(key: string) {
  activePracticeKey.value = key;
  activeSection.value = 'practice';
  if (key.startsWith('entry:')) {
    const entryKey = key.slice('entry:'.length);
    const entry = practiceContent.value?.entries.find((item) => item.key === entryKey) ?? null;
    const section = (entry ? practiceEntrySectionOf(entry) : practiceEntrySectionByKey[entryKey]) ?? null;
    if (section) {
      activeContentSection.value = section;
      setPracticeEntryTab(section, 'home');
    }
  } else {
    activeContentSection.value = 'practice';
  }
  nextTick(() => {
    const target = practiceFieldElement(key);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-locating');
    window.setTimeout(() => target.classList.remove('is-locating'), 1400);
  });
}

// 右侧点进某个字段时，左侧预览同步高亮到同一块。
function focusPracticeField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-practice-field]');
  const key = holder?.dataset.practiceField;
  if (key && key !== activePracticeKey.value) activePracticeKey.value = key;
}

// 日常之物预览的当前高亮项：未开放页字段，或商品页 brand / header / note / product:<id>。
const activeDailyKey = ref('');

const dailyLandingPreviewKeys = new Set(['landing', 'her-days', 'article-title', 'article-image', 'article-action', 'everyday-explore']);

function dailyPreviewModeForKey(key: string): 'landing' | 'shop' {
  return dailyLandingPreviewKeys.has(key) ? 'landing' : 'shop';
}

function dailyFieldTarget(key: string) {
  const holder = document.querySelector<HTMLElement>('[data-daily-field="' + key + '"]');
  if (!holder) return null;
  return holder.querySelector<HTMLElement>('input, textarea') || holder;
}

function pickDailyKey(key: string) {
  activeDailyKey.value = key;
  dailyObjectsPreviewMode.value = dailyPreviewModeForKey(key);
  nextTick(() => {
    const target = dailyFieldTarget(key);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const card = target.closest<HTMLElement>('.daily-product-editor') || target;
    card.classList.add('is-locating');
    window.setTimeout(() => card.classList.remove('is-locating'), 1400);
  });
}

function focusDailyField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-daily-field]');
  const key = holder?.dataset.dailyField;
  if (key && key !== activeDailyKey.value) {
    activeDailyKey.value = key;
    dailyObjectsPreviewMode.value = dailyPreviewModeForKey(key);
  }
}

// 关于页预览：三段正文与左侧输入框互相对应。
const activeAboutKey = ref('');

function pickAboutKey(key: string) {
  activeAboutKey.value = key;
  nextTick(() => {
    const target = document.querySelector<HTMLElement>('[data-page-field="' + key + '"]');
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-locating');
    window.setTimeout(() => target.classList.remove('is-locating'), 1400);
  });
}

function focusAboutField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-page-field]');
  const key = holder?.dataset.pageField;
  if (key && key !== activeAboutKey.value) activeAboutKey.value = key;
}

// 我的页面预览：五个页签各对应一个区块。
const activeMineKey = ref('');

function pickMineKey(key: string) {
  activeMineKey.value = key;
  minePageEditorTab.value = key as MinePageEditorTab;
  nextTick(() => {
    const target = document.querySelector<HTMLElement>('[data-mine-field="' + key + '"]');
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-locating');
    window.setTimeout(() => target.classList.remove('is-locating'), 1400);
  });
}

function focusMineField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mine-field]');
  const key = holder?.dataset.mineField;
  if (key && key !== activeMineKey.value) activeMineKey.value = key;
}

// 共同实践：选定期刊时，把该期的讨论段落与线下活动条目追加到预览末尾。
const plainCopy = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const sharedPracticeExtraSections = computed(() => {
  if (!practiceCopyIssueCode.value) return [];
  const sections: Array<{ key: string; title: string; blocks: Array<{ key: string; label: string; richText: string; fontSize: number; color: string }> }> = [];
  if (practiceCopyParagraphs.value.length) {
    sections.push({
      key: 'issue-paragraphs',
      title: '线上 · 讨论说明段落（' + practiceCopyIssueCode.value + '）',
      blocks: practiceCopyParagraphs.value.map((paragraph, index) => ({
        key: 'paragraph:' + index,
        label: '段落 ' + (index + 1),
        richText: paragraph.richText,
        fontSize: paragraph.fontSize,
        color: paragraph.color,
      })),
    });
  }
  if (practiceCopyOfflinePublished.value && practiceCopyRules.value.length) {
    sections.push({
      key: 'issue-rules',
      title: '线下活动说明条目（' + practiceCopyIssueCode.value + '）',
      blocks: practiceCopyRules.value.map((rule, index) => ({
        key: 'rule:' + index,
        label: '第 ' + (index + 1) + ' 项 · ' + (plainCopy(rule.title.richText) || '未命名'),
        richText: rule.copy.richText,
        fontSize: rule.copy.fontSize,
        color: rule.copy.color,
      })),
    });
  }
  return sections;
});

// 此刻观察预览：每个文案字段对应一个区块。
const activeObservationKey = ref('');
const activeRealityStage = ref<RealityStageKey>('situation');
const observationDetailView = ref<'flat' | 'reality' | 'season' | 'season-stages' | 'record'>('flat');
const activeSeasonStage = ref<SeasonStageKey>('card');
const activeSeasonNowTab = ref<SeasonNowTab>('recent');
const observationDetailCopy = computed<Record<string, ObservationCopyItem>>(() => {
  const observation = practiceContent.value?.observationCopy;
  if (!observation) return {};
  return Object.fromEntries(observationCopyGroups.flatMap((group) => group.fields)
    .map((field) => [field.key, observation[field.key]]));
});
const observationRealityCopy = computed(() => practiceContent.value?.observationCopy.realityStages || null);
const observationSeasonCopy = computed(() => practiceContent.value?.observationCopy.seasonIntro || null);
const observationSeasonStagesCopy = computed(() => practiceContent.value?.observationCopy.seasonStages || null);
const observationRecordCopy = computed(() => practiceContent.value?.observationCopy.record || null);

function revealObservationTarget(key: string, focus = false) {
  activeObservationKey.value = key;
  const realityPrefix = 'reality:';
  const seasonPrefix = 'season:';
  const seasonStagePrefix = 'season-stage:';
  const recordPrefix = 'record:';
  if (key.startsWith(realityPrefix)) {
    const [, stage, field] = key.split(':');
    if (realityStageDefinitions.some((item) => item.key === stage)) {
      activeRealityStage.value = stage as RealityStageKey;
    }
    if (realityStageCopyFields.some((item) => item.key === field)) observationDetailView.value = 'reality';
  } else if (key.startsWith(seasonStagePrefix)) {
    const [, stage, view] = key.split(':');
    if (seasonStageDefinitions.some((item) => item.key === stage)) {
      activeSeasonStage.value = stage as SeasonStageKey;
    }
    if (view === 'recent' || view === 'change') activeSeasonNowTab.value = view;
    observationDetailView.value = 'season-stages';
  } else if (key.startsWith(seasonPrefix)) {
    observationDetailView.value = 'season';
  } else if (key.startsWith(recordPrefix)) {
    observationDetailView.value = 'record';
  } else if (key) {
    observationDetailView.value = 'flat';
  }
  nextTick(() => {
    const target = document.querySelector<HTMLElement>(
      key.startsWith(realityPrefix)
        ? `[data-reality-field="${key}"]`
        : key.startsWith(seasonStagePrefix)
          ? `[data-season-stage-field="${key}"]`
          : key.startsWith(seasonPrefix)
            ? `[data-season-field="${key}"]`
            : key.startsWith(recordPrefix)
              ? `[data-record-field="${key}"]`
              : `[data-copy-field="${key}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-locating');
    if (focus) target.querySelector<HTMLElement>('.rich-text-canvas')?.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove('is-locating'), 1400);
  });
}

function pickObservationKey(key: string) {
  activeObservationKey.value = key;
  revealObservationTarget(key);
}

function focusObservationField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-copy-field], [data-reality-field], [data-season-field], [data-season-stage-field], [data-record-field]');
  const key = holder?.dataset.seasonStageField || holder?.dataset.realityField || holder?.dataset.seasonField
    || holder?.dataset.recordField || holder?.dataset.copyField;
  if (!key) return;
  if (holder?.dataset.seasonStageField) {
    const [, stage, view] = key.split(':');
    if (seasonStageDefinitions.some((item) => item.key === stage)) activeSeasonStage.value = stage as SeasonStageKey;
    if (view === 'recent' || view === 'change') activeSeasonNowTab.value = view;
    observationDetailView.value = 'season-stages';
  } else if (holder?.dataset.realityField) {
    const stage = key.split(':')[1];
    if (realityStageDefinitions.some((item) => item.key === stage)) activeRealityStage.value = stage as RealityStageKey;
    observationDetailView.value = 'reality';
  } else if (holder?.dataset.seasonField) {
    observationDetailView.value = 'season';
  } else if (holder?.dataset.recordField) {
    observationDetailView.value = 'record';
  } else {
    observationDetailView.value = 'flat';
  }
  if (key !== activeObservationKey.value) activeObservationKey.value = key;
}

// —— 微声音二级页（列表 / 详情）预览 ——
const audioPreviewView = ref<'list' | 'detail'>('list');
const audioPreviewTrackId = ref('');
const activeAudioKey = ref('');

const journalAudioModule = computed(() => issueForm.value.draftContent.sections.find((module) => module.type === 'audio') || null);
const journalAudioTracks = computed(() => journalAudioModule.value?.tracks || []);
const audioPreviewTracks = journalAudioTracks;

const audioPreviewMediaUrls = computed<Record<string, string>>(() => {
  const module = journalAudioModule.value;
  const urls: Record<string, string> = {};
  if (!module) return urls;
  for (const track of journalAudioTracks.value) {
    const url = issueModulePreviewUrls.value[issueAudioTrackPreviewKey(module.id, track.id)];
    if (url) urls[track.id] = url;
  }
  return urls;
});

const audioPreviewTrack = computed(() => journalAudioTracks.value.find((track) => track.id === audioPreviewTrackId.value) || journalAudioTracks.value[0] || null);

// 详情页区块 → 右侧字段名（声音/视频块对应「引言说明」）
const audioDetailFieldMap: Record<string, string> = {
  media: 'subtitle',
  heading: 'detailTitle',
  description: 'description',
  quote: 'quote',
  transcript: 'transcript',
  actions: 'actions',
};

function setAudioPreviewView(view: 'list' | 'detail') {
  audioPreviewView.value = view;
  if (!audioPreviewTrackId.value) audioPreviewTrackId.value = journalAudioTracks.value[0]?.id || '';
  activeAudioKey.value = view === 'detail' ? 'detail:media' : 'hero';
}

function locateInAudioPanel(selector: string) {
  nextTick(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-locating');
    window.setTimeout(() => target.classList.remove('is-locating'), 1400);
  });
}

function pickAudioKey(key: string) {
  activeAudioKey.value = key;
  if (key.startsWith('track:')) {
    const trackId = key.slice('track:'.length);
    audioPreviewTrackId.value = trackId;
    audioPreviewView.value = 'detail';
    locateInAudioPanel(`[data-audio-track="${trackId}"]`);
    return;
  }
  if (key.startsWith('detail:')) {
    const field = audioDetailFieldMap[key.slice('detail:'.length)] || 'detailTitle';
    const trackId = audioPreviewTrackId.value || journalAudioTracks.value[0]?.id || '';
    if (trackId) locateInAudioPanel(`[data-audio-field="track:${trackId}:${field}"]`);
    return;
  }
  locateInAudioPanel('[data-audio-field="hero:title"]');
}

function openAudioTrackDetail(trackId: string) {
  audioPreviewTrackId.value = trackId;
  audioPreviewView.value = 'detail';
  activeAudioKey.value = 'detail:media';
}

function focusAudioField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-audio-field]');
  const value = holder?.dataset.audioField;
  if (!value) return;
  if (value.startsWith('hero:')) {
    activeAudioKey.value = 'hero';
    return;
  }
  const match = /^track:([^:]+):(.+)$/.exec(value);
  if (!match) return;
  const trackId = match[1];
  const field = match[2];
  const detailKey = Object.keys(audioDetailFieldMap).find((key) => audioDetailFieldMap[key] === field);
  if (detailKey) {
    audioPreviewTrackId.value = trackId;
    audioPreviewView.value = 'detail';
    activeAudioKey.value = `detail:${detailKey}`;
    return;
  }
  activeAudioKey.value = `track:${trackId}`;
}

// —— 人物故事：首页入口 / 详情页两个编辑页 ——
const storyEditorTab = ref<'home' | 'detail'>('home');
const activeStoryDetailKey = ref('');

const storyDetailModule = computed(() => issueForm.value.draftContent.sections.find((module) => module.type === 'story') || null);
const storyDetailIntro = computed(() => String(journalCoverModule.value?.body || issueForm.value.theme || '').trim());
const storyDetailIntroRichText = computed(() => String(journalCoverModule.value?.bodyRichText || issueForm.value.themeRichText || '').trim());
const storyDetailImageUrl = computed(() => {
  const module = storyDetailModule.value;
  return module ? issueModulePreviewUrls.value[module.id] || '' : '';
});

function setStoryEditorTab(tab: 'home' | 'detail') {
  storyEditorTab.value = tab;
  activeStoryDetailKey.value = tab === 'detail' ? 'from-home' : '';
}

function pickStoryDetailKey(key: string) {
  activeStoryDetailKey.value = key;
  nextTick(() => {
    const target = document.querySelector<HTMLElement>(`[data-story-field="${key}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('is-locating');
    window.setTimeout(() => target.classList.remove('is-locating'), 1400);
  });
}

function focusStoryDetailField(event: FocusEvent) {
  const holder = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-story-field]');
  const key = holder?.dataset.storyField;
  if (key && key !== activeStoryDetailKey.value) activeStoryDetailKey.value = key;
}

// 详情页标题与导语来自「首页策展」的本期主题，点预览里的标题直接跳过去改
function editStoryHeadlineFromHome() {
  if (journalCoverModule.value) selectJournalModule(journalCoverModule.value);
  goToJournalSection('journal-home');
}

function isDailyGoodsPracticeEntry(entry: PracticeEntry) {
  return (entry.target || entry.key) === 'daily-goods';
}

function togglePracticeEntryEnabled(entry: PracticeEntry | null) {
  if (!entry || !practiceContent.value || practiceContentSaving.value || practiceContentConflict.value) return;
  if (isDailyGoodsPracticeEntry(entry) && !isSuperAdmin.value) {
    practiceContentError.value = '仅超级管理员可以修改日常之物入口。';
    return;
  }
  entry.enabled = !entry.enabled;
  markPracticeContentDirty();
}

function isMinePageContent(raw: unknown): raw is MinePageContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  const boundedText = (candidate: unknown) => typeof candidate === 'string' && candidate.length >= 1 && candidate.length <= 6000;
  return typeof value.editVersion === 'number' && Number.isSafeInteger(value.editVersion) && value.editVersion >= 1
    && boundedText(value.title) && boundedText(value.intro)
    && boundedText(value.observationHeading)
    && boundedText(value.emptyTitle) && boundedText(value.emptyIntro)
    && boundedText(value.startButton)
    && boundedText(value.discussionHeading) && boundedText(value.discussionCount)
    && boundedText(value.discussionEmptyAction) && boundedText(value.discussionIntro)
    && boundedText(value.practiceHeading) && boundedText(value.practiceCount)
    && boundedText(value.practiceEmptyTitle) && boundedText(value.practiceIntro)
    && boundedText(value.privacyHeading) && boundedText(value.privacyAction);
}

function hasRichTextContent(value: string) {
  const container = document.createElement('div');
  container.innerHTML = value;
  return Boolean(container.textContent?.replace(/\u00a0/g, ' ').trim());
}

function markMinePageContentDirty() {
  if (!minePageContentSaving.value) {
    minePageContentDirty.value = true;
    minePageContentMessage.value = '';
    minePageContentError.value = '';
  }
}

function moveMinePageEditorTab(event: KeyboardEvent) {
  const tabs: MinePageEditorTab[] = ['intro', 'observations', 'discussions', 'practice', 'privacy'];
  const currentIndex = tabs.indexOf(minePageEditorTab.value);
  const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (currentIndex + direction + tabs.length) % tabs.length;
  if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  minePageEditorTab.value = tabs[nextIndex];
  void nextTick(() => document.getElementById(`mine-tab-${tabs[nextIndex]}`)?.focus());
}

function observationQuery(offset = 0) {
  return new URLSearchParams({
    limit: String(observationPageSize),
    offset: String(offset),
    ...(observationStatus.value ? { status: observationStatus.value } : {}),
    ...(observationMethod.value ? { method: observationMethod.value } : {}),
    ...(observationIssueCode.value ? { issueCode: observationIssueCode.value } : {}),
    ...(observationStaleOnly.value ? { stale: 'true' } : {}),
  });
}

function toggleObservationStale() {
  if (observationStaleOnly.value) {
    observationStatusBeforeStale.value = observationStatus.value;
    observationStatus.value = 'draft';
  } else {
    observationStatus.value = observationStatusBeforeStale.value ?? '';
    observationStatusBeforeStale.value = null;
  }
  void refreshObservations();
}

function auditQuery(offset = 0) {
  return new URLSearchParams({
    limit: '50',
    offset: String(offset),
    ...(auditActorType.value ? { actorType: auditActorType.value } : {}),
    ...(auditAction.value.trim() ? { action: auditAction.value.trim() } : {}),
  });
}

function privacyQuery(offset = 0) {
  return new URLSearchParams({
    limit: String(privacyPageSize),
    offset: String(offset),
    ...(privacyStatus.value ? { status: privacyStatus.value } : {}),
  });
}

async function refreshPrivacy(announce = false) {
  if (processingPrivacyId.value || retryingPrivacyId.value) return;
  const session = sessionGeneration;
  const generation = ++privacyRequestGeneration;
  privacyLoadingMore.value = false;
  privacyMoreError.value = '';
  privacyRefreshing.value = true;
  privacyActionMessage.value = '';
  privacyActionError.value = '';
  try {
    await loadPrivacy(generation, session);
    if (announce && generation === privacyRequestGeneration && session === sessionGeneration && loggedIn.value) privacyActionMessage.value = '申请列表已刷新，状态已重新核对。';
  } catch (caught) {
    if (generation !== privacyRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    privacyMoreError.value = caught instanceof Error ? caught.message : '无法读取删除申请';
    if (announce) privacyActionError.value = '刷新失败，当前仍无法确认申请状态。';
  } finally {
    if (generation === privacyRequestGeneration && session === sessionGeneration) privacyRefreshing.value = false;
  }
}

async function loadPrivacy(generation = privacyRequestGeneration, expectedSession = sessionGeneration) {
  const response = await apiFetch(`${apiBase}/admin/privacy-requests?${privacyQuery(0)}`, { headers: { Authorization: `Bearer ${token.value}` } });
  if (handleAdminUnauthorized(response, expectedSession)) return;
  if (!response.ok) throw new Error(await responseMessage(response, '无法读取删除申请'));
  const result = await response.json();
  if (!isPrivacyRequestPage(result)) throw new Error('删除申请列表格式无效');
  if (generation !== privacyRequestGeneration || expectedSession !== sessionGeneration || !loggedIn.value) return;
  privacyRequests.value = result.items;
  privacyTotal.value = result.total;
  privacyLifecycle.value = result.summary;
  privacyOffset.value = result.offset + result.items.length;
  privacyHasMore.value = privacyOffset.value < result.total;
  privacyMoreError.value = '';
}

function toggleAuditDetail(id: string) {
  auditExpandedId.value = auditExpandedId.value === id ? '' : id;
}

function resetAuditFilters() {
  auditActorType.value = '';
  auditAction.value = '';
  void refreshAudit();
}

async function refreshAudit() {
  const session = sessionGeneration;
  const generation = ++auditRequestGeneration;
  auditLoadingMore.value = false;
  auditMoreError.value = '';
  auditExpandedId.value = '';
  try {
    await loadAudit(generation, session);
  } catch (caught) {
    if (generation !== auditRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    auditMoreError.value = caught instanceof Error ? caught.message : '无法读取操作记录';
  }
}

async function loadAudit(generation = auditRequestGeneration, expectedSession = sessionGeneration) {
  const response = await apiFetch(`${apiBase}/admin/audit-logs?${auditQuery(0)}`, { headers: { Authorization: `Bearer ${token.value}` } });
  if (handleAdminUnauthorized(response, expectedSession)) return;
  if (!response.ok) throw new Error(await responseMessage(response, '无法读取操作记录'));
  const result = await response.json();
  if (!isAuditPage(result)) throw new Error('操作记录列表格式无效');
  if (generation !== auditRequestGeneration || expectedSession !== sessionGeneration || !loggedIn.value) return;
  auditLogs.value = result.rows;
  auditTotal.value = result.total;
  auditOffset.value = result.offset + result.rows.length;
  auditHasMore.value = auditOffset.value < result.total;
  auditMoreError.value = '';
}

async function loadObservationLifecycle(generation = observationRequestGeneration, expectedSession = sessionGeneration) {
  const response = await apiFetch(`${apiBase}/admin/observations/lifecycle`, { headers: { Authorization: `Bearer ${token.value}` } });
  if (handleAdminUnauthorized(response, expectedSession)) return;
  if (!response.ok) throw new Error(await responseMessage(response, '无法读取观察生命周期'));
  const result = await response.json();
  if (!isObservationLifecycle(result)) throw new Error('观察生命周期格式无效');
  if (generation === observationRequestGeneration && expectedSession === sessionGeneration && loggedIn.value) observationLifecycle.value = result;
}

function selectFile(event: Event, kind: 'cover' | 'voice') {
  if (uploading.value) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;
  input.value = '';
  if (!file) return;
  if (kind === 'cover') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      mediaPreviewError.value = '封面仅支持 JPG、PNG 或 WebP。';
      return;
    }
    requestImageCrop(file, '编辑期刊封面', (croppedFile) => {
      coverFile.value = croppedFile;
      mediaPreviewUrls.value = { ...mediaPreviewUrls.value, cover: '' };
    });
  }
  else {
    voiceFile.value = file;
    mediaPreviewUrls.value = { ...mediaPreviewUrls.value, voice: '' };
  }
  mediaPreviewError.value = '';
}

function persistCleanupKeys() {
  const activeKeys = new Set(uploadedMediaKeys.value);
  for (const objectKey of Object.keys(mediaCleanupTokens.value)) {
    if (!activeKeys.has(objectKey)) delete mediaCleanupTokens.value[objectKey];
  }
  sessionStorage.setItem('myriad_she_pending_media_cleanup', JSON.stringify(uploadedMediaKeys.value));
  sessionStorage.setItem('myriad_she_pending_media_cleanup_tokens', JSON.stringify(mediaCleanupTokens.value));
}

function scheduleSessionExpiry(expiresIn: number) {
  const boundedSeconds = Number.isFinite(expiresIn) && expiresIn > 0
    ? Math.min(Math.max(1, Math.floor(expiresIn)), maxAdminSessionSeconds)
    : 0;
  if (!boundedSeconds) {
    logout('后台登录有效期无效，请重新登录。');
    return;
  }
  sessionExpiresAt.value = Date.now() + boundedSeconds * 1000;
  localStorage.setItem('myriad_she_admin_expires_at', String(sessionExpiresAt.value));
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = setTimeout(() => logout('后台登录已过期，请重新登录。'), boundedSeconds * 1000);
}

function assertSession(generation: number) {
  if (!loggedIn.value || generation !== sessionGeneration) throw new Error('后台登录状态已变化，请重新加载后重试。');
}

function adminHeaders(json = false) {
  return { Authorization: `Bearer ${token.value}`, ...(json ? { 'content-type': 'application/json' } : {}) };
}

async function refreshMembers(append = false) {
  memberLoading.value = true;
  memberError.value = '';
  try {
    const offset = append ? memberOffset.value : 0;
    const query = new URLSearchParams({ limit: String(memberPageSize), offset: String(offset) });
    if (memberQuery.value.trim()) query.set('q', memberQuery.value.trim());
    if (memberFrom.value) query.set('from', memberFrom.value);
    if (memberTo.value) query.set('to', memberTo.value);
    const response = await apiFetch(`${apiBase}/admin/users?${query}`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取会员列表'));
    const page = await response.json();
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total)) throw new Error('会员列表格式无效');
    members.value = append ? [...members.value, ...page.items] : page.items;
    memberTotal.value = page.total;
    memberOffset.value = offset + page.items.length;
  } catch (caught) { memberError.value = caught instanceof Error ? caught.message : '无法读取会员列表'; }
  finally { memberLoading.value = false; }
}

async function showMember(id: string) {
  memberError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/users/${encodeURIComponent(id)}`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取会员详情'));
    memberDetail.value = await response.json();
  } catch (caught) { memberError.value = caught instanceof Error ? caught.message : '无法读取会员详情'; }
}

async function toggleMemberStatus(member: Member) {
  memberError.value = '';
  try {
    const status = member.status === 'active' ? 'suspended' : 'active';
    const actionLabel = status === 'suspended' ? '停用账号' : '恢复账号';
    const reason = window.prompt(`请填写${actionLabel}的原因（必填，最多 500 字）`);
    if (reason === null) return;
    if (!reason.trim()) { memberError.value = '操作原因不能为空。'; return; }
    if (status === 'suspended' && !window.confirm(`停用账号会立即阻止该会员登录和使用全部功能。\n\n如果只需停用一起谈谈权限，请使用「一起谈谈权限」。确认停用账号？`)) return;
    const response = await apiFetch(`${apiBase}/admin/users/${encodeURIComponent(member.id)}/status`, { method: 'PATCH', headers: adminHeaders(true), body: JSON.stringify({ status, reason: reason.trim() }) });
    if (!response.ok) throw new Error(await responseMessage(response, '会员状态更新失败'));
    await refreshMembers();
  } catch (caught) { memberError.value = caught instanceof Error ? caught.message : '会员状态更新失败'; }
}

function settingValue(result: unknown, key: string) {
  if (!result || typeof result !== 'object') return undefined;
  const row = (result as Record<string, unknown>)[key];
  return row && typeof row === 'object' ? (row as { value?: unknown }).value : undefined;
}

function normalizedSystemSettings(result: unknown): SystemSettings {
  const duration = settingValue(result, 'brand_popup_duration');
  const frequency = settingValue(result, 'brand_popup_frequency');
  const image = settingValue(result, 'brand_popup_image');
  const alt = settingValue(result, 'brand_popup_alt');
  const notice = settingValue(result, 'maintenance_notice');
  const support = settingValue(result, 'support_contact');
  const appeal = settingValue(result, 'discussion_appeal_contact');
  return {
    store_enabled: settingValue(result, 'store_enabled') === true,
    maintenance_notice: typeof notice === 'string' ? notice : '',
    support_contact: typeof support === 'string' ? support : '',
    discussion_appeal_contact: typeof appeal === 'string' ? appeal : '',
    brand_popup_enabled: settingValue(result, 'brand_popup_enabled') === true,
    brand_popup_image: typeof image === 'string' ? image.trim() : '',
    brand_popup_duration: typeof duration === 'number' && Number.isInteger(duration) && duration >= 1 && duration <= 15 ? duration : 3,
    brand_popup_frequency: frequency === 'daily' || frequency === 'once' ? frequency : 'every_launch',
    brand_popup_alt: typeof alt === 'string' ? alt : '',
    brand_popup_closable: settingValue(result, 'brand_popup_closable') !== false,
  };
}

async function loadSystemSettings() {
  settingsLoading.value = true;
  settingsError.value = '';
  try {
    const session = sessionGeneration;
    const response = await apiFetch(`${apiBase}/admin/system-settings`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取系统设置'));
    const next = normalizedSystemSettings(await response.json());
    systemSettings.value = next;
    systemSettingsOriginal.value = { ...next };
    brandPopupPreviewUrl.value = next.brand_popup_image ? await dailyObjectMediaPreviewUrl(next.brand_popup_image, session) : '';
  } catch (caught) { settingsError.value = caught instanceof Error ? caught.message : '无法读取系统设置'; }
  finally { settingsLoading.value = false; }
}

async function saveSystemSettings() {
  settingsSaving.value = true;
  settingsMessage.value = '';
  settingsError.value = '';
  try {
    const saveLabel = activeSection.value === 'store-settings' ? '商城设置' : '系统设置';
    if (!window.confirm(`确认保存${saveLabel}？变更会立即生效并记录到审计日志。`)) return;
    const session = sessionGeneration;
    const response = await apiFetch(`${apiBase}/admin/system-settings`, { method: 'PATCH', headers: adminHeaders(true), body: JSON.stringify(systemSettings.value) });
    if (!response.ok) throw new Error(await responseMessage(response, '系统设置保存失败'));
    const saved = await response.json();
    if (typeof settingValue(saved, 'store_enabled') !== 'boolean') throw new Error('服务器未返回商城开放状态');
    const normalized = normalizedSystemSettings(saved);
    systemSettings.value = normalized;
    systemSettingsOriginal.value = { ...normalized };
    brandPopupPreviewUrl.value = normalized.brand_popup_image ? await dailyObjectMediaPreviewUrl(normalized.brand_popup_image, session) : '';
    settingsMessage.value = activeSection.value === 'store-settings'
      ? '商城设置已保存。商城仍需与「实践目录 → 日常之物」入口同时开启，用户才能看到商品。'
      : '系统设置已保存。品牌图将在下次打开默认首页或进入「日常之物」时按频次出现。';
  } catch (caught) { settingsError.value = caught instanceof Error ? caught.message : '系统设置保存失败'; }
  finally { settingsSaving.value = false; }
}
async function resetSystemSettings() {
  const session = sessionGeneration;
  systemSettings.value = { ...systemSettingsOriginal.value };
  settingsError.value = '';
  settingsMessage.value = '';
  brandPopupPreviewUrl.value = systemSettings.value.brand_popup_image
    ? await dailyObjectMediaPreviewUrl(systemSettings.value.brand_popup_image, session)
    : '';
}

async function loadEmployees() {
  employeeLoading.value = true;
  employeeError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/employees`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取员工列表'));
    employees.value = await response.json();
  } catch (caught) { employeeError.value = caught instanceof Error ? caught.message : '无法读取员工列表'; }
  finally { employeeLoading.value = false; }
}

function openCreateEmployee() {
  employeeForm.value = { username: '', displayName: '', password: '', role: 'content_editor', wecomUserId: '' };
  employeeFormError.value = '';
  employeeError.value = '';
  employeeMessage.value = '';
  createEmployeeOpen.value = true;
}

async function createEmployee() {
  employeeSaving.value = true;
  employeeFormError.value = '';
  employeeError.value = '';
  employeeMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/employees`, { method: 'POST', headers: adminHeaders(true), body: JSON.stringify(employeeForm.value) });
    if (!response.ok) throw new Error(await responseMessage(response, '员工账号创建失败'));
    employeeForm.value = { username: '', displayName: '', password: '', role: 'content_editor', wecomUserId: '' };
    employeeMessage.value = '员工账号已创建。';
    createEmployeeOpen.value = false;
    await loadEmployees();
  } catch (caught) { employeeFormError.value = caught instanceof Error ? caught.message : '员工账号创建失败'; }
  finally { employeeSaving.value = false; }
}

function revokeEmployeeAvatarPreview() {
  if (employeeAvatarPreview.value.startsWith('blob:')) URL.revokeObjectURL(employeeAvatarPreview.value);
  employeeAvatarPreview.value = '';
}

function isEmployeeModuleChecked(id: AdminModuleId) {
  return effectiveModulesForRole(employeeEditForm.value.role, employeeEditForm.value.modulePermissions).includes(id);
}

function toggleEmployeeModule(id: AdminModuleId, checked: boolean) {
  const selected = new Set(effectiveModulesForRole(employeeEditForm.value.role, employeeEditForm.value.modulePermissions));
  if (checked) selected.add(id); else selected.delete(id);
  employeeEditForm.value.modulePermissions = adminModules.map((module) => module.id).filter((moduleId) => selected.has(moduleId));
}

function restoreEmployeeRoleModules() {
  employeeEditForm.value.modulePermissions = null;
}

const moduleGrantOpen = ref(false);
const moduleGrantEmployee = ref<Employee | null>(null);
const moduleGrantOverride = ref<AdminModuleId[] | null>(null);
const moduleGrantSaving = ref(false);
const moduleGrantError = ref('');
const moduleGrantModules = computed(() => effectiveModulesForRole(moduleGrantEmployee.value?.role ?? '', moduleGrantOverride.value));
const moduleGrantCount = computed(() => moduleGrantModules.value.length);
const moduleGrantRoleDefaults = computed(() => effectiveModulesForRole(moduleGrantEmployee.value?.role ?? '', null));

function openModuleGrant(employee: Employee) {
  moduleGrantEmployee.value = employee;
  moduleGrantOverride.value = employee.modulePermissions ? effectiveModulesForRole(employee.role, employee.modulePermissions) : null;
  moduleGrantError.value = '';
  employeeMessage.value = '';
  employeeError.value = '';
  moduleGrantOpen.value = true;
}

function closeModuleGrant() {
  if (moduleGrantSaving.value) return;
  moduleGrantOpen.value = false;
  moduleGrantEmployee.value = null;
  moduleGrantOverride.value = null;
  moduleGrantError.value = '';
}

function isModuleGrantChecked(id: AdminModuleId) {
  return moduleGrantModules.value.includes(id);
}

function toggleModuleGrant(id: AdminModuleId, checked: boolean) {
  const selected = new Set(moduleGrantModules.value);
  if (checked) selected.add(id); else selected.delete(id);
  moduleGrantOverride.value = adminModules.map((module) => module.id).filter((moduleId) => selected.has(moduleId));
}

function restoreModuleGrantDefaults() {
  moduleGrantOverride.value = null;
}

async function saveModuleGrant() {
  const employee = moduleGrantEmployee.value;
  if (!employee) return;
  moduleGrantSaving.value = true;
  moduleGrantError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/employees/${encodeURIComponent(employee.id)}`, {
      method: 'PATCH',
      headers: adminHeaders(true),
      body: JSON.stringify({ modulePermissions: moduleGrantOverride.value }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '模块授权保存失败'));
    employeeMessage.value = `已更新 ${employee.displayName} 的模块授权。`;
    moduleGrantOpen.value = false;
    moduleGrantEmployee.value = null;
    moduleGrantOverride.value = null;
    await loadEmployees();
  } catch (caught) {
    moduleGrantError.value = caught instanceof Error ? caught.message : '模块授权保存失败';
  } finally {
    moduleGrantSaving.value = false;
  }
}

function employeeModuleSummary(employee: Employee) {
  const override = employee.modulePermissions ?? null;
  const count = effectiveModulesForRole(employee.role, override).length;
  return override ? `自定义 ${count} 个模块` : `角色默认 ${count} 个模块`;
}

const employeeModuleCount = computed(() => effectiveModulesForRole(employeeEditForm.value.role, employeeEditForm.value.modulePermissions).length);

function openEmployeeEditor(employee: Employee) {
  revokeEmployeeAvatarPreview();
  editingEmployee.value = employee;
  employeeEditForm.value = {
    displayName: employee.displayName,
    wecomUserId: employee.wecomUserId || '',
    role: employee.role,
    status: employee.status,
    modulePermissions: employee.modulePermissions ? effectiveModulesForRole(employee.role, employee.modulePermissions) : null,
  };
  employeeAvatarFile.value = null;
  employeeAvatarPreview.value = employee.avatarUrl || '';
  employeeAvatarRemove.value = false;
  employeeAvatarError.value = '';
  employeeEditError.value = '';
  employeeMessage.value = '';
  employeeEditorOpen.value = true;
}

function onEmployeeRoleChange() {
  // 角色切换后回到新角色的默认授权（超级管理员为全部模块），之后仍可单独勾选。
  employeeEditForm.value.modulePermissions = null;
}

function closeEmployeeEditor() {
  if (employeeEditSaving.value) return;
  revokeEmployeeAvatarPreview();
  employeeAvatarFile.value = null;
  employeeAvatarRemove.value = false;
  employeeEditorOpen.value = false;
  editingEmployee.value = null;
}

function selectEmployeeAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  employeeAvatarError.value = '';
  try {
    const avatar = validateAvatarFile(file);
    revokeEmployeeAvatarPreview();
    employeeAvatarFile.value = avatar;
    employeeAvatarPreview.value = URL.createObjectURL(avatar);
    employeeAvatarRemove.value = false;
  } catch (caught) {
    employeeAvatarError.value = caught instanceof Error ? caught.message : '头像文件无效';
  }
}

function resetEmployeeAvatar() {
  revokeEmployeeAvatarPreview();
  employeeAvatarFile.value = null;
  employeeAvatarRemove.value = true;
  employeeAvatarError.value = '';
}

async function uploadEmployeeAvatar(employee: Employee, file: File) {
  const form = new FormData();
  form.append('avatar', file);
  const response = await apiFetch(`${apiBase}/admin/employees/${encodeURIComponent(employee.id)}/avatar`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  }, mediaUploadTimeoutMs);
  if (!response.ok) throw new Error(await responseMessage(response, '员工头像上传失败'));
}

async function saveEmployeeEdit() {
  const employee = editingEmployee.value;
  if (!employee) return;
  const displayName = employeeEditForm.value.displayName.trim();
  if (!displayName) {
    employeeEditError.value = '请输入员工姓名';
    return;
  }
  employeeEditSaving.value = true;
  employeeEditError.value = '';
  try {
    if (employeeAvatarFile.value) {
      await uploadEmployeeAvatar(employee, employeeAvatarFile.value);
    } else if (employeeAvatarRemove.value && employee.avatarUrl) {
      const response = await apiFetch(`${apiBase}/admin/employees/${encodeURIComponent(employee.id)}/avatar`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      if (!response.ok) throw new Error(await responseMessage(response, '恢复默认头像失败'));
    }
    const payload: Record<string, unknown> = {
      displayName,
      wecomUserId: employeeEditForm.value.wecomUserId.trim() || null,
      role: employeeEditForm.value.role,
      status: employeeEditForm.value.status,
      modulePermissions: employeeEditForm.value.modulePermissions,
    };
    const response = await apiFetch(`${apiBase}/admin/employees/${encodeURIComponent(employee.id)}`, {
      method: 'PATCH',
      headers: adminHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '员工资料更新失败'));
    employeeMessage.value = '员工资料已更新。';
    revokeEmployeeAvatarPreview();
    employeeEditorOpen.value = false;
    editingEmployee.value = null;
    await loadEmployees();
  } catch (caught) {
    employeeEditError.value = caught instanceof Error ? caught.message : '员工资料更新失败';
  } finally {
    employeeEditSaving.value = false;
  }
}

async function updateEmployee(employee: Employee, changes: { role?: Employee['role']; status?: Employee['status']; password?: string }) {
  employeeBusyId.value = employee.id;
  employeeError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/employees/${encodeURIComponent(employee.id)}`, { method: 'PATCH', headers: adminHeaders(true), body: JSON.stringify(changes) });
    if (!response.ok) throw new Error(await responseMessage(response, '员工设置更新失败'));
    employeeMessage.value = '员工权限已更新。';
    if (employeeEditorOpen.value) employeeEditError.value = '';
    await loadEmployees();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '员工设置更新失败';
    if (employeeEditorOpen.value) employeeEditError.value = message;
    else employeeError.value = message;
  }
  finally { if (employeeBusyId.value === employee.id) employeeBusyId.value = ''; }
}

async function resetEmployeePassword(employee: Employee) {
  const password = window.prompt(`为 ${employee.username} 设置新密码（至少 12 位）。员工下次登录时必须修改。`);
  if (password === null) return;
  if (password.length < 12) {
    if (employeeEditorOpen.value) employeeEditError.value = '新密码至少需要 12 位。';
    else employeeError.value = '新密码至少需要 12 位。';
    return;
  }
  await updateEmployee(employee, { password });
  if (employeeEditorOpen.value && editingEmployee.value?.id === employee.id) {
    editingEmployee.value = { ...editingEmployee.value, passwordChangeRequired: true };
  }
}

function resetEditingEmployeePassword() {
  if (editingEmployee.value) void resetEmployeePassword(editingEmployee.value);
}

async function applyAdminLogin(result: { accessToken: string; expiresIn: number }) {
  token.value = result.accessToken;
  localStorage.setItem('myriad_she_admin_token', token.value);
  sessionGeneration += 1;
  scheduleSessionExpiry(Number(result.expiresIn));
  await loadAdminProfile();
  if (adminPasswordChangeRequired.value) {
    stopNotificationPolling();
    passwordRotationError.value = '';
  } else {
    startNotificationPolling();
    await enterDashboardByPermissions();
  }
}

async function login() {
  loading.value = true;
  error.value = '';
  try {
    const response = await apiFetch(`${apiBase}/auth/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    });
    if (response.status === 429) throw new Error(await responseMessage(response, '登录尝试过多，请稍后重试。'));
    if (!response.ok) throw new Error(await responseMessage(response, '登录失败，请检查管理后台账号配置'));
    const result = await response.json().catch(() => null);
    if (!isAdminLoginResult(result)) {
      throw new Error('管理后台登录服务返回无效数据');
    }
    password.value = '';
    await applyAdminLogin(result);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '登录失败';
  } finally {
    loading.value = false;
  }
}

function loadWecomSdk() {
  if (window.WwLogin) return Promise.resolve();
  if (wecomSdkPromise) return wecomSdkPromise;
  const pending = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-wecom-login-sdk]');
    if (existing) {
      if (window.WwLogin) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => {
        if (window.WwLogin) resolve();
        else reject(new Error('企业微信扫码组件加载失败'));
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('企业微信扫码组件加载失败，请检查网络。')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://wwcdn.weixin.qq.com/node/wework/wwopen/js/wwLogin-1.2.7.js';
    script.async = true;
    script.dataset.wecomLoginSdk = 'true';
    script.addEventListener('load', () => {
      if (window.WwLogin) resolve();
      else reject(new Error('企业微信扫码组件加载失败'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('企业微信扫码组件加载失败，请检查网络。')), { once: true });
    document.head.appendChild(script);
  });
  wecomSdkPromise = pending.catch((caught) => {
    wecomSdkPromise = null;
    throw caught;
  });
  return wecomSdkPromise;
}

function closeWecomLogin() {
  wecomQrInstance?.destroyed?.();
  wecomQrInstance = null;
  const container = document.getElementById('wecom-qr');
  if (container) container.innerHTML = '';
  wecomQrVisible.value = false;
  wecomLoading.value = false;
  wecomError.value = '';
}

async function openWecomLogin() {
  error.value = '';
  wecomError.value = '';
  wecomQrVisible.value = true;
  wecomLoading.value = true;
  await nextTick();
  try {
    const response = await apiFetch(`${apiBase}/auth/admin/wecom/config`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await responseMessage(response, '企业微信扫码登录暂不可用'));
    const config = await response.json().catch(() => null) as WecomLoginConfig | null;
    if (!config || config.enabled !== true || !config.appid || !config.agentid
      || !config.redirectUri || !config.state) {
      throw new Error('企业微信扫码登录暂未启用，请使用账号密码登录。');
    }
    await loadWecomSdk();
    const container = document.getElementById('wecom-qr');
    const WwLogin = window.WwLogin;
    if (!container || !WwLogin) throw new Error('企业微信扫码组件初始化失败');
    wecomQrInstance?.destroyed?.();
    container.innerHTML = '';
    wecomQrInstance = new WwLogin({
      id: 'wecom-qr',
      appid: config.appid,
      agentid: config.agentid,
      redirect_uri: encodeURIComponent(config.redirectUri),
      state: config.state,
      is_mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    });
  } catch (caught) {
    wecomError.value = caught instanceof Error ? caught.message : '企业微信扫码登录暂时不可用';
    wecomQrVisible.value = false;
    wecomQrInstance?.destroyed?.();
    wecomQrInstance = null;
  } finally {
    wecomLoading.value = false;
  }
}

async function completeWecomLogin(code: string, state: string) {
  if (loading.value || loggedIn.value) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await apiFetch(`${apiBase}/auth/admin/wecom/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, state }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '企业微信扫码登录失败，请重新扫码。'));
    const result = await response.json().catch(() => null);
    if (!isAdminLoginResult(result)) {
      throw new Error('企业微信登录服务返回无效数据');
    }
    await applyAdminLogin(result);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '企业微信扫码登录失败';
  } finally {
    loading.value = false;
  }
}

function consumeWecomCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return;
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  if (!state) {
    error.value = '扫码登录参数不完整，请重新扫码。';
    return;
  }
  if (!loggedIn.value) void completeWecomLogin(code, state);
}

async function changeRequiredPassword() {
  passwordRotationError.value = '';
  if (passwordRotation.value.newPassword.length < 12) { passwordRotationError.value = '新密码至少需要 12 位。'; return; }
  if (passwordRotation.value.newPassword !== passwordRotation.value.confirmPassword) { passwordRotationError.value = '两次输入的新密码不一致。'; return; }
  passwordRotationSaving.value = true;
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/admin/me/password`, {
      method: 'PATCH', headers: adminHeaders(true),
      body: JSON.stringify({ currentPassword: passwordRotation.value.currentPassword, newPassword: passwordRotation.value.newPassword }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '密码修改失败，请检查当前密码后重试。'));
    const result = await response.json().catch(() => null);
    if (!result || typeof result.accessToken !== 'string' || !Number.isFinite(result.expiresIn)) throw new Error('密码已修改，但登录状态无法确认；请重新登录。');
    token.value = result.accessToken;
    localStorage.setItem('myriad_she_admin_token', token.value);
    scheduleSessionExpiry(Number(result.expiresIn));
    await loadAdminProfile();
    passwordRotation.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    await enterDashboardByPermissions();
  } catch (caught) {
    passwordRotationError.value = caught instanceof Error ? caught.message : '密码修改失败。';
  } finally { passwordRotationSaving.value = false; }
}

async function loadDashboard() {
  const session = sessionGeneration;
  const dashboardGeneration = ++dashboardRequestGeneration;
  const practiceGeneration = ++practiceContentRequestGeneration;
  const minePageGeneration = ++minePageContentRequestGeneration;
  const privacyPageGeneration = ++privacyPageContentRequestGeneration;
  const observationGeneration = ++observationRequestGeneration;
  const privacyGeneration = ++privacyRequestGeneration;
  const auditGeneration = ++auditRequestGeneration;
 observationLoadingMore.value = false;
  observationMoreError.value = '';
  privacyLoadingMore.value = false;
  privacyRefreshing.value = false;
  privacyMoreError.value = '';
  auditLoadingMore.value = false;
  auditMoreError.value = '';
  dashboardLoading.value = true;
  overviewSyncError.value = '';
  const authHeaders = { Authorization: `Bearer ${token.value}` };
  const canJournal = canAccessModule('journal');
  const canPractice = canAccessModule('practice');
  const canPages = canAccessModule('pages');
  const canObservations = canAccessModule('observations');
  const canPrivacy = canAccessModule('privacy');
  const canAudit = canAccessModule('audit');
 const optionalFetch = (enabled: boolean, url: string) => (enabled ? apiFetch(url, { headers: authHeaders }) : Promise.resolve(null));
  try {
    const [homeResponse, issuesResponse, issueSummaryResponse, practiceResponse, minePageResponse, aboutResponse, observationsResponse, lifecycleResponse, privacyResponse, auditResponse] = await Promise.all([
      optionalFetch(canJournal, `${apiBase}/content/home`),
      optionalFetch(canJournal, `${apiBase}/content/issues`),
      optionalFetch(canJournal, `${apiBase}/content/issues/summary`),
      optionalFetch(canPractice, `${apiBase}/content/practice/manage`),
      optionalFetch(canPages, `${apiBase}/content/mine/manage`),
      optionalFetch(canPages, `${apiBase}/content/about/manage`),
      optionalFetch(canObservations, `${apiBase}/admin/observations?${observationQuery(0)}`),
      optionalFetch(canObservations, `${apiBase}/admin/observations/lifecycle`),
      optionalFetch(canPrivacy, `${apiBase}/admin/privacy-requests?${privacyQuery(0)}`),
      optionalFetch(canAudit, `${apiBase}/admin/audit-logs?${auditQuery(0)}`),
   ]);
    const responses = [homeResponse, issuesResponse, issueSummaryResponse, practiceResponse, minePageResponse, aboutResponse, observationsResponse, lifecycleResponse, privacyResponse, auditResponse].filter((response): response is Response => response !== null);
    if (responses.some((response) => response.status === 401)) {
      if (session === sessionGeneration && loggedIn.value) logout('后台登录已过期，请重新登录。');
      return;
    }
    assertSession(session);
    const failedResponse = responses.find((response) => !response.ok);
    if (failedResponse) throw new Error(await responseMessage(failedResponse, '无法读取 API 数据'));
    if (canJournal && homeResponse && issuesResponse && issueSummaryResponse) {
      const [homeResult, issuesResult, issueSummaryResult] = await Promise.all([homeResponse.json(), issuesResponse.json(), issueSummaryResponse.json()]);
      if (!isPublicHome(homeResult)) throw new Error('首页内容格式无效');
      if (!isManagedIssueList(issuesResult)) throw new Error('期刊列表格式无效');
      if (!isIssueDashboardConsistent(issueSummaryResult, issuesResult, homeResult)) throw new Error('期刊列表、生命周期摘要与首页发布内容不一致，请刷新后核实');
      if (dashboardGeneration === dashboardRequestGeneration) {
        home.value = homeResult;
        issues.value = issuesResult;
        issueLifecycle.value = issueSummaryResult;
        void ensureJournalIssueSelection();
      }
    }
    if (canPractice && practiceResponse) {
      const practiceResult = normalizePracticeContentResponse(await practiceResponse.json());
      if (!isPracticeContent(practiceResult)) throw new Error(practiceContentFormatError(practiceResult));
      if (practiceGeneration === practiceContentRequestGeneration && !practiceContentSaving.value && !practiceContentDirty.value) {
        practiceContent.value = practiceResult;
        practiceContentDirty.value = false;
      }
      await loadDailyObjectsContent();
    }
    if (canPages && minePageResponse) {
      const minePageResult = await minePageResponse.json();
      if (!isMinePageContent(minePageResult)) throw new Error('我的页面配置格式无效');
      if (minePageGeneration === minePageContentRequestGeneration && !minePageContentSaving.value && !minePageContentDirty.value) {
        minePageContent.value = minePageResult;
        minePageContentDirty.value = false;
      }
    }
    if (canPages && aboutResponse) {
      const privacyPageResult = await aboutResponse.json();
      if (!isPrivacyPageContent(privacyPageResult)) throw new Error('关于 MYRIAD SHE 内容格式无效');
      if (privacyPageGeneration === privacyPageContentRequestGeneration && !privacyPageSaving.value && !privacyPageDirty.value) {
        privacyPageContent.value = privacyPageResult;
        privacyPagePublishedVersion.value = Number((privacyPageResult as AboutPageContent & { publishedVersion?: number }).publishedVersion) || 1;
        privacyPagePublishedAt.value = String((privacyPageResult as AboutPageContent & { publishedAt?: string }).publishedAt ?? '');
        privacyPageDirty.value = false;
      }
    }
    if (canObservations && observationsResponse && lifecycleResponse) {
      const [observationResult, lifecycleResult] = await Promise.all([observationsResponse.json(), lifecycleResponse.json()]);
      if (!isManagedObservationPage(observationResult)) throw new Error('观察记录列表格式无效');
      if (!isObservationLifecycle(lifecycleResult)) throw new Error('观察生命周期格式无效');
      if (observationGeneration === observationRequestGeneration) {
        observations.value = observationResult.items;
        observationTotal.value = observationResult.total;
        observationOffset.value = observationResult.offset + observationResult.items.length;
        observationHasMore.value = observationOffset.value < observationResult.total;
        observationMoreError.value = '';
        observationLifecycle.value = lifecycleResult;
      }
    }
    if (canPrivacy && privacyResponse) {
      const privacyResult = await privacyResponse.json();
      if (!isPrivacyRequestPage(privacyResult)) throw new Error('删除申请列表格式无效');
      if (privacyGeneration === privacyRequestGeneration) {
        privacyRequests.value = privacyResult.items;
        privacyTotal.value = privacyResult.total;
        privacyLifecycle.value = privacyResult.summary;
        privacyOffset.value = privacyResult.offset + privacyResult.items.length;
        privacyHasMore.value = privacyOffset.value < privacyResult.total;
        privacyMoreError.value = '';
      }
    }
    if (canAudit && auditResponse) {
      const auditResult = await auditResponse.json();
      if (!isAuditPage(auditResult)) throw new Error('操作记录列表格式无效');
      if (auditGeneration === auditRequestGeneration) {
        auditLogs.value = auditResult.rows;
        auditTotal.value = auditResult.total;
        auditOffset.value = auditResult.offset + auditResult.rows.length;
        auditHasMore.value = auditOffset.value < auditResult.total;
        auditMoreError.value = '';
      }
    }
    overviewUpdatedAt.value = new Date().toISOString();
    if (activeSection.value === 'content' && activeContentSection.value === 'about-history' && privacyPageRevisions.value.length === 0) {
      await loadPrivacyRevisions('about-page');
    }
    if (activeSection.value === 'overview') {
      await Promise.all([
        canAccessModule('contributions') ? refreshDiscussionContributions() : Promise.resolve(),
        canAccessModule('members') ? refreshMembers() : Promise.resolve(),
      ]);
    }
  } catch (caught) {
    if (dashboardGeneration === dashboardRequestGeneration && session === sessionGeneration && loggedIn.value) {
      overviewSyncError.value = caught instanceof Error ? caught.message : '无法读取 API 数据';
      error.value = caught instanceof Error ? caught.message : '无法读取 API 数据';
    }
    throw caught;
  } finally {
    if (dashboardGeneration === dashboardRequestGeneration && session === sessionGeneration) dashboardLoading.value = false;
  }
}

async function refreshCurrentPage() {
  if (currentPageRefreshing.value || dashboardLoading.value) return;
  const location = { section: activeSection.value, contentSection: activeContentSection.value };
  const dailyHome = location.section === 'practice' && location.contentSection === 'daily-objects'
    && practiceEntryTab('daily-objects') === 'home';
  if (isSettingsSection(location.section)
    && JSON.stringify(systemSettings.value) !== JSON.stringify(systemSettingsOriginal.value)
    && !window.confirm('刷新会放弃尚未保存的系统设置修改，是否继续？')) return;
  if (location.section === 'practice' && canAccessModule('practice')
    && (['practice', 'practice-directory', 'observation', 'shared-practice'].includes(location.contentSection) || dailyHome)
    && practiceContentDirty.value
    && !window.confirm('刷新会放弃尚未保存的实践文案修改，是否继续？')) return;
  if (location.contentSection === 'daily-objects' && location.section === 'practice' && !dailyHome && dailyObjectsDirty.value
    && !window.confirm('刷新会放弃尚未保存的日常之物修改，是否继续？')) return;
  if (location.section === 'life-cards' && lifeCardDraft.value
    && JSON.stringify(lifeCardDraft.value) !== JSON.stringify(lifeCards.value.find((card) => card.month === lifeCardDraft.value?.month && card.day === lifeCardDraft.value?.day))
    && !window.confirm('刷新会放弃尚未保存的生命牌修改，是否继续？')) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  currentPageRefreshing.value = true;
  try {
    if (location.section === 'practice' && location.contentSection === 'daily-objects' && !dailyHome) {
      await loadDailyObjectsContent(true);
    } else if (location.section === 'practice') {
      await reloadPracticeContent(true);
    } else if (location.section === 'overview') {
      await loadDashboard();
    } else if (location.section === 'content') {
      switch (location.contentSection) {
        case 'mine': await reloadMinePageContent(); break;
        case 'media': await Promise.all([loadOrphanMedia(true), loadAudioLibrary(true)]); break;
        case 'daily-objects': await loadDailyObjectsContent(); break;
        case 'privacy-page': await reloadPrivacyPageContent(); break;
        case 'about-history': await loadPrivacyRevisions('about-page'); break;
        case 'privacy-policy': await privacyDocumentManager.value?.reload(); break;
        case 'user-agreement': await agreementDocumentManager.value?.reload(); break;
        case 'legal-history': await legalHistoryPanel.value?.reload(); break;
        default: await loadDashboard(); break;
      }
    } else if (location.section === 'observations') {
      await refreshObservations();
    } else if (location.section === 'privacy') {
      await refreshPrivacy(true);
    } else if (location.section === 'audit') {
      await refreshAudit();
    } else if (location.section === 'members') {
      await refreshMembers();
    } else if (isSettingsSection(location.section)) {
      await loadSystemSettings();
    } else if (location.section === 'employees') {
      await loadEmployees();
    } else if (location.section === 'contributions') {
      await refreshDiscussionContributions();
    } else if (location.section === 'discussion-restrictions') {
      await refreshDiscussionRestrictions();
    } else if (location.section === 'discussion-reports') {
      await refreshDiscussionReports();
    } else if (location.section === 'life-cards') {
      await loadLifeCards();
    } else if (location.section === 'life-card-views') {
      await loadLifeCardViews();
    }
  } catch (caught) {
    if (loggedIn.value) error.value = caught instanceof Error ? caught.message : '当前页面刷新失败。';
  } finally {
    currentPageRefreshing.value = false;
    await nextTick();
    if (loggedIn.value && activeSection.value === location.section && activeContentSection.value === location.contentSection) {
      window.scrollTo(scrollX, scrollY);
    }
  }
}

// 后端返回的 PracticeContent 多了两处「派生字段」：顶层 draft 标记，以及
// sharedPracticeCopy 里由 onlineCopy / rule1..4 归并出来的 onlineParagraphs、rules。
// DTO 开了 whitelist，把这些原样发回去会 400（property ... should not exist），
// 所以保存前先剥掉，保存后再把本地这两段合并回内存，界面不会闪。
function practiceContentPayload(content: PracticeContent) {
  const { draft: _draft, sharedPracticeCopy, ...rest } = content;
  const entries = rest.entries.map((entry) => {
    const context = practiceEntryText(entry.contextRichText);
    const title = practiceEntryText(entry.titleRichText);
    const description = practiceEntryText(entry.descriptionRichText);
    return {
      ...entry,
      contextRichText: context, contextFontSize: practiceEntryFixedStyle.context.fontSize, contextColor: practiceEntryFixedStyle.context.color,
      titleRichText: title, titleFontSize: practiceEntryFixedStyle.title.fontSize, titleColor: practiceEntryFixedStyle.title.color, title,
      descriptionRichText: description, descriptionFontSize: practiceEntryFixedStyle.description.fontSize, descriptionColor: practiceEntryFixedStyle.description.color, description,
    };
  });
  const shared = sharedPracticeCopy
    ? Object.fromEntries(Object.entries(sharedPracticeCopy).filter(([key]) => key !== 'onlineParagraphs' && key !== 'rules'))
    : sharedPracticeCopy;
  return { ...rest, entries, sharedPracticeCopy: shared };
}

async function savePracticeContent() {
  const content = practiceContent.value;
  if (!content || practiceContentSaving.value || practiceContentConflict.value) return;
  const missingFlatField = observationCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(content.observationCopy[field.key].richText));
  if (missingFlatField) {
    presentAdminError(`此刻观察缺少“${missingFlatField.label}”`, () => revealObservationTarget(missingFlatField.key, true));
    return;
  }
  for (const stage of realityStageDefinitions) {
    const missingField = realityStageCopyFields.find((field) => !hasRichTextContent(content.observationCopy.realityStages[stage.key][field.key].richText));
    if (!missingField) continue;
    const fieldKey = `reality:${stage.key}:${missingField.key}`;
    presentAdminError(`现实处境“${stage.label}”阶段缺少“${missingField.label}”`, () => revealObservationTarget(fieldKey, true));
    return;
  }
  const missingSeasonField = seasonIntroCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(content.observationCopy.seasonIntro[field.key].richText));
  if (missingSeasonField) {
    presentAdminError(`四时气韵入口页缺少“${missingSeasonField.label}”`, () => revealObservationTarget(`season:${missingSeasonField.key}`, true));
    return;
  }
  const seasonStages = content.observationCopy.seasonStages;
  const missingCardField = seasonCardCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(seasonStages.card[field.key].richText));
  if (missingCardField) {
    presentAdminError(`四时气韵“01 底色”缺少“${missingCardField.label}”`, () => revealObservationTarget(`season-stage:card:${missingCardField.key}`, true));
    return;
  }
  const missingRecentField = seasonNowRecentCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(seasonStages.now.recent[field.key].richText));
  if (missingRecentField) {
    presentAdminError(`四时气韵“02 此刻 · 最近发生了什么”缺少“${missingRecentField.label}”`, () => revealObservationTarget(`season-stage:now:recent:${missingRecentField.key}`, true));
    return;
  }
  const missingRelation = seasonStages.now.recent.relations
    .find((option) => !hasRichTextContent(option.label.richText));
  if (missingRelation) {
    presentAdminError(`四时气韵“02 此刻 · 最近发生了什么”缺少“关系选项 ${missingRelation.key}”`, () => revealObservationTarget(`season-stage:now:recent:relations:${missingRelation.key}:label`, true));
    return;
  }
  const missingChangeField = seasonNowChangeCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(seasonStages.now.change[field.key].richText));
  if (missingChangeField) {
    presentAdminError(`四时气韵“02 此刻 · 此刻的变化”缺少“${missingChangeField.label}”`, () => revealObservationTarget(`season-stage:now:change:${missingChangeField.key}`, true));
    return;
  }
  for (const option of seasonStages.now.change.states) {
    if (!hasRichTextContent(option.label.richText)) {
      presentAdminError(`四时气韵“02 此刻 · 此刻的变化”缺少“状态${option.key}”`, () => revealObservationTarget(`season-stage:now:change:states:${option.key}:label`, true));
      return;
    }
    if (!hasRichTextContent(option.hint.richText)) {
      presentAdminError(`四时气韵“02 此刻 · 此刻的变化”缺少“状态${option.key}的说明”`, () => revealObservationTarget(`season-stage:now:change:states:${option.key}:hint`, true));
      return;
    }
  }
  const missingChoiceField = seasonChoiceCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(seasonStages.choice[field.key].richText));
  if (missingChoiceField) {
    presentAdminError(`四时气韵“03 选择”缺少“${missingChoiceField.label}”`, () => revealObservationTarget(`season-stage:choice:${missingChoiceField.key}`, true));
    return;
  }
  const missingActionField = seasonActionCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(seasonStages.action[field.key].richText));
  if (missingActionField) {
    presentAdminError(`四时气韵“04 行动”缺少“${missingActionField.label}”`, () => revealObservationTarget(`season-stage:action:${missingActionField.key}`, true));
    return;
  }
  const missingRecordField = observationRecordCopyGroups
    .flatMap((group) => group.fields)
    .find((field) => !hasRichTextContent(content.observationCopy.record[field.key].richText));
  if (missingRecordField) {
    presentAdminError(`观察记录页缺少“${missingRecordField.label}”`, () => revealObservationTarget(`record:${missingRecordField.key}`, true));
    return;
  }
  const derivedCopy = content.sharedPracticeCopy
    ? { onlineParagraphs: (content.sharedPracticeCopy as Record<string, unknown>).onlineParagraphs, rules: (content.sharedPracticeCopy as Record<string, unknown>).rules }
    : null;
  practiceContentSaving.value = true;
  const session = sessionGeneration;
  practiceContentRequestGeneration += 1;
  practiceContentError.value = '';
  practiceContentMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/practice/manage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify(practiceContentPayload(content)),
    });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.status === 409) {
      const conflict = await response.clone().json().catch(() => null);
      if (conflict?.code === 'practice_content_changed') practiceContentConflict.value = true;
    }
    if (!response.ok) throw new Error(await responseMessage(response, '实践内容保存失败'));
    const updated = normalizePracticeContentResponse(await response.json());
    if (!isPracticeContent(updated)) throw new Error('服务器返回的实践页面配置无法确认');
    practiceContent.value = derivedCopy && updated.sharedPracticeCopy
      ? { ...updated, sharedPracticeCopy: { ...updated.sharedPracticeCopy, ...derivedCopy } }
      : updated;
    practiceContentDirty.value = false;
    practiceContentConflict.value = false;
    practiceContentMessage.value = '实践内容已保存到云端。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) practiceContentError.value = caught instanceof Error ? caught.message : '实践内容保存失败，请重试。';
  } finally {
    if (session === sessionGeneration) {
      practiceContentRequestGeneration += 1;
      practiceContentSaving.value = false;
    }
  }
}

async function publishPracticeContent() {
  const content = practiceContent.value;
  if (!content || !isSuperAdmin.value || practiceContentDirty.value || practiceContentSaving.value || practiceContentConflict.value) {
    practiceContentError.value = practiceContentDirty.value ? '请先保存草稿，再发布。' : '';
    return;
  }
  if (!window.confirm('确认发布实践页面内容？发布后小程序用户将立即看到新内容。')) return;
  practiceContentSaving.value = true; practiceContentError.value = ''; practiceContentMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/content/practice/manage/publish`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify({ editVersion: content.editVersion }) });
    if (handleAdminUnauthorized(response, session)) return; assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '实践内容发布失败'));
    const published = normalizePracticeContentResponse(await response.json());
    if (!isPracticeContent(published)) throw new Error('服务器返回的实践页面版本无法确认');
    practiceContent.value = published;
    practiceContentDirty.value = false; practiceContentConflict.value = false;
    practiceContentMessage.value = '实践页面已发布到小程序。';
  } catch (caught) { if (session === sessionGeneration && loggedIn.value) practiceContentError.value = caught instanceof Error ? caught.message : '发布失败，请重试。'; }
  finally { if (session === sessionGeneration) practiceContentSaving.value = false; }
}

async function reloadPracticeContent(discardLocal: boolean | Event = false) {
  if (practiceContentSaving.value) return;
  if (practiceContentDirty.value && discardLocal !== true && !window.confirm('放弃当前实践页面的未保存修改，并载入云端最新版本？')) return;
  const generation = ++practiceContentRequestGeneration;
  const session = sessionGeneration;
  practiceContentSaving.value = true;
  practiceContentError.value = '';
  practiceContentMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/practice/manage`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取最新实践页面'));
    const updated = normalizePracticeContentResponse(await response.json());
    if (!isPracticeContent(updated)) throw new Error('服务器返回的实践页面配置无法确认');
    if (generation !== practiceContentRequestGeneration) return;
    practiceContent.value = updated;
    practiceContentDirty.value = false;
    practiceContentConflict.value = false;
    practiceContentMessage.value = '已载入云端最新实践页面。';
  } catch (caught) {
    if (generation === practiceContentRequestGeneration && session === sessionGeneration && loggedIn.value) practiceContentError.value = caught instanceof Error ? caught.message : '无法读取最新实践页面';
  } finally {
    if (generation === practiceContentRequestGeneration && session === sessionGeneration) practiceContentSaving.value = false;
  }
}

function markPrivacyPageDirty() { privacyPageDirty.value = true; privacyPageMessage.value = ''; privacyPageError.value = ''; }

async function savePrivacyPageContent() {
  const content = privacyPageContent.value;
  if (!content || privacyPageSaving.value || privacyPageConflict.value) return;
  privacyPageSaving.value = true;
  const session = sessionGeneration;
  privacyPageContentRequestGeneration += 1;
  privacyPageError.value = ''; privacyPageMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/about/manage`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify(content) });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.status === 409) { const conflict = await response.clone().json().catch(() => null); if (conflict?.code === 'about_page_changed') privacyPageConflict.value = true; }
    if (!response.ok) throw new Error(await responseMessage(response, '关于 MYRIAD SHE 草稿保存失败'));
    const updated = await response.json();
    if (!isPrivacyPageContent(updated)) throw new Error('服务器返回的关于内容无法确认');
    const metadata = updated as AboutPageContent & { publishedVersion?: number; publishedAt?: string };
    privacyPageContent.value = updated; privacyPagePublishedVersion.value = Number(metadata.publishedVersion) || privacyPagePublishedVersion.value; privacyPagePublishedAt.value = String(metadata.publishedAt ?? privacyPagePublishedAt.value); privacyPageDirty.value = false; privacyPageConflict.value = false; privacyPageMessage.value = '关于内容草稿已保存；发布后小程序才会更新。';
  } catch (caught) { if (session === sessionGeneration && loggedIn.value) privacyPageError.value = caught instanceof Error ? caught.message : '保存失败，请重试。'; }
  finally { if (session === sessionGeneration) { privacyPageContentRequestGeneration += 1; privacyPageSaving.value = false; } }
}

async function reloadPrivacyPageContent() {
  if (privacyPageSaving.value) return;
  if (privacyPageDirty.value && !window.confirm('放弃当前修改并载入云端最新关于内容？')) return;
  const generation = ++privacyPageContentRequestGeneration; const session = sessionGeneration; privacyPageSaving.value = true; privacyPageError.value = ''; privacyPageMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/about/manage`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return; assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取关于 MYRIAD SHE 内容'));
    const updated = await response.json(); if (!isPrivacyPageContent(updated)) throw new Error('关于 MYRIAD SHE 内容格式无效');
    if (generation !== privacyPageContentRequestGeneration) return;
    const metadata = updated as AboutPageContent & { publishedVersion?: number; publishedAt?: string };
    privacyPageContent.value = updated; privacyPagePublishedVersion.value = Number(metadata.publishedVersion) || 1; privacyPagePublishedAt.value = String(metadata.publishedAt ?? ''); privacyPageDirty.value = false; privacyPageConflict.value = false; privacyPageMessage.value = '已载入云端最新草稿。';
  } catch (caught) { if (generation === privacyPageContentRequestGeneration && session === sessionGeneration && loggedIn.value) privacyPageError.value = caught instanceof Error ? caught.message : '读取失败。'; }
  finally { if (generation === privacyPageContentRequestGeneration && session === sessionGeneration) privacyPageSaving.value = false; }
}

async function publishPrivacyPageContent() {
  const content = privacyPageContent.value;
  if (!content || privacyPageDirty.value || privacyPageSaving.value || privacyPageConflict.value) {
    privacyPageError.value = privacyPageDirty.value ? '请先保存草稿，再发布。' : '';
    return;
  }
  if (!window.confirm('确认发布「关于 MYRIAD SHE」？发布后小程序用户将立即看到新内容。')) return;
  privacyPageSaving.value = true; privacyPageError.value = ''; privacyPageMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/content/about/manage/publish`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify({ editVersion: content.editVersion }) });
    if (handleAdminUnauthorized(response, session)) return; assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '关于内容发布失败'));
    const result = await response.json();
    privacyPagePublishedVersion.value = Number(result.publishedVersion) || privacyPagePublishedVersion.value + 1;
    privacyPageMessage.value = `已发布为第 ${privacyPagePublishedVersion.value} 版，小程序已生效。`;
    await loadPrivacyRevisions('about-page');
  } catch (caught) { if (session === sessionGeneration && loggedIn.value) privacyPageError.value = caught instanceof Error ? caught.message : '发布失败，请重试。'; }
  finally { if (session === sessionGeneration) privacyPageSaving.value = false; }
}

async function loadPrivacyRevisions(key: 'about-page') {
  const session = sessionGeneration;
  if (key === 'about-page') privacyPageRevisionsLoading.value = true;
  if (key === 'about-page') privacyPageError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/privacy-revisions/${key}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取发布历史'));
    const revisions = await response.json();
    if (!Array.isArray(revisions)) throw new Error('发布历史格式无效');
    const normalized: PublishedRevision[] = revisions.filter((item) => item && Number.isSafeInteger(item.version)).map((item) => ({
      version: Number(item.version),
      publishedAt: String(item.publishedAt ?? ''),
      publishedBy: typeof item.publishedBy === 'string' ? item.publishedBy : null,
      content: item.content && typeof item.content === 'object' && !Array.isArray(item.content) ? item.content as Record<string, unknown> : null,
    }));
    if (key === 'about-page') privacyPageRevisions.value = normalized;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      const message = caught instanceof Error ? caught.message : '无法读取发布历史';
      if (key === 'about-page') privacyPageError.value = message;
    }
  } finally {
    if (key === 'about-page' && session === sessionGeneration) privacyPageRevisionsLoading.value = false;
  }
}

function isDailyObjectsContent(value: unknown): value is DailyObjectsContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const content = value as Record<string, unknown>;
  const copyKeys = [
    'brandName', 'brandSubtitle', 'bagLabel', 'bagCount', 'eyebrow', 'title', 'intro', 'previewNote', 'supportLabel',
    'landingTitle', 'landingIntro', 'landingStatus', 'herDaysTitle', 'herDaysEnglish', 'articleLabel', 'articleTitle', 'articleExcerpt',
    'articleImage', 'articleImageAlt', 'articleCaption', 'officialArticleUrl', 'officialArticleButton',
    'everydayObjectsTitle', 'everydayObjectsEnglish', 'everydayObjectsIntro',
  ];
  return Number.isSafeInteger(content.editVersion) && Number(content.editVersion) > 0
    && copyKeys.every((key) => typeof content[key] === 'string')
    && Array.isArray(content.products) && content.products.length > 0 && content.products.length <= 50 && content.products.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const product = item as Record<string, unknown>;
      return ['id', 'name', 'english', 'image', 'price', 'priceLabel', 'description', 'optionDetails', 'dailyUseDetails', 'deliveryDetails'].every((key) => typeof product[key] === 'string')
        && typeof product.id === 'string' && /^[a-z0-9][a-z0-9-]{1,31}$/.test(product.id)
        && typeof product.enabled === 'boolean';
    });
}

function isDailyObjectsImageReference(value: string) {
  return value === '' || value.startsWith('content/image/') || value.startsWith('/assets/') || /^https:\/\/[^\s]+$/i.test(value);
}

function isWeixinArticleUrl(value: string) {
  if (value === '') return true;
  if (/[\s<>]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'mp.weixin.qq.com' && /^\/s(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function openDailyObjectsEditor() {
  activeContentSection.value = 'daily-objects';
  if (!dailyObjectsContent.value || !dailyObjectsDirty.value) void loadDailyObjectsContent();
}

function openDailyObjectsEntrySettings() {
  activeSection.value = 'practice';
  activeContentSection.value = 'daily-objects';
  setPracticeEntryTab('daily-objects', 'home');
  if (!practiceContent.value) void loadDashboard();
}

async function loadDailyObjectsContent(discardLocal: boolean | Event = false) {
  const session = sessionGeneration;
  dailyObjectsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/daily-objects/manage`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取日常之物设置'));
    const content = await response.json();
    if (!isDailyObjectsContent(content)) throw new Error('日常之物配置格式无效');
    const [articlePreviewUrl, previewEntries] = await Promise.all([
      dailyObjectMediaPreviewUrl(content.articleImage, session),
      Promise.all(content.products.map(async (product) => [product.id, await dailyObjectMediaPreviewUrl(product.image, session)] as const)),
    ]);
    if (session !== sessionGeneration) return;
    if (session === sessionGeneration && (!dailyObjectsDirty.value || discardLocal === true)) {
      dailyObjectsContent.value = content;
      dailyObjectsDirty.value = false;
      dailyObjectPreviewUrls.value = Object.fromEntries(previewEntries);
      dailyObjectArticlePreviewUrl.value = articlePreviewUrl;
      dailyObjectsConflict.value = false;
    }
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) dailyObjectsError.value = caught instanceof Error ? caught.message : '无法读取日常之物设置';
  }
}

async function dailyObjectMediaPreviewUrl(image: string, session: number) {
  if (!image.startsWith('content/image/')) return image;
  try {
    const params = new URLSearchParams({ objectKey: image });
    const previewResponse = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(previewResponse, session)) return '';
    if (!previewResponse.ok) return '';
    const target = await previewResponse.json();
    return isMediaViewTarget(target) ? target.url : '';
  } catch {
    return '';
  }
}

function uploadDailyObjectImage(event: Event, targetId: string) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !dailyObjectsContent.value || dailyObjectUploadingId.value) return;
  const content = dailyObjectsContent.value;
  const isArticleImage = targetId === 'article-image';
  const product = isArticleImage ? null : content.products.find((item) => item.id === targetId);
  if (!isArticleImage && !product) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    dailyObjectsError.value = '图片仅支持 JPG、PNG 或 WebP。';
    return;
  }
  dailyObjectsError.value = '';
  requestImageCrop(file, isArticleImage ? '编辑日常文章配图' : '编辑日常商品图片', (croppedFile) => uploadDailyObjectImageFile(croppedFile, targetId));
}

async function uploadDailyObjectImageFile(file: File, targetId: string) {
  if (!dailyObjectsContent.value || dailyObjectUploadingId.value) return;
  const content = dailyObjectsContent.value;
  const isArticleImage = targetId === 'article-image';
  const product = isArticleImage ? null : content.products.find((item) => item.id === targetId);
  if (!isArticleImage && !product) return;
  const session = sessionGeneration;
  dailyObjectUploadingId.value = targetId;
  dailyObjectsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/media/upload-url`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, kind: 'image' }),
    });
    if (handleAdminUnauthorized(response, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法创建图片上传地址'));
    const target = await response.json();
    if (!isMediaUploadTarget(target)) throw new Error('服务器未返回有效的图片上传地址');
    const uploadResponse = await apiFetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file }, mediaUploadTimeoutMs);
    assertSession(session);
    if (!uploadResponse.ok) throw new Error(await responseMessage(uploadResponse, '图片上传失败'));
    const params = new URLSearchParams({ objectKey: target.objectKey });
    const previewResponse = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(previewResponse, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!previewResponse.ok) throw new Error(await responseMessage(previewResponse, '图片已上传，但无法生成预览'));
    const preview = await previewResponse.json();
    if (!isMediaViewTarget(preview)) throw new Error('服务器未返回有效的图片预览地址');
    if (isArticleImage) {
      content.articleImage = target.objectKey;
      dailyObjectArticlePreviewUrl.value = preview.url;
    } else if (product) {
      product.image = target.objectKey;
      dailyObjectPreviewUrls.value = { ...dailyObjectPreviewUrls.value, [product.id]: preview.url };
    }
    markDailyObjectsDirty();
    dailyObjectsMessage.value = `${isArticleImage ? '日常文章配图' : '商品图片'}已上传，保存日常之物后生效。`;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) dailyObjectsError.value = caught instanceof Error ? caught.message : '图片上传失败。';
  } finally {
    if (session === sessionGeneration) dailyObjectUploadingId.value = '';
  }
}

function chooseBrandPopupImage() {
  if (!isSuperAdmin.value || brandPopupUploading.value || settingsLoading.value) return;
  brandPopupFileInput.value?.click();
}

function selectBrandPopupImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || brandPopupUploading.value) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    settingsError.value = '启动品牌图仅支持 JPG、PNG 或 WebP。';
    return;
  }
  settingsError.value = '';
  settingsMessage.value = '';
  requestImageCrop(file, '编辑启动品牌图', (croppedFile) => { void uploadBrandPopupImage(croppedFile); });
}

async function uploadBrandPopupImage(file: File) {
  if (!isSuperAdmin.value || brandPopupUploading.value) return;
  const session = sessionGeneration;
  brandPopupUploading.value = true;
  settingsError.value = '';
  settingsMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/media/upload-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, kind: 'image' }),
    });
    if (handleAdminUnauthorized(response, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法创建品牌图上传地址'));
    const target = await response.json();
    if (!isMediaUploadTarget(target)) throw new Error('服务器未返回有效的品牌图上传地址');
    const uploadResponse = await apiFetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file }, mediaUploadTimeoutMs);
    assertSession(session);
    if (!uploadResponse.ok) throw new Error(await responseMessage(uploadResponse, '品牌图上传失败'));
    const params = new URLSearchParams({ objectKey: target.objectKey });
    const previewResponse = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(previewResponse, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!previewResponse.ok) throw new Error(await responseMessage(previewResponse, '品牌图已上传，但无法生成预览'));
    const preview = await previewResponse.json();
    if (!isMediaViewTarget(preview)) throw new Error('服务器未返回有效的品牌图预览地址');
    systemSettings.value = { ...systemSettings.value, brand_popup_image: target.objectKey };
    brandPopupPreviewUrl.value = preview.url;
    settingsMessage.value = '品牌图已上传。请确认开关与展示设置，再点击「保存系统设置」后生效。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) settingsError.value = caught instanceof Error ? caught.message : '品牌图上传失败。';
  } finally {
    if (session === sessionGeneration) brandPopupUploading.value = false;
  }
}

function removeBrandPopupImage() {
  if (!isSuperAdmin.value || brandPopupUploading.value) return;
  if (!window.confirm('移除品牌图会同时关闭品牌图弹窗。保存系统设置后生效，确认移除？')) return;
  systemSettings.value = { ...systemSettings.value, brand_popup_image: '', brand_popup_enabled: false };
  brandPopupPreviewUrl.value = '';
  settingsError.value = '';
  settingsMessage.value = '品牌图已移除，品牌图弹窗已关闭；请点击「保存系统设置」后生效。';
}

function markDailyObjectsDirty() {
  dailyObjectsDirty.value = true;
  dailyObjectsMessage.value = '';
  dailyObjectsError.value = '';
}

function addDailyObjectsProduct() {
  if (!dailyObjectsContent.value) return;
  const id = `item-${String(Date.now()).slice(-8)}`;
  dailyObjectsContent.value.products.push({ id, name: '新商品', english: 'OBJECT No. 03', image: '/assets/shop/shop-item-01.svg', price: '', priceLabel: '演示金额', description: '商品介绍待补充。', optionDetails: '', dailyUseDetails: '', deliveryDetails: '', enabled: false });
  markDailyObjectsDirty();
}

// 后台读回来的是「已发布内容 + draft 标记」，后端 DTO 只收可写字段，
// 直接 JSON.stringify(content) 会被 whitelist 校验拒掉（property draft should not exist）。
function dailyObjectsPayload(content: DailyObjectsContent) {
  return {
    editVersion: content.editVersion,
    brandName: content.brandName,
    brandSubtitle: content.brandSubtitle,
    bagLabel: content.bagLabel,
    bagCount: content.bagCount,
    eyebrow: content.eyebrow,
    title: content.title,
    intro: content.intro,
    previewNote: content.previewNote,
    supportLabel: content.supportLabel,
    landingTitle: content.landingTitle,
    landingIntro: content.landingIntro,
    landingStatus: content.landingStatus,
    herDaysTitle: content.herDaysTitle,
    herDaysEnglish: content.herDaysEnglish,
    articleLabel: content.articleLabel,
    articleTitle: content.articleTitle,
    articleExcerpt: content.articleExcerpt,
    articleImage: content.articleImage,
    articleImageAlt: content.articleImageAlt,
    articleCaption: content.articleCaption,
    officialArticleUrl: content.officialArticleUrl,
    officialArticleButton: content.officialArticleButton,
    everydayObjectsTitle: content.everydayObjectsTitle,
    everydayObjectsEnglish: content.everydayObjectsEnglish,
    everydayObjectsIntro: content.everydayObjectsIntro,
    products: content.products.map((product) => ({
      id: product.id,
      name: product.name,
      english: product.english,
      image: product.image,
      price: product.price,
      priceLabel: product.priceLabel,
      description: product.description,
      optionDetails: product.optionDetails,
      dailyUseDetails: product.dailyUseDetails,
      deliveryDetails: product.deliveryDetails,
      enabled: product.enabled,
    })),
  };
}

async function saveDailyObjectsContent() {
  const content = dailyObjectsContent.value;
  if (!content || dailyObjectsSaving.value || dailyObjectsConflict.value) return;
  if (!isDailyObjectsImageReference(content.articleImage.trim())) {
    dailyObjectsError.value = '日常文章配图请上传图片，或填写 /assets/ 素材路径 / HTTPS 地址。';
    return;
  }
  if (!isWeixinArticleUrl(content.officialArticleUrl.trim())) {
    dailyObjectsError.value = '公众号文章链接须为 mp.weixin.qq.com 的 HTTPS 文章链接。';
    return;
  }
  dailyObjectsSaving.value = true;
  dailyObjectsError.value = '';
  dailyObjectsMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/content/daily-objects/manage`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify(dailyObjectsPayload(content)) });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.status === 409) {
      const conflict = await response.clone().json().catch(() => null);
      if (conflict?.code === 'daily_objects_content_changed') dailyObjectsConflict.value = true;
    }
    if (!response.ok) throw new Error(await responseMessage(response, '日常之物保存失败'));
    const updated = await response.json();
    if (!isDailyObjectsContent(updated)) throw new Error('服务器返回的日常之物配置无法确认');
    dailyObjectsContent.value = updated;
    dailyObjectsDirty.value = false;
    dailyObjectsConflict.value = false;
    dailyObjectsMessage.value = '日常之物已保存到云端。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) dailyObjectsError.value = caught instanceof Error ? caught.message : '日常之物保存失败，请重试。';
  } finally {
    if (session === sessionGeneration) dailyObjectsSaving.value = false;
  }
}

async function publishDailyObjectsContent() {
  const content = dailyObjectsContent.value;
  if (!content || !isSuperAdmin.value || dailyObjectsDirty.value || dailyObjectsSaving.value || dailyObjectsConflict.value) {
    dailyObjectsError.value = dailyObjectsDirty.value ? '请先保存草稿，再发布。' : '';
    return;
  }
  if (!window.confirm('确认发布日常之物？发布后小程序用户将立即看到新内容。')) return;
  dailyObjectsSaving.value = true; dailyObjectsError.value = ''; dailyObjectsMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/content/daily-objects/manage/publish`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify({ editVersion: content.editVersion }) });
    if (handleAdminUnauthorized(response, session)) return; assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '日常之物发布失败'));
    const published = await response.json();
    if (!isDailyObjectsContent(published)) throw new Error('服务器返回的日常之物版本无法确认');
    dailyObjectsContent.value = published;
    dailyObjectsDirty.value = false; dailyObjectsConflict.value = false;
    dailyObjectsMessage.value = '日常之物已发布到小程序。';
  } catch (caught) { if (session === sessionGeneration && loggedIn.value) dailyObjectsError.value = caught instanceof Error ? caught.message : '发布失败，请重试。'; }
  finally { if (session === sessionGeneration) dailyObjectsSaving.value = false; }
}

async function saveMinePageContent() {
  const content = minePageContent.value;
  if (!content || minePageContentSaving.value || minePageContentConflict.value) return;
  const editableText = [content.title, content.intro, content.observationHeading, content.emptyTitle, content.emptyIntro, content.startButton,
    content.discussionHeading, content.discussionCount, content.discussionEmptyAction, content.discussionIntro,
    content.practiceHeading, content.practiceCount, content.practiceEmptyTitle, content.practiceIntro, content.privacyHeading, content.privacyAction];
  if (!editableText.every(hasRichTextContent)) {
    minePageContentError.value = '页面文案都不能为空。';
    return;
  }
  minePageContentSaving.value = true;
  const session = sessionGeneration;
  minePageContentRequestGeneration += 1;
  minePageContentError.value = '';
  minePageContentMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/mine/manage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify(content),
    });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.status === 409) {
      const conflict = await response.clone().json().catch(() => null);
      if (conflict?.code === 'mine_page_content_changed') minePageContentConflict.value = true;
    }
    if (!response.ok) throw new Error(await responseMessage(response, '我的页面保存失败'));
    const updated = await response.json();
    if (!isMinePageContent(updated)) throw new Error('服务器返回的我的页面配置无法确认');
    minePageContent.value = updated;
    minePageContentDirty.value = false;
    minePageContentConflict.value = false;
    minePageContentMessage.value = '我的页面文案已保存到云端。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) minePageContentError.value = caught instanceof Error ? caught.message : '我的页面保存失败，请重试。';
  } finally {
    if (session === sessionGeneration) {
      minePageContentRequestGeneration += 1;
      minePageContentSaving.value = false;
    }
  }
}

async function reloadMinePageContent() {
  if (minePageContentSaving.value) return;
  if (minePageContentDirty.value && !window.confirm('放弃当前我的页面的未保存修改，并载入云端最新版本？')) return;
  const generation = ++minePageContentRequestGeneration;
  const session = sessionGeneration;
  minePageContentSaving.value = true;
  minePageContentError.value = '';
  minePageContentMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/mine/manage`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取最新我的页面设置'));
    const updated = await response.json();
    if (!isMinePageContent(updated)) throw new Error('服务器返回的我的页面配置无法确认');
    if (generation !== minePageContentRequestGeneration) return;
    minePageContent.value = updated;
    minePageContentDirty.value = false;
    minePageContentConflict.value = false;
    minePageContentMessage.value = '已载入云端最新我的页面设置。';
  } catch (caught) {
    if (generation === minePageContentRequestGeneration && session === sessionGeneration && loggedIn.value) minePageContentError.value = caught instanceof Error ? caught.message : '无法读取最新我的页面设置';
  } finally {
    if (generation === minePageContentRequestGeneration && session === sessionGeneration) minePageContentSaving.value = false;
  }
}

async function loadMorePrivacy() {
  if (privacyControlsBusy.value || !privacyHasMore.value) return;
  const session = sessionGeneration;
  const generation = ++privacyRequestGeneration;
  privacyLoadingMore.value = true;
  privacyMoreError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/privacy-requests?${privacyQuery(privacyOffset.value)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多删除申请'));
    const result = await response.json();
    if (!isPrivacyRequestPage(result)) throw new Error('删除申请列表格式无效');
    if (generation !== privacyRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    privacyRequests.value = [...privacyRequests.value, ...result.items];
    privacyTotal.value = result.total;
    privacyLifecycle.value = result.summary;
    privacyOffset.value = result.offset + result.items.length;
    privacyHasMore.value = privacyOffset.value < result.total;
  } catch (caught) {
    if (generation !== privacyRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    privacyMoreError.value = caught instanceof Error ? caught.message : '无法加载更多删除申请';
  } finally {
    if (generation === privacyRequestGeneration && session === sessionGeneration) privacyLoadingMore.value = false;
  }
}

async function refreshObservations() {
  const session = sessionGeneration;
  const generation = ++observationRequestGeneration;
  observationLoadingMore.value = false;
  observationMoreError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/observations?${observationQuery(0)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取观察记录'));
    const result = await response.json();
    if (!isManagedObservationPage(result)) throw new Error('观察记录列表格式无效');
    if (generation !== observationRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    observations.value = result.items;
    observationTotal.value = result.total;
    observationOffset.value = result.offset + result.items.length;
    observationHasMore.value = observationOffset.value < result.total;
    await loadObservationLifecycle(generation, session);
  } catch (caught) {
    if (generation !== observationRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    error.value = caught instanceof Error ? caught.message : '无法读取观察记录';
  }
}

async function viewObservation(record: ManagedObservation) {
  const session = sessionGeneration;
  selectedObservation.value = null;
  selectedObservationError.value = '';
  selectedObservationLoading.value = true;
  try {
    const response = await apiFetch(`${apiBase}/admin/observations/${encodeURIComponent(record.id)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取观察内容'));
    const result = await response.json();
    if (!isManagedObservationDetail(result)) throw new Error('观察内容格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedObservation.value = result;
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedObservationError.value = caught instanceof Error ? caught.message : '无法读取观察内容';
  } finally {
    if (session === sessionGeneration) selectedObservationLoading.value = false;
  }
}

const discussionPublicationStatuses: DiscussionPublicationStatus[] = ['pending', 'published', 'hidden', 'rejected'];
const discussionRestrictionStatuses: DiscussionRestrictionStatus[] = ['active', 'scheduled', 'expired', 'revoked'];
const discussionContributionGrandTotal = computed(() =>
  discussionPublicationStatuses.reduce(
    (total, status) => total + discussionContributionSummary.value[status],
    0,
  ),
);
const discussionRestrictionGrandTotal = computed(() =>
  discussionRestrictionStatuses.reduce(
    (total, status) => total + discussionRestrictionSummary.value[status],
    0,
  ),
);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function discussionContributionPublicationLabel(status: DiscussionPublicationStatus) {
  return ({ pending: '待审核', published: '已公开', hidden: '已隐藏', rejected: '已拒绝' })[status];
}

function discussionContributionAuthor(record: Pick<ManagedDiscussionContribution, 'nickname' | 'userId'>) {
  return record.nickname?.trim() || `${record.userId.slice(0, 8)}…`;
}

function discussionRestrictionStatusLabel(status: DiscussionRestrictionStatus) {
  return ({ active: '停用中', scheduled: '待停用', expired: '已到期', revoked: '已恢复' })[status];
}

function discussionRestrictionPeriod(record: Pick<ManagedDiscussionRestriction, 'startsAt' | 'endsAt'>) {
  return record.endsAt ? `${displayDate(record.startsAt)} 至 ${displayDate(record.endsAt)}` : `${displayDate(record.startsAt)} 起，永久停用`;
}

function isManagedDiscussionContribution(value: unknown): value is ManagedDiscussionContribution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && Number.isSafeInteger(item.revision)
    && typeof item.issueCode === 'string'
    && typeof item.issueLabel === 'string'
    && typeof item.threadId === 'string'
    && isNullableString(item.threadAuthor)
    && discussionPublicationStatuses.includes(item.publicationStatus as DiscussionPublicationStatus)
    && typeof item.userId === 'string'
    && isNullableString(item.nickname)
    && isNullableString(item.publishedAt)
    && isNullableString(item.featuredAt)
    && Number.isSafeInteger(item.featuredOrder)
    && typeof item.bodyPreview === 'string'
    && typeof item.createdAt === 'string'
    && typeof item.updatedAt === 'string';
}

function isDiscussionContributionPage(value: unknown): value is { items: ManagedDiscussionContribution[]; total: number; limit: number; offset: number; summary: Record<DiscussionPublicationStatus, number> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  return Number.isSafeInteger(page.total) && Number.isSafeInteger(page.limit) && Number.isSafeInteger(page.offset)
    && Boolean(page.summary && typeof page.summary === 'object' && discussionPublicationStatuses.every((status) => Number.isSafeInteger((page.summary as Record<string, unknown>)[status])))
    && Array.isArray(page.items) && page.items.every(isManagedDiscussionContribution);
}

function isManagedDiscussionRestriction(value: unknown): value is ManagedDiscussionRestriction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.userId === 'string'
    && isNullableString(item.nickname)
    && typeof item.reason === 'string'
    && typeof item.startsAt === 'string'
    && isNullableString(item.endsAt)
    && typeof item.createdBy === 'string'
    && typeof item.createdAt === 'string'
    && isNullableString(item.revokedAt)
    && isNullableString(item.revokedBy)
    && discussionRestrictionStatuses.includes(item.effectiveStatus as DiscussionRestrictionStatus);
}

function isDiscussionRestrictionPage(value: unknown): value is { items: ManagedDiscussionRestriction[]; total: number; limit: number; offset: number; summary: Record<DiscussionRestrictionStatus, number> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  return Number.isSafeInteger(page.total) && Number.isSafeInteger(page.limit) && Number.isSafeInteger(page.offset)
    && Boolean(page.summary && typeof page.summary === 'object' && discussionRestrictionStatuses.every((status) => Number.isSafeInteger((page.summary as Record<string, unknown>)[status])))
    && Array.isArray(page.items) && page.items.every(isManagedDiscussionRestriction);
}

function discussionContributionQuery(offset = 0) {
  return new URLSearchParams({
    limit: String(discussionContributionPageSize),
    offset: String(offset),
    ...(discussionContributionPublicationStatus.value ? { publicationStatus: discussionContributionPublicationStatus.value } : {}),
    ...(discussionContributionKind.value ? { kind: discussionContributionKind.value } : {}),
    ...(discussionContributionIssueCode.value ? { issueCode: discussionContributionIssueCode.value } : {}),
  });
}

async function refreshDiscussionContributions() {
  if (!loggedIn.value) return;
  const session = sessionGeneration;
  const generation = ++discussionContributionGeneration;
  discussionContributionLoading.value = true;
  discussionContributionLoadingMore.value = false;
  discussionContributionMoreError.value = '';
  discussionContributionError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-contributions?${discussionContributionQuery(0)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取讨论内容'));
    const result = await response.json();
    if (!isDiscussionContributionPage(result)) throw new Error('讨论内容列表格式无效');
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributions.value = result.items;
    discussionContributionTotal.value = result.total;
    discussionContributionOffset.value = result.offset + result.items.length;
    discussionContributionHasMore.value = discussionContributionOffset.value < result.total;
    discussionContributionSummary.value = result.summary;
  } catch (caught) {
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributionError.value = caught instanceof Error ? caught.message : '无法读取讨论内容';
  } finally {
    if (generation === discussionContributionGeneration && session === sessionGeneration) discussionContributionLoading.value = false;
  }
}

async function loadMoreDiscussionContributions() {
  if (discussionContributionLoadingMore.value || !discussionContributionHasMore.value) return;
  const session = sessionGeneration;
  const generation = ++discussionContributionGeneration;
  discussionContributionLoadingMore.value = true;
  discussionContributionMoreError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-contributions?${discussionContributionQuery(discussionContributionOffset.value)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多讨论内容'));
    const result = await response.json();
    if (!isDiscussionContributionPage(result)) throw new Error('讨论内容列表格式无效');
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributions.value = [...discussionContributions.value, ...result.items];
    discussionContributionTotal.value = result.total;
    discussionContributionOffset.value = result.offset + result.items.length;
    discussionContributionHasMore.value = discussionContributionOffset.value < result.total;
    discussionContributionSummary.value = result.summary;
  } catch (caught) {
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributionMoreError.value = caught instanceof Error ? caught.message : '无法加载更多讨论内容';
  } finally {
    if (generation === discussionContributionGeneration && session === sessionGeneration) discussionContributionLoadingMore.value = false;
  }
}

async function viewDiscussionContribution(record: ManagedDiscussionContribution) {
  const session = sessionGeneration;
  selectedDiscussionContribution.value = null;
  selectedDiscussionContributionError.value = '';
  discussionContributionActionMessage.value = '';
  selectedDiscussionContributionLoading.value = true;
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-contributions/${encodeURIComponent(record.id)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取讨论内容'));
    const result = await response.json() as unknown;
    if (!isManagedDiscussionContribution(result) || typeof (result as Record<string, unknown>).body !== 'string') throw new Error('讨论内容详情格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedDiscussionContribution.value = result as ManagedDiscussionContributionDetail;
    discussionContributionFeaturedOrder.value = String(result.featuredOrder || 10);
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedDiscussionContributionError.value = caught instanceof Error ? caught.message : '无法读取讨论内容';
  } finally {
    if (session === sessionGeneration) selectedDiscussionContributionLoading.value = false;
  }
}

async function updateDiscussionContributionPublication(record: ManagedDiscussionContribution, publicationStatus: DiscussionPublicationStatus) {
  if (discussionContributionSaving.value || record.publicationStatus === publicationStatus) return;
  const session = sessionGeneration;
  discussionContributionSaving.value = true;
  discussionContributionActionMessage.value = '';
  selectedDiscussionContributionError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-contributions/${encodeURIComponent(record.id)}/publication`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ publicationStatus, revision: record.revision }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法更新发布状态'));
    const result = await response.json() as Partial<ManagedDiscussionContribution>;
    if (!result || result.id !== record.id || !discussionPublicationStatuses.includes(result.publicationStatus as DiscussionPublicationStatus) || !Number.isSafeInteger(result.revision)) throw new Error('发布状态更新结果格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    if (selectedDiscussionContribution.value?.id === record.id) {
      selectedDiscussionContribution.value = { ...selectedDiscussionContribution.value, ...result } as ManagedDiscussionContributionDetail;
      discussionContributionFeaturedOrder.value = String(result.featuredOrder || 10);
    }
    discussionContributionActionMessage.value = publicationStatus === 'published'
      ? '已公开发布这条讨论内容。'
      : publicationStatus === 'hidden'
        ? '已隐藏这条讨论内容。'
        : publicationStatus === 'rejected'
          ? '已拒绝这条讨论内容。'
          : '已恢复为待审核。';
    await refreshDiscussionContributions();
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionContributionError.value = caught instanceof Error ? caught.message : '无法更新发布状态';
  } finally {
    if (session === sessionGeneration) discussionContributionSaving.value = false;
  }
}

async function updateDiscussionContributionFeatured(record: ManagedDiscussionContributionDetail, featured: boolean) {
  if (discussionContributionSaving.value || record.threadId || record.publicationStatus !== 'published') return;
  const order = Number(discussionContributionFeaturedOrder.value);
  if (featured && (!Number.isSafeInteger(order) || order < 0 || order > 999)) {
    discussionContributionError.value = '精华顺序需为 0–999 的整数。';
    return;
  }
  if (!featured && !record.featuredAt) return;
  const session = sessionGeneration;
  discussionContributionSaving.value = true;
  discussionContributionActionMessage.value = '';
  selectedDiscussionContributionError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-contributions/${encodeURIComponent(record.id)}/featured`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ featured, ...(featured ? { featuredOrder: order } : {}), revision: record.revision }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法更新精华状态'));
    const result = await response.json() as Partial<ManagedDiscussionContribution>;
    if (!result || result.id !== record.id || !Number.isSafeInteger(result.revision) || !isNullableString(result.featuredAt)) throw new Error('精华状态更新结果格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    if (selectedDiscussionContribution.value?.id === record.id) {
      selectedDiscussionContribution.value = { ...selectedDiscussionContribution.value, ...result } as ManagedDiscussionContributionDetail;
      discussionContributionFeaturedOrder.value = String(result.featuredOrder || 0);
    }
    discussionContributionActionMessage.value = featured ? '已更新精华展示。' : '已取消精华展示。';
    await refreshDiscussionContributions();
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionContributionError.value = caught instanceof Error ? caught.message : '无法更新精华状态';
  } finally {
    if (session === sessionGeneration) discussionContributionSaving.value = false;
  }
}

function discussionRestrictionQuery(offset = 0) {
  return new URLSearchParams({
    limit: String(discussionRestrictionPageSize),
    offset: String(offset),
    ...(discussionRestrictionStatus.value ? { status: discussionRestrictionStatus.value } : {}),
  });
}

async function refreshDiscussionRestrictions() {
  if (!loggedIn.value) return;
  const session = sessionGeneration;
  const generation = ++discussionRestrictionGeneration;
  discussionRestrictionLoading.value = true;
  discussionRestrictionLoadingMore.value = false;
  discussionRestrictionMoreError.value = '';
  discussionRestrictionError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-restrictions?${discussionRestrictionQuery(0)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取一起谈谈权限记录'));
    const result = await response.json();
    if (!isDiscussionRestrictionPage(result)) throw new Error('一起谈谈权限记录格式无效');
    if (generation !== discussionRestrictionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictions.value = result.items;
    discussionRestrictionTotal.value = result.total;
    discussionRestrictionOffset.value = result.offset + result.items.length;
    discussionRestrictionHasMore.value = discussionRestrictionOffset.value < result.total;
    discussionRestrictionSummary.value = result.summary;
  } catch (caught) {
    if (generation !== discussionRestrictionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictionError.value = caught instanceof Error ? caught.message : '无法读取一起谈谈权限记录';
  } finally {
    if (generation === discussionRestrictionGeneration && session === sessionGeneration) discussionRestrictionLoading.value = false;
  }
}

async function loadMoreDiscussionRestrictions() {
  if (discussionRestrictionLoadingMore.value || !discussionRestrictionHasMore.value) return;
  const session = sessionGeneration;
  const generation = ++discussionRestrictionGeneration;
  discussionRestrictionLoadingMore.value = true;
  discussionRestrictionMoreError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-restrictions?${discussionRestrictionQuery(discussionRestrictionOffset.value)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多一起谈谈权限记录'));
    const result = await response.json();
    if (!isDiscussionRestrictionPage(result)) throw new Error('一起谈谈权限记录格式无效');
    if (generation !== discussionRestrictionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictions.value = [...discussionRestrictions.value, ...result.items];
    discussionRestrictionTotal.value = result.total;
    discussionRestrictionOffset.value = result.offset + result.items.length;
    discussionRestrictionHasMore.value = discussionRestrictionOffset.value < result.total;
    discussionRestrictionSummary.value = result.summary;
  } catch (caught) {
    if (generation !== discussionRestrictionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictionMoreError.value = caught instanceof Error ? caught.message : '无法加载更多一起谈谈权限记录';
  } finally {
    if (generation === discussionRestrictionGeneration && session === sessionGeneration) discussionRestrictionLoadingMore.value = false;
  }
}

function discussionRestrictionLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function discussionRestrictionDefaultEndsAt() {
  return discussionRestrictionLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function showDiscussionRestrictionValidationError(message: string, targetId?: string) {
  discussionRestrictionCreateError.value = message;
  void nextTick(() => {
    document.querySelector<HTMLElement>('.discussion-restriction-dialog-error')?.scrollIntoView({ block: 'nearest' });
    if (targetId) document.getElementById(targetId)?.focus({ preventScroll: true });
  });
}

function openDiscussionRestrictionDialog() {
  discussionRestrictionEarliestEndsAt.value = discussionRestrictionLocalDateTime(new Date(Date.now() + 2 * 60 * 1000));
  if (discussionRestrictionMode.value === 'temporary') discussionRestrictionForm.value.endsAt = discussionRestrictionDefaultEndsAt();
  discussionRestrictionDialogOpen.value = true;
  void nextTick(() => {
    const targetId = discussionRestrictionForm.value.userId
      ? 'discussion-restriction-reason'
      : 'discussion-restriction-user';
    document.getElementById(targetId)?.focus({ preventScroll: true });
  });
}

function openNewDiscussionRestrictionDialog() {
  discussionRestrictionForm.value = { userId: '', reason: '', endsAt: '' };
  discussionRestrictionMode.value = 'temporary';
  discussionRestrictionPrefillNickname.value = '';
  discussionRestrictionCreateMessage.value = '';
  discussionRestrictionCreateError.value = '';
  openDiscussionRestrictionDialog();
}

function closeDiscussionRestrictionDialog() {
  if (discussionRestrictionCreating.value) return;
  discussionRestrictionDialogOpen.value = false;
  discussionRestrictionCreateError.value = '';
}

function prefillDiscussionRestrictionForUser(userId: string, nickname: string) {
  const alreadyOnRestrictions = activeSection.value === 'discussion-restrictions';
  discussionRestrictionForm.value = { userId, reason: '', endsAt: '' };
  discussionRestrictionMode.value = 'temporary';
  discussionRestrictionPrefillNickname.value = nickname;
  discussionRestrictionCreateMessage.value = '';
  discussionRestrictionCreateError.value = '';
  openOperationsSubsection('discussion-restrictions');
  if (alreadyOnRestrictions) void refreshDiscussionRestrictions();
  void nextTick(openDiscussionRestrictionDialog);
}

function prefillDiscussionRestriction(record: ManagedDiscussionContribution) {
  prefillDiscussionRestrictionForUser(record.userId, discussionContributionAuthor(record));
}

function openMemberDiscussionRestriction(member: Member) {
  memberDetail.value = null;
  prefillDiscussionRestrictionForUser(
    member.id,
    member.nickname?.trim() || `${member.id.slice(0, 8)}…`,
  );
}

async function createDiscussionRestriction() {
  if (discussionRestrictionCreating.value) return;
  const userId = discussionRestrictionForm.value.userId.trim();
  const reason = discussionRestrictionForm.value.reason.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    showDiscussionRestrictionValidationError('请输入有效的用户 UUID。', 'discussion-restriction-user');
    return;
  }
  if (reason.length < 2 || reason.length > 200) {
    showDiscussionRestrictionValidationError('停用原因需为 2–200 个字。', 'discussion-restriction-reason');
    return;
  }
  let endsAt: string | undefined;
  if (discussionRestrictionMode.value === 'temporary') {
    if (!discussionRestrictionForm.value.endsAt) {
      showDiscussionRestrictionValidationError('请选择临时停用的结束时间。', 'discussion-restriction-ends-at');
      return;
    }
    const parsed = new Date(discussionRestrictionForm.value.endsAt);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      showDiscussionRestrictionValidationError('临时停用的结束时间必须晚于当前时间。', 'discussion-restriction-ends-at');
      return;
    }
    endsAt = parsed.toISOString();
  }
  const session = sessionGeneration;
  discussionRestrictionCreating.value = true;
  discussionRestrictionCreateMessage.value = '';
  discussionRestrictionCreateError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-restrictions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ userId, reason, ...(endsAt ? { endsAt } : {}) }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法停用一起谈谈权限'));
    const result = await response.json();
    if (!isManagedDiscussionRestriction(result)) throw new Error('一起谈谈权限停用结果格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictionForm.value = { userId: '', reason: '', endsAt: '' };
    discussionRestrictionMode.value = 'temporary';
    discussionRestrictionPrefillNickname.value = '';
    discussionRestrictionCreateMessage.value = `已${result.endsAt ? '临时' : '永久'}停用 ${result.nickname || result.userId.slice(0, 8)} 的一起谈谈权限。`;
    discussionRestrictionDialogOpen.value = false;
    await refreshDiscussionRestrictions();
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    showDiscussionRestrictionValidationError(caught instanceof Error ? caught.message : '无法停用一起谈谈权限');
  } finally {
    if (session === sessionGeneration) discussionRestrictionCreating.value = false;
  }
}

async function revokeDiscussionRestriction(record: ManagedDiscussionRestriction) {
  if (discussionRestrictionSavingId.value || record.effectiveStatus === 'revoked') return;
  const session = sessionGeneration;
  discussionRestrictionSavingId.value = record.id;
  discussionRestrictionActionMessage.value = '';
  discussionRestrictionError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-restrictions/${encodeURIComponent(record.id)}/revoke`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法恢复一起谈谈权限'));
    const result = await response.json();
    if (!isManagedDiscussionRestriction(result) || result.effectiveStatus !== 'revoked') throw new Error('一起谈谈权限恢复结果格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictionActionMessage.value = `已恢复 ${result.nickname || result.userId.slice(0, 8)} 的一起谈谈权限。`;
    await refreshDiscussionRestrictions();
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionRestrictionError.value = caught instanceof Error ? caught.message : '无法恢复一起谈谈权限';
  } finally {
    if (session === sessionGeneration) discussionRestrictionSavingId.value = '';
  }
}

function isDiscussionReportPage(value: unknown): value is { items: ManagedDiscussionReport[]; total: number; limit: number; offset: number; summary: Record<DiscussionReportStatus, number> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  const summary = page.summary as Record<string, unknown> | undefined;
  const optionalText = (candidate: unknown) => candidate === null || typeof candidate === 'string';
  return Number.isSafeInteger(page.total) && Number.isSafeInteger(page.limit) && Number.isSafeInteger(page.offset)
    && Boolean(summary && typeof summary === 'object' && ['pending', 'handled', 'dismissed'].every((key) => Number.isSafeInteger((summary as Record<string, unknown>)[key])))
    && Array.isArray(page.items) && page.items.every((item) => Boolean(item && typeof item === 'object' && !Array.isArray(item)
      && typeof (item as Record<string, unknown>).id === 'string'
      && Number.isSafeInteger((item as Record<string, unknown>).revision)
      && typeof (item as Record<string, unknown>).issueCode === 'string'
      && typeof (item as Record<string, unknown>).issueLabel === 'string'
      && typeof (item as Record<string, unknown>).threadId === 'string'
      && optionalText((item as Record<string, unknown>).threadAuthor)
      && optionalText((item as Record<string, unknown>).threadBody)
      && optionalText((item as Record<string, unknown>).detail)
      && typeof (item as Record<string, unknown>).reason === 'string'
      && ['pending', 'handled', 'dismissed'].includes(String((item as Record<string, unknown>).status))
      && typeof (item as Record<string, unknown>).createdAt === 'string'
      && typeof (item as Record<string, unknown>).updatedAt === 'string'));
}

function discussionReportQuery(offset = 0) {
  return new URLSearchParams({
    limit: String(discussionReportPageSize),
    offset: String(offset),
    ...(discussionReportStatus.value ? { status: discussionReportStatus.value } : {}),
    ...(discussionReportIssueCode.value ? { issueCode: discussionReportIssueCode.value } : {}),
  });
}

async function refreshDiscussionReports(append = false) {
  if (!loggedIn.value) return;
  const session = sessionGeneration;
  const generation = ++discussionReportGeneration;
  discussionReportLoading.value = true;
  discussionReportError.value = '';
  try {
    const offset = append ? discussionReportOffset.value : 0;
    const response = await apiFetch(`${apiBase}/admin/discussion-reports?${discussionReportQuery(offset)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取内容举报'));
    const result = await response.json();
    if (!isDiscussionReportPage(result)) throw new Error('内容举报列表格式无效');
    if (generation !== discussionReportGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionReports.value = append ? [...discussionReports.value, ...result.items] : result.items;
    discussionReportTotal.value = result.total;
    discussionReportOffset.value = result.offset + result.items.length;
    discussionReportHasMore.value = discussionReportOffset.value < result.total;
    discussionReportSummary.value = result.summary;
  } catch (caught) {
    if (generation !== discussionReportGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionReportError.value = caught instanceof Error ? caught.message : '无法读取内容举报';
  } finally {
    if (generation === discussionReportGeneration && session === sessionGeneration) discussionReportLoading.value = false;
  }
}

async function updateDiscussionReportStatus(record: ManagedDiscussionReport, status: DiscussionReportStatus) {
  if (discussionReportSavingId.value || record.status === status) return;
  const session = sessionGeneration;
  discussionReportSavingId.value = record.id;
  discussionReportActionMessage.value = '';
  discussionReportError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-reports/${encodeURIComponent(record.id)}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ status, revision: record.revision }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法更新举报状态'));
    const result = await response.json() as ManagedDiscussionReport;
    if (!result || result.id !== record.id || !['pending', 'handled', 'dismissed'].includes(result.status)) throw new Error('举报处理结果格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionReportActionMessage.value = status === 'handled' ? '已标记这条举报为已处理。' : status === 'dismissed' ? '已标记这条举报为不采纳。' : '已重新打开这条举报。';
    await refreshDiscussionReports();
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    discussionReportError.value = caught instanceof Error ? caught.message : '无法更新举报状态';
  } finally {
    if (session === sessionGeneration) discussionReportSavingId.value = '';
  }
}

async function loadMoreObservations() {
  if (observationLoadingMore.value || !observationHasMore.value) return;
  const session = sessionGeneration;
  const generation = ++observationRequestGeneration;
  observationLoadingMore.value = true;
  observationMoreError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/observations?${observationQuery(observationOffset.value)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多观察记录'));
    const result = await response.json();
    if (!isManagedObservationPage(result)) throw new Error('观察记录列表格式无效');
    if (generation !== observationRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    observations.value = [...observations.value, ...result.items];
    observationTotal.value = result.total;
    observationOffset.value = result.offset + result.items.length;
    observationHasMore.value = observationOffset.value < result.total;
  } catch (caught) {
    if (generation !== observationRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    observationMoreError.value = caught instanceof Error ? caught.message : '无法加载更多观察记录';
  } finally {
    if (generation === observationRequestGeneration && session === sessionGeneration) observationLoadingMore.value = false;
  }
}

async function loadMoreAudit() {
  if (auditLoadingMore.value || !auditHasMore.value) return;
  const session = sessionGeneration;
  const generation = ++auditRequestGeneration;
  auditLoadingMore.value = true;
  auditMoreError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/audit-logs?${auditQuery(auditOffset.value)}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多操作记录'));
    const result = await response.json();
    if (!isAuditPage(result)) throw new Error('操作记录列表格式无效');
    if (generation !== auditRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    auditLogs.value = [...auditLogs.value, ...result.rows];
    auditTotal.value = result.total;
    auditOffset.value = result.offset + result.rows.length;
    auditHasMore.value = auditOffset.value < result.total;
  } catch (caught) {
    if (generation !== auditRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    auditMoreError.value = caught instanceof Error ? caught.message : '无法加载更多操作记录';
  } finally {
    if (generation === auditRequestGeneration && session === sessionGeneration) auditLoadingMore.value = false;
  }
}

async function reencryptObservations() {
  if (reencrypting.value || (!reencryptCursor.value && !window.confirm('确认分批扫描并保护历史观察答案？每次最多扫描 100 条。'))) return;
  const session = sessionGeneration;
  reencrypting.value = true;
  error.value = '';
  reencryptMessage.value = '';
  try {
    const params = new URLSearchParams({ limit: '100' });
    if (reencryptCursor.value) {
      params.set('afterUpdatedAt', reencryptCursor.value.updatedAt);
      params.set('afterId', reencryptCursor.value.id);
    }
    const response = await apiFetch(`${apiBase}/admin/observations/reencrypt?${params}`, { method: 'POST', headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '历史观察答案暂时无法加密'));
    const result = await response.json();
    if (!isReencryptResult(result)) throw new Error('历史答案保护结果格式无效，请刷新后台后重试');
    reencryptCursor.value = result.hasMore ? result.nextCursor : null;
    if (result.failed || result.invalid) {
      error.value = `本批扫描 ${result.scanned} 条，保护 ${result.processed} 条；${result.failed} 条解密失败，${result.invalid} 条封装格式异常，请保留旧密钥并人工处理。`;
      reencryptMessage.value = result.hasMore ? '本批已结束，仍有后续记录；处理异常记录后可继续扫描。' : '扫描已结束，请处理异常记录。';
    } else if (result.hasMore) {
      reencryptMessage.value = `本批扫描 ${result.scanned} 条，保护 ${result.processed} 条；仍有后续记录，可继续执行。`;
    } else {
      reencryptMessage.value = `历史答案扫描完成：共处理本批 ${result.scanned} 条，保护 ${result.processed} 条。`;
    }
    assertSession(session);
    await refreshObservations();
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '历史观察答案暂时无法加密';
  } finally {
    if (session === sessionGeneration) reencrypting.value = false;
  }
}

async function refreshAfterPrivacyAction(expectedSession = sessionGeneration) {
  try {
    await loadDashboard();
  } catch {
    if (expectedSession !== sessionGeneration || !loggedIn.value) return;
    const note = '列表刷新失败，请点击“刷新申请”核对当前状态。';
    if (privacyActionMessage.value) privacyActionMessage.value += ` ${note}`;
    else privacyActionError.value = `${privacyActionError.value} ${note}`.trim();
  }
}

async function processPrivacy(id: string) {
  if (privacyControlsBusy.value) return;
  if (!window.confirm('确认执行这条已到期的账户删除申请？执行后用户数据将被永久删除。')) return;
  processingPrivacyId.value = id;
  const session = sessionGeneration;
  error.value = '';
  privacyActionMessage.value = '';
  privacyActionError.value = '';
  let outcomeReceived = false;
  try {
    const response = await apiFetch(`${apiBase}/admin/privacy-requests/${id}/process`, { method: 'POST', headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '账户删除申请暂时无法执行'));
    const result = await response.json();
    if (!isPrivacyProcessResult(result)) throw new Error('服务未返回可识别的执行结果');
    outcomeReceived = true;
    if (result.outcome === 'completed') privacyActionMessage.value = '账户删除已完成。';
    else if (result.outcome === 'retry_scheduled') {
      const attemptCount = result.attemptCount;
      privacyActionError.value = typeof attemptCount === 'number' && Number.isSafeInteger(attemptCount) && attemptCount > 0
        ? `删除未完成，已安排第 ${attemptCount} 次自动重试；下次尝试时间见申请列表。`
        : '删除未完成，已安排自动重试；重试次数未能确认，请刷新申请列表查看。';
    }
    else if (result.outcome === 'failed') privacyActionError.value = '删除已达到自动重试上限，申请已标记失败，可从列表重新排队。';
    else if (result.outcome === 'disabled') privacyActionError.value = '账户删除任务当前关闭，申请未执行。';
    else if (result.outcome === 'recovery_unavailable') privacyActionError.value = '删除执行失败，重试状态未能写入，请检查数据库后刷新申请。';
    else if (result.outcome === 'not_ready') privacyActionError.value = '申请未执行，可能尚未到期或已被其他任务处理。';
    else privacyActionError.value = '服务返回了未知执行状态，请刷新申请列表核实。';
    await refreshAfterPrivacyAction(session);
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    const detail = caught instanceof Error ? caught.message : '账户删除申请暂时无法执行';
    privacyActionError.value = outcomeReceived
      ? `${detail}；请刷新申请列表核实当前状态。`
      : `${detail}；请求结果未确认，请刷新申请列表核实后再决定是否重试。`;
  } finally {
    if (session === sessionGeneration) processingPrivacyId.value = '';
  }
}

async function retryPrivacy(id: string) {
  if (privacyControlsBusy.value || !window.confirm('确认重新排队这条失败的账户删除申请？系统会重新开始删除尝试。')) return;
  retryingPrivacyId.value = id;
  const session = sessionGeneration;
  error.value = '';
  privacyActionMessage.value = '';
  privacyActionError.value = '';
  let resultReceived = false;
  try {
    const response = await apiFetch(`${apiBase}/admin/privacy-requests/${id}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '账户删除申请暂时无法重新排队'));
    const result = await response.json();
    if (!isRetryResult(result)) throw new Error('服务未返回可识别的排队结果');
    resultReceived = true;
    if (result.queued) privacyActionMessage.value = '删除申请已重新排队。';
    else privacyActionError.value = '申请未重新排队，可能已被其他操作处理。';
    await refreshAfterPrivacyAction(session);
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    const detail = caught instanceof Error ? caught.message : '账户删除申请暂时无法重新排队';
    privacyActionError.value = resultReceived
      ? `${detail}；请刷新申请列表核实当前状态。`
      : `${detail}；请求结果未确认，请刷新申请列表核实后再决定是否重试。`;
  } finally {
    if (session === sessionGeneration) retryingPrivacyId.value = '';
  }
}

function clearIssueForm() {
  editingIssueId.value = '';
  editingIssueEditVersion.value = 0;
  originalIssueStatus.value = '';
  issueForm.value = { code: '', label: '', labelRichText: '', month: '', monthRichText: '', theme: '', themeRichText: '', question: '', questionRichText: '', status: 'draft', microVoiceTitle: '', microVoiceDuration: '', coverObjectKey: '', microVoiceObjectKey: '', homeBackgroundObjectKey: '', homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '本期封面', homeCoverCaptionRightRichText: '', draftContent: { sections: createDefaultIssueModules(), discussion: createDefaultDiscussionContent() } };
  selectedIssueModuleId.value = 'cover-story';
  originalIssueForm.value = cloneIssueForm(issueForm.value);
  issueConflict.value = false;
  issueConflictResolved.value = '';
  issueSaveMessage.value = '';
  issueValidationMessage.value = '';
  issueValidationDialogOpen.value = false;
  issueFieldErrors.value = {};
  issueHistory.value = [];
  originalMediaKeys.value = { cover: '', background: '', voice: [] };
  coverFile.value = null;
  voiceFile.value = null;
  mediaPreviewUrls.value = { cover: '', voice: '' };
  mediaPreviewLoading.value = '';
  mediaPreviewError.value = '';
  homeBackgroundPreviewGeneration += 1;
  homeBackgroundPreviewUrl.value = '';
  homeBackgroundPreviewLoading.value = false;
  homeBackgroundError.value = '';
}

function syncIssueFieldsToModules() {
  const modules = issueForm.value.draftContent.sections;
  const coverStory = modules.find((item) => item.type === 'coverStory');
  const cover = coverStory || modules.find((item) => item.type === 'cover');
  const opener = coverStory || modules.find((item) => item.type === 'opener');
  const audio = modules.find((item) => item.type === 'audio');
  const question = modules.find((item) => item.type === 'question');
  const meta = modules.find((item) => item.type === 'issueMeta');
  if (meta) {
    meta.eyebrow = issueForm.value.label;
    meta.eyebrowRichText = issueForm.value.labelRichText;
    meta.month = issueForm.value.month;
    meta.monthRichText = issueForm.value.monthRichText;
  }
  if (cover) {
    issueForm.value.coverObjectKey = String(cover.imageObjectKey || '');
    issueForm.value.homeCoverCaptionLeft = String(cover.captionLeft || '');
    issueForm.value.homeCoverCaptionLeftRichText = typeof cover.captionLeftRichText === 'string' ? cover.captionLeftRichText : '';
    issueForm.value.homeCoverCaptionRight = String(cover.captionRight || '');
    issueForm.value.homeCoverCaptionRightRichText = typeof cover.captionRightRichText === 'string' ? cover.captionRightRichText : '';
  }
  if (opener) {
    const nextTheme = String(opener.title || '').trim();
    if (nextTheme) {
      issueForm.value.theme = nextTheme;
      issueForm.value.themeRichText = typeof opener.titleRichText === 'string' ? opener.titleRichText : '';
    }
    issueForm.value.homeMetaRichText = typeof opener.bodyRichText === 'string' ? opener.bodyRichText : String(opener.body || '');
  }
  if (audio) {
    const firstTrack = audio.tracks?.[0];
    audio.mediaType = firstTrack?.mediaType === 'video' ? 'video' : 'audio';
    audio.audioObjectKey = String(firstTrack?.audioObjectKey || '');
    audio.videoObjectKey = String(firstTrack?.videoObjectKey || '');
    audio.title = String(firstTrack?.title || '');
    audio.titleRichText = firstTrack?.titleRichText || '';
    audio.duration = String(firstTrack?.duration || '');
    audio.detailTitle = String(firstTrack?.detailTitle || '');
    audio.detailTitleRichText = firstTrack?.detailTitleRichText || '';
    audio.description = String(firstTrack?.description || '');
    audio.descriptionRichText = firstTrack?.descriptionRichText || '';
    audio.quote = String(firstTrack?.quote || '');
    audio.quoteRichText = firstTrack?.quoteRichText || '';
    audio.subtitle = String(firstTrack?.subtitle || '');
    audio.subtitleRichText = firstTrack?.subtitleRichText || '';
    audio.transcript = String(firstTrack?.transcript || '');
    audio.transcriptRichText = firstTrack?.transcriptRichText || '';
    issueForm.value.microVoiceObjectKey = String(firstTrack?.audioObjectKey || '');
    issueForm.value.microVoiceTitle = String(firstTrack?.title || '');
    issueForm.value.microVoiceDuration = String(firstTrack?.duration || '');
    audio.enabled = Boolean(audio.tracks?.some((track) => track.mediaType === 'video' ? track.videoObjectKey : track.audioObjectKey));
  }
  if (question) {
    const nextQuestion = String(question.title || '').trim();
    if (nextQuestion) {
      issueForm.value.question = nextQuestion;
      issueForm.value.questionRichText = typeof question.titleRichText === 'string' ? question.titleRichText : '';
    }
  }
}

function moveIssueModule(index: number, direction: -1 | 1) {
  const sections = issueForm.value.draftContent.sections;
  const target = index + direction;
  if (target < 0 || target >= sections.length) return;
  [sections[index], sections[target]] = [sections[target], sections[index]];
  sections.forEach((module, order) => { module.order = order; });
}

const issueModuleLabels: Record<ManagedIssueModule['type'], string> = {
  issueMeta: '刊期信息', coverStory: '封面与主题', cover: '封面图片', opener: '主题开篇', story: '人物纪实',
  storyAction: '人物入口', image: '图片与说明', quote: '引言', audio: '微声音', question: '本期问题',
  observationAction: '观察入口', sharedPracticeAction: '一起谈谈', contents: '本期目录', archive: '策展档案', brandFooter: '品牌页尾',
};

function issueModuleLabel(module: ManagedIssueModule) { return issueModuleLabels[module.type] || module.type; }

function issueModuleSummary(module: ManagedIssueModule) {
  if (module.type === 'audio') return `${module.tracks?.length || (module.audioObjectKey || module.videoObjectKey ? 1 : 0)} 段微声音`;
  const summary = module.title || module.body || module.text || module.caption || module.eyebrow || '';
  return typeof summary === 'string' ? summary : '';
}

function issueModuleSummaryRichText(module: ManagedIssueModule) {
  if (module.type === 'audio') return '';
  if (module.title) return String(module.titleRichText || '');
  if (module.body) return String(module.bodyRichText || '');
  if (module.text) return String(module.textRichText || '');
  if (module.caption) return String(module.captionRichText || '');
  if (module.eyebrow) return String(module.eyebrowRichText || '');
  return '';
}

function removeIssueModule(index: number) {
  const sections = issueForm.value.draftContent.sections;
  if (index < 0 || index >= sections.length) return;
  sections.splice(index, 1);
  sections.forEach((item, order) => { item.order = order; });
  if (!sections.some((module) => module.id === selectedIssueModuleId.value)) {
    selectedIssueModuleId.value = sections[Math.min(index, sections.length - 1)]?.id || '';
  }
}

function issueModuleString(module: ManagedIssueModule, field: string) {
  const value = module[field];
  return typeof value === 'string' ? value : '';
}

type IssueBaseField = 'label' | 'month' | 'theme' | 'question';
type IssueBaseRichField = 'labelRichText' | 'monthRichText' | 'themeRichText' | 'questionRichText';

function issueBaseRichField(field: IssueBaseField): IssueBaseRichField {
  return `${field}RichText` as IssueBaseRichField;
}

function issueBaseModuleTarget(field: IssueBaseField) {
  const modules = issueForm.value.draftContent.sections;
  if (field === 'label' || field === 'month') {
    return modules.find((module) => module.type === 'issueMeta') || null;
  }
  if (field === 'theme') {
    return modules.find((module) => module.type === 'coverStory') || modules.find((module) => module.type === 'cover') || null;
  }
  return modules.find((module) => module.type === 'question') || null;
}

function issueBaseModuleField(field: IssueBaseField) {
  if (field === 'label') return 'eyebrow';
  if (field === 'month') return 'month';
  return 'title';
}

function setIssueBaseField(field: IssueBaseField, value: string) {
  issueForm.value[field] = value;
  const module = issueBaseModuleTarget(field);
  if (module) module[issueBaseModuleField(field)] = value;
  clearIssueFieldError(field);
}

function setIssueBaseRichText(field: IssueBaseField, value: string) {
  issueForm.value[issueBaseRichField(field)] = value;
  const module = issueBaseModuleTarget(field);
  if (module) module[`${issueBaseModuleField(field)}RichText`] = value;
  clearIssueFieldError(field);
}

function setIssueModuleString(module: ManagedIssueModule, field: string, value: string) {
  module[field] = value;
  if (module.type === 'issueMeta') {
    if (field === 'eyebrow') setIssueBaseField('label', value);
    else if (field === 'eyebrowRichText') setIssueBaseRichText('label', value);
    else if (field === 'month') setIssueBaseField('month', value);
    else if (field === 'monthRichText') setIssueBaseRichText('month', value);
  } else if (module.type === 'coverStory' || module.type === 'cover') {
    if (field === 'title') setIssueBaseField('theme', value);
    else if (field === 'titleRichText') setIssueBaseRichText('theme', value);
    else if (field === 'captionLeft') issueForm.value.homeCoverCaptionLeft = value;
    else if (field === 'captionLeftRichText') issueForm.value.homeCoverCaptionLeftRichText = value;
    else if (field === 'captionRight') issueForm.value.homeCoverCaptionRight = value;
    else if (field === 'captionRightRichText') issueForm.value.homeCoverCaptionRightRichText = value;
  } else if (module.type === 'question') {
    if (field === 'title') setIssueBaseField('question', value);
    else if (field === 'titleRichText') setIssueBaseRichText('question', value);
  }
}

function issueAudioTrackString(track: ManagedAudioTrack, field: 'title' | 'detailTitle' | 'description' | 'quote' | 'subtitle' | 'transcript') {
  return track[field] || '';
}

function setIssueAudioTrackRichText(track: ManagedAudioTrack, field: 'title' | 'detailTitle' | 'description' | 'quote' | 'subtitle' | 'transcript', value: string) {
  track[`${field}RichText`] = value;
}

function setIssueAudioTrackPlainText(track: ManagedAudioTrack, field: 'title' | 'detailTitle' | 'description' | 'quote' | 'subtitle' | 'transcript', value: string) {
  track[field] = value;
}

function discussionCopyText(field: keyof DiscussionCopy) {
  return issueForm.value.draftContent.discussion.copy[field] || '';
}

function discussionCopyRichText(field: keyof DiscussionCopy) {
  return issueForm.value.draftContent.discussion.copyRichText?.[field] || '';
}

function setDiscussionCopyRichText(field: keyof DiscussionCopy, value: string) {
  const discussion = issueForm.value.draftContent.discussion;
  const next = { ...(discussion.copyRichText || {}) };
  if (value.trim()) next[field] = value;
  else delete next[field];
  discussion.copyRichText = Object.keys(next).length ? next : undefined;
}

function addDiscussionThread() {
  const id = `example-${Date.now().toString(36)}`;
  issueForm.value.draftContent.discussion.threads.push({ id, author: '示例', body: '', replies: [] });
}

function removeDiscussionThread(index: number) {
  issueForm.value.draftContent.discussion.threads.splice(index, 1);
}

function moveDiscussionThread(index: number, direction: -1 | 1) {
  const threads = issueForm.value.draftContent.discussion.threads;
  const target = index + direction;
  if (target < 0 || target >= threads.length) return;
  [threads[index], threads[target]] = [threads[target], threads[index]];
}

function addDiscussionReply(threadIndex: number) {
  const id = `reply-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  issueForm.value.draftContent.discussion.threads[threadIndex]?.replies.push({ id, author: '编辑追问', body: '' });
}

function removeDiscussionReply(threadIndex: number, replyIndex: number) {
  issueForm.value.draftContent.discussion.threads[threadIndex]?.replies.splice(replyIndex, 1);
}

function moveDiscussionReply(threadIndex: number, replyIndex: number, direction: -1 | 1) {
  const replies = issueForm.value.draftContent.discussion.threads[threadIndex]?.replies;
  if (!replies) return;
  const target = replyIndex + direction;
  if (target < 0 || target >= replies.length) return;
  [replies[replyIndex], replies[target]] = [replies[target], replies[replyIndex]];
}

interface DiscussionPageAdminResponse {
  issueStatus?: string;
  editVersion: number;
  draftContent: DiscussionContent;
  publishedVersion: number;
  publishedAt: string | null;
  published: boolean;
}

async function loadDiscussionPageDraft(force = false) {
  const issueId = editingIssueId.value;
  if (!issueId || (!force && (discussionPageLoading.value || discussionPageLoadedIssueId.value === issueId))) return;
  const issueCode = issueForm.value.code.trim();
  if (!issueCode) return;
  const session = sessionGeneration;
  discussionPageLoading.value = true;
  discussionPageError.value = '';
  discussionPageMessage.value = '';
  try {
    const params = new URLSearchParams({ issueCode });
    const response = await apiFetch(`${apiBase}/content/discussion/manage?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '读取本期讨论草稿失败'));
    const result = await response.json() as DiscussionPageAdminResponse;
    if (!result?.draftContent?.copy || !Array.isArray(result.draftContent.threads)) throw new Error('本期讨论草稿格式无效');
    issueForm.value.draftContent.discussion = result.draftContent;
    originalIssueForm.value.draftContent.discussion = JSON.parse(JSON.stringify(result.draftContent)) as DiscussionContent;
    discussionPageEditVersion.value = Number(result.editVersion) || 0;
    discussionPagePublishedVersion.value = Number(result.publishedVersion) || 0;
    discussionPagePublishedAt.value = result.publishedAt;
    discussionPageLoadedIssueId.value = issueId;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      discussionPageError.value = caught instanceof Error ? caught.message : '读取本期讨论草稿失败';
    }
  } finally {
    if (session === sessionGeneration) discussionPageLoading.value = false;
  }
}

async function saveDiscussionPage(publish = false) {
  if (!editingIssueId.value || discussionPageSaving.value || discussionPagePublishing.value) return;
  const issueCode = issueForm.value.code.trim();
  if (!issueCode) { discussionPageError.value = '请先填写期刊编号。'; return; }
  if (publish) discussionPagePublishing.value = true;
  else discussionPageSaving.value = true;
  discussionPageError.value = '';
  discussionPageMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/content/discussion/manage${publish ? '/publish' : ''}`, {
      method: publish ? 'POST' : 'PUT',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        issueCode,
        content: issueForm.value.draftContent.discussion,
        editVersion: discussionPageEditVersion.value,
      }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.status === 409) throw new Error('本期讨论已在其他位置更新，请刷新页面后再保存。');
    if (!response.ok) throw new Error(await responseMessage(response, publish ? '发布本期讨论失败' : '保存讨论草稿失败'));
    const result = await response.json() as DiscussionPageAdminResponse;
    discussionPageEditVersion.value = Number(result.editVersion) || discussionPageEditVersion.value;
    discussionPagePublishedVersion.value = Number(result.publishedVersion) || discussionPagePublishedVersion.value;
    discussionPagePublishedAt.value = result.publishedAt;
    originalIssueForm.value.draftContent.discussion = JSON.parse(JSON.stringify(issueForm.value.draftContent.discussion)) as DiscussionContent;
    if (publish) {
      discussionPageMessage.value = result.issueStatus === 'published'
        ? `已发布第 ${discussionPagePublishedVersion.value} 版讨论内容，小程序本期讨论已更新。`
        : `讨论内容已发布；该期期刊尚未上线，读者暂时看不到。`;
    } else {
      discussionPageMessage.value = '讨论草稿已单独保存，不会改变线上内容。';
    }
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      discussionPageError.value = caught instanceof Error ? caught.message : '保存本期讨论失败';
    }
  } finally {
    if (session === sessionGeneration) {
      discussionPageSaving.value = false;
      discussionPagePublishing.value = false;
    }
  }
}

function setIssueModuleText(module: ManagedIssueModule, field: string, event: Event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    module[field] = field.endsWith('FontSize') ? Number(target.value) : target.value;
  }
}
function setIssueModuleLinkType(module: ManagedIssueModule, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  module.linkType = target.value;
  if (target.value !== 'page') module.linkPath = '';
  if (target.value !== 'web') module.linkUrl = '';
  if (target.value === 'none') {
    module.linkLabel = '';
    module.linkLabelRichText = '';
  }
}

let issuePreviewGeneration = 0;

async function previewIssueModules() {
  const session = sessionGeneration;
  const generation = ++issuePreviewGeneration;
  for (const module of issueForm.value.draftContent.sections) {
    const media = module.type === 'audio'
      ? (module.tracks || []).map((track) => ({
        key: track.mediaType === 'video' ? track.videoObjectKey || '' : track.audioObjectKey || '',
        previewKey: issueAudioTrackPreviewKey(module.id, track.id),
      }))
      : [{ key: module.imageObjectKey || '', previewKey: module.id }];
    for (const item of media) {
      if (typeof item.key !== 'string' || !item.key) continue;
      if (generation !== issuePreviewGeneration) return;
      const params = new URLSearchParams({ objectKey: item.key });
      try {
        const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
        if (handleAdminUnauthorized(response, session)) return;
        assertSession(session);
        if (!response.ok) continue;
        const result = await response.json();
        // 逐条写入：即使后面某个媒体拿不到预览地址，前面取到的也不会被清空。
        if (isMediaViewTarget(result) && generation === issuePreviewGeneration) {
          issueModulePreviewUrls.value = { ...issueModulePreviewUrls.value, [item.previewKey]: result.url };
        }
      } catch {
        if (generation !== issuePreviewGeneration) return;
      }
    }
  }
}

function issueAudioTrackPreviewKey(moduleId: string, trackId: string) { return `${moduleId}:${trackId}`; }
function issueAudioTracks(module: ManagedIssueModule) { return module.tracks || []; }
function issueDraftMediaKeys(modules: ManagedIssueModule[]) {
  return [...new Set(modules.flatMap((module) => [
    typeof module.imageObjectKey === 'string' ? module.imageObjectKey : '',
    typeof module.audioObjectKey === 'string' ? module.audioObjectKey : '',
    typeof module.videoObjectKey === 'string' ? module.videoObjectKey : '',
    ...(module.tracks || []).flatMap((track) => [track.audioObjectKey || '', track.videoObjectKey || '']),
  ].filter(Boolean)))];
}

function setIssueAudioTrackText(track: ManagedAudioTrack, field: 'title' | 'duration' | 'detailTitle' | 'description' | 'quote' | 'subtitle' | 'transcript', event: Event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    track[field] = target.value;
  }
}

function setIssueAudioTrackMediaType(track: ManagedAudioTrack, module: ManagedIssueModule, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  track.mediaType = target.value === 'video' ? 'video' : 'audio';
  delete issueModulePreviewUrls.value[issueAudioTrackPreviewKey(module.id, track.id)];
  syncIssueFieldsToModules();
}

function addIssueAudioTrack(module: ManagedIssueModule) {
  if (!Array.isArray(module.tracks)) module.tracks = [];
  if (module.tracks.length >= maxIssueAudioTracks) return;
  module.tracks.push(createIssueAudioTrack(module.tracks.length + 1, { id: createEditorRecordId('voice') }));
}

function addIssueAudioAction(track: ManagedAudioTrack) {
  if (!Array.isArray(track.actions)) track.actions = [];
  if (track.actions.length >= maxIssueAudioActions) return;
  track.actions.push(createIssueAudioAction(track.actions.length + 1, {
    id: createEditorRecordId('action'),
    kind: 'page',
    label: '了解更多',
  }));
}

function removeIssueAudioAction(track: ManagedAudioTrack, index: number) {
  if (!Array.isArray(track.actions) || index < 0 || index >= track.actions.length) return;
  track.actions.splice(index, 1);
}

function setIssueAudioActionKind(action: ManagedAudioAction, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const kind: ManagedAudioAction['kind'] = target.value === 'web' || target.value === 'share' ? target.value : 'page';
  action.kind = kind;
  if (kind !== 'page') delete action.path;
  if (kind !== 'web') delete action.url;
  if (kind === 'share' && !action.label.trim()) action.label = '分享给朋友';
}

function setIssueAudioActionText(action: ManagedAudioAction, field: 'label' | 'path' | 'url', event: Event) {
  const target = event.target;
  if (target instanceof HTMLInputElement) action[field] = target.value;
}

function setIssueAudioActionLabelRichText(action: ManagedAudioAction, value: string) {
  action.labelRichText = value;
}

function setIssueAudioActionLabel(action: ManagedAudioAction, value: string) {
  action.label = value;
}

function removeIssueAudioTrack(module: ManagedIssueModule, index: number) {
  if (!module.tracks || index < 0 || index >= module.tracks.length) return;
  const track = module.tracks[index];
  if ((track.audioObjectKey || track.videoObjectKey || track.detailTitle || track.description || track.quote || track.subtitle || track.transcript) && !window.confirm('移除此声音条目？已上传的文件会在保存草稿后按引用情况处理。')) return;
  module.tracks.splice(index, 1);
  syncIssueFieldsToModules();
}

function addIssueModule(type: ManagedIssueModule['type']) {
  const sections = issueForm.value.draftContent.sections;
  const id = `${type}-${Date.now().toString(36)}`;
  const textModule = { id, type, order: sections.length, enabled: true } as ManagedIssueModule;
  if (type === 'story') Object.assign(textModule, { eyebrow: '人物纪实', title: '', body: '', imageObjectKey: '', altText: '', captionLeft: '', captionRight: '' });
  else if (type === 'opener') Object.assign(textModule, { eyebrow: '本期主题', title: '', body: '' });
  else if (type === 'storyAction') Object.assign(textModule, { title: '进入本期人物', body: '', targetId: 'story' });
  else if (type === 'image') Object.assign(textModule, { imageObjectKey: '', altText: '', caption: '' });
  else if (type === 'quote') Object.assign(textModule, { text: '', attribution: '' });
  else if (type === 'audio') Object.assign(textModule, { title: '', duration: '', mediaType: 'audio', audioObjectKey: '', videoObjectKey: '', detailTitle: '', description: '', quote: '', subtitle: '', transcript: '', tracks: [createIssueAudioTrack(1)] });
  else if (type === 'archive') Object.assign(textModule, { title: '策展档案', body: '', entryLabel: '', entryTitle: '' });
  else Object.assign(textModule, { title: '', body: '' });
  sections.push(textModule);
  selectedIssueModuleId.value = id;
}

async function publishIssue() {
  if (!editingIssueId.value || uploading.value || issueConflict.value) return;
  error.value = '';
  issueSaveMessage.value = '';
  issueValidationMessage.value = '';
  issueValidationDialogOpen.value = false;
  seedIssueModulesFromForm();
  syncIssueFieldsToModules();
  if (!(await validateIssueRequiredFields())) return;
  if (!window.confirm('确认发布当前草稿？发布后会立即替换小程序首页期刊。')) return;
  uploading.value = true;
  const session = sessionGeneration;
  error.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/issues/${editingIssueId.value}/publish`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify({ editVersion: editingIssueEditVersion.value }) });
    if (handleAdminUnauthorized(response, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (response.status === 409) issueConflict.value = true;
    if (!response.ok) throw new Error(await responseMessage(response, '发布期刊失败'));
    const result = await response.json();
    issueSaveMessage.value = `已发布第 ${result.version} 个版本；本期所有模块已同时上线。`;
    issueConflict.value = false;
    issueFieldErrors.value = {};
    issueValidationMessage.value = '';
    issueValidationDialogOpen.value = false;
    issueForm.value.status = 'published';
    originalIssueStatus.value = 'published';
    editingIssueEditVersion.value += 1;
    originalIssueForm.value = cloneIssueForm(issueForm.value);
    await loadDashboard();
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      const message = caught instanceof Error ? caught.message : '发布期刊失败';
      if (!applyIssueApiFieldError(message)) error.value = message;
    }
  } finally { if (session === sessionGeneration) uploading.value = false; }
}

async function loadIssueHistory() {
  if (!editingIssueId.value) return;
  try {
    const response = await apiFetch(`${apiBase}/content/issues/${editingIssueId.value}/history`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取发布历史'));
    issueHistory.value = await response.json();
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '无法读取发布历史'; }
}

function formatIssueMeta(tag: 'strong' | 'em' | 'u' | 'br') {
  const editor = issueMetaRichTextInput.value;
  if (!editor || uploading.value || issueConflict.value) return;
  const value = issueForm.value.homeMetaRichText;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = value.slice(start, end);
  const open = tag === 'br' ? '' : `<${tag}>`;
  const close = tag === 'br' ? '<br/>' : `</${tag}>`;
  const inserted = tag === 'br' ? close : `${open}${selected || '文字'}${close}`;
  issueForm.value.homeMetaRichText = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
  void nextTick(() => {
    editor.focus();
    const cursor = start + inserted.length;
    editor.setSelectionRange(cursor, cursor);
  });
}

async function previewMedia(kind: 'cover' | 'voice') {
  if (uploading.value || mediaPreviewLoading.value) return;
  const objectKey = kind === 'cover' ? issueForm.value.coverObjectKey : issueForm.value.microVoiceObjectKey;
  const prefix = kind === 'cover' ? 'content/image/' : 'content/audio/';
  if (!isManagedMediaKey(objectKey, prefix)) {
    mediaPreviewError.value = '请先上传有效的媒体文件。';
    return;
  }
  const session = sessionGeneration;
  mediaPreviewLoading.value = kind;
  mediaPreviewError.value = '';
  try {
    const params = new URLSearchParams({ objectKey });
    const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法生成媒体预览地址'));
    const result = await response.json();
    if (!isMediaViewTarget(result)) throw new Error('服务器未返回有效的媒体预览地址');
    mediaPreviewUrls.value = { ...mediaPreviewUrls.value, [kind]: result.url };
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) mediaPreviewError.value = caught instanceof Error ? caught.message : '无法生成媒体预览地址';
  } finally {
    if (session === sessionGeneration) mediaPreviewLoading.value = '';
  }
}

async function loadHomeBackgroundPreview(objectKey = issueForm.value.homeBackgroundObjectKey, expectedSession = sessionGeneration) {
  const generation = ++homeBackgroundPreviewGeneration;
  homeBackgroundError.value = '';
  if (!objectKey) {
    homeBackgroundPreviewUrl.value = '';
    homeBackgroundPreviewLoading.value = false;
    return;
  }
  if (!isManagedMediaKey(objectKey, 'content/image/')) {
    homeBackgroundPreviewUrl.value = '';
    homeBackgroundPreviewLoading.value = false;
    homeBackgroundError.value = '首页底图路径无效，请重新上传。';
    return;
  }
  homeBackgroundPreviewLoading.value = true;
  try {
    const params = new URLSearchParams({ objectKey });
    const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, expectedSession)) return;
    assertSession(expectedSession);
    if (!response.ok) throw new Error(await responseMessage(response, '无法生成首页底图预览'));
    const result = await response.json();
    if (!isMediaViewTarget(result)) throw new Error('服务器未返回有效的首页底图预览地址');
    if (generation === homeBackgroundPreviewGeneration && expectedSession === sessionGeneration) {
      homeBackgroundPreviewUrl.value = result.url;
    }
  } catch (caught) {
    if (generation === homeBackgroundPreviewGeneration && expectedSession === sessionGeneration && loggedIn.value) {
      homeBackgroundPreviewUrl.value = '';
      homeBackgroundError.value = caught instanceof Error ? caught.message : '无法生成首页底图预览';
    }
  } finally {
    if (generation === homeBackgroundPreviewGeneration && expectedSession === sessionGeneration) {
      homeBackgroundPreviewLoading.value = false;
    }
  }
}

function openHomeBackgroundPicker() {
  if (uploading.value || issueConflict.value) return;
  homeBackgroundFileInput.value?.click();
}

async function selectHomeBackgroundFile(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || uploading.value || issueConflict.value) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    homeBackgroundError.value = '首页底图仅支持 JPG、PNG 或 WebP。';
    return;
  }
  homeBackgroundError.value = '';
  requestImageCrop(file, '编辑首页底图', (croppedFile) => uploadHomeBackgroundFile(croppedFile));
}

async function uploadHomeBackgroundFile(file: File) {
  const session = sessionGeneration;
  uploading.value = true;
  homeBackgroundError.value = '';
  try {
    const objectKey = await uploadMedia(file, 'image', session);
    assertSession(session);
    issueForm.value.homeBackgroundObjectKey = objectKey;
    await loadHomeBackgroundPreview(objectKey, session);
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      homeBackgroundError.value = caught instanceof Error ? caught.message : '首页底图上传失败';
    }
  } finally {
    if (session === sessionGeneration) {
      uploading.value = false;
      homeBackgroundPreviewLoading.value = false;
    }
  }
}

function removeHomeBackground() {
  if (uploading.value || issueConflict.value) return;
  issueForm.value.homeBackgroundObjectKey = '';
  homeBackgroundPreviewGeneration += 1;
  homeBackgroundPreviewUrl.value = '';
  homeBackgroundPreviewLoading.value = false;
  homeBackgroundError.value = '';
}

async function deleteUnusedMedia(objectKey: string, purpose: 'orphan' | 'temporary', cleanupToken?: string, expectedSession = sessionGeneration) {
  const response = await apiFetch(`${apiBase}/content/media`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
    body: JSON.stringify({ objectKey, purpose, ...(cleanupToken ? { cleanupToken } : {}) }),
  });
  if (handleAdminUnauthorized(response, expectedSession)) {
    throw new Error('后台登录已过期，请重新登录。');
  }
  if (response.status === 409) {
    const conflict = await response.clone().json().catch(() => null);
    if (conflict?.code === 'media_protected') return 'protected';
    if (conflict?.code === 'media_referenced') return 'referenced';
    throw new Error(conciseResponseMessage(typeof conflict?.message === 'string' ? conflict.message : '媒体回收状态冲突，请重新扫描核实'));
  }
  if (response.status === 403) {
    const failure = await response.clone().json().catch(() => null);
    if (failure?.code === 'media_cleanup_token_invalid') return 'credential_invalid';
  }
  if (!response.ok) throw new Error(await responseMessage(response, '媒体文件未能回收，请稍后重试'));
  const result = await response.json().catch(() => null);
  if (!isMediaDeleteResult(result)) {
    throw new Error('媒体删除结果未能确认，请重新扫描核实');
  }
  return result.auditRecorded ? 'deleted' : 'deleted_without_audit';
}

async function loadOrphanMedia(reset = true) {
  if (orphanMediaLoading.value || (!reset && !orphanMediaHasMore.value)) return;
  const session = sessionGeneration;
  const generation = ++orphanMediaRequestGeneration;
  orphanMediaLoading.value = true;
  orphanMediaError.value = '';
  if (reset) orphanMediaMessage.value = '';
  try {
    const params = new URLSearchParams({ limit: '50' });
    if (!reset && orphanMediaToken.value) params.set('continuationToken', orphanMediaToken.value);
    const response = await apiFetch(`${apiBase}/content/media/orphans?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取未引用媒体'));
    const result = await response.json();
    if (!isMediaOrphanPage(result)) throw new Error('未引用媒体列表格式无效');
    if (generation !== orphanMediaRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    const current = reset ? [] : orphanMedia.value;
    const knownKeys = new Set(current.map((item) => item.objectKey));
    orphanMedia.value = [...current, ...result.items.filter((item) => !knownKeys.has(item.objectKey))];
    orphanMediaToken.value = result.continuationToken || '';
    orphanMediaHasMore.value = Boolean(result.hasMore);
    orphanMediaGraceHours.value = result.graceHours;
    orphanMediaScanned.value = true;
  } catch (caught) {
    if (generation === orphanMediaRequestGeneration && session === sessionGeneration && loggedIn.value) orphanMediaError.value = caught instanceof Error ? caught.message : '无法读取未引用媒体';
  } finally {
    if (generation === orphanMediaRequestGeneration && session === sessionGeneration) orphanMediaLoading.value = false;
  }
}

async function loadAudioLibrary(reset = true) {
  if (audioLibraryLoading.value || (!reset && !audioLibraryHasMore.value)) return;
  const session = sessionGeneration;
  const generation = ++audioLibraryRequestGeneration;
  audioLibraryLoading.value = true;
  audioLibraryError.value = '';
  try {
    const params = new URLSearchParams({ limit: '50' });
    if (!reset && audioLibraryToken.value) params.set('continuationToken', audioLibraryToken.value);
    const response = await apiFetch(`${apiBase}/content/media/audio?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取已上传音频'));
    const result = await response.json();
    if (!isMediaAudioPage(result)) throw new Error('音频库列表格式无效');
    if (generation !== audioLibraryRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    const current = reset ? [] : audioLibrary.value;
    const knownKeys = new Set(current.map((item) => item.objectKey));
    audioLibrary.value = [...current, ...result.items.filter((item) => !knownKeys.has(item.objectKey))];
    audioLibraryToken.value = result.continuationToken || '';
    audioLibraryHasMore.value = result.hasMore;
    audioLibraryScanned.value = true;
    if (reset) audioLibraryPreviewUrls.value = {};
  } catch (caught) {
    if (generation === audioLibraryRequestGeneration && session === sessionGeneration && loggedIn.value) audioLibraryError.value = caught instanceof Error ? caught.message : '无法读取已上传音频';
  } finally {
    if (generation === audioLibraryRequestGeneration && session === sessionGeneration) audioLibraryLoading.value = false;
  }
}

async function previewAudioLibraryItem(objectKey: string) {
  if (audioLibraryPreviewLoading.value) return;
  const session = sessionGeneration;
  audioLibraryPreviewLoading.value = objectKey;
  audioLibraryError.value = '';
  try {
    const params = new URLSearchParams({ objectKey });
    const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法生成音频试听地址'));
    const result = await response.json();
    if (!isMediaViewTarget(result)) throw new Error('服务器未返回有效的音频试听地址');
    audioLibraryPreviewUrls.value = { ...audioLibraryPreviewUrls.value, [objectKey]: result.url };
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) audioLibraryError.value = caught instanceof Error ? caught.message : '无法生成音频试听地址';
  } finally {
    if (session === sessionGeneration) audioLibraryPreviewLoading.value = '';
  }
}

async function removeOrphanMedia(objectKey: string) {
  if (orphanMediaDeleting.value) return;
  if (!window.confirm(`确认永久删除超过保护期且未被期刊引用的媒体对象？\n${objectKey}`)) return;
  orphanMediaDeleting.value = objectKey;
  const session = sessionGeneration;
  orphanMediaError.value = '';
  orphanMediaMessage.value = '';
  try {
    const result = await deleteUnusedMedia(objectKey, 'orphan', undefined, session);
    await loadOrphanMedia(true);
    assertSession(session);
    orphanMediaMessage.value = result === 'referenced'
      ? '对象已被期刊引用，服务端拒绝删除并已保留。'
      : result === 'protected'
        ? '对象仍在保护期内或修改时间无法确认，服务端拒绝删除；请重新扫描后再试。'
        : result === 'deleted_without_audit'
          ? '媒体对象已删除，删除发起记录已保留，但完成审计暂未写入。'
          : '媒体对象已删除。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) orphanMediaError.value = caught instanceof Error ? caught.message : '媒体对象未能删除';
  } finally {
    if (session === sessionGeneration) orphanMediaDeleting.value = '';
  }
}

async function cleanupMedia(input: MediaCleanupCandidate[], expectedSession = sessionGeneration) {
  const remaining: MediaCleanupCandidate[] = [];
  let auditFailures = 0;
  let protectedCount = 0;
  let referencedCount = 0;
  const candidatesByKey = new Map<string, MediaCleanupCandidate>();
  for (const candidate of input) {
    if (candidate.objectKey && !candidate.objectKey.startsWith('content/audio/')) candidatesByKey.set(candidate.objectKey, candidate);
  }
  const candidates = [...candidatesByKey.values()];
  for (const [index, candidate] of candidates.entries()) {
    try {
      assertSession(expectedSession);
      let result = await deleteUnusedMedia(candidate.objectKey, candidate.purpose, candidate.cleanupToken, expectedSession);
      assertSession(expectedSession);
      if (result === 'credential_invalid' && candidate.purpose === 'temporary') {
        result = await deleteUnusedMedia(candidate.objectKey, 'orphan', undefined, expectedSession);
      }
      if (result === 'protected') { protectedCount += 1; continue; }
      if (result === 'referenced') { referencedCount += 1; continue; }
      if (result === 'deleted_without_audit') auditFailures += 1;
    } catch (caught) {
      if (expectedSession !== sessionGeneration) throw caught;
      remaining.push(candidate);
      if (!loggedIn.value) {
        remaining.push(...candidates.slice(index + 1));
        break;
      }
    }
  }
  return { remaining, auditFailures, protectedCount, referencedCount };
}

async function cleanupCandidates() {
  const expectedSession = sessionGeneration;
  const candidates = uploadedMediaKeys.value.filter((objectKey) => !objectKey.startsWith('content/audio/') && !objectKey.startsWith('content/video/')).map((objectKey): MediaCleanupCandidate => {
    const cleanupToken = mediaCleanupTokens.value[objectKey];
    return cleanupToken ? { objectKey, purpose: 'temporary', cleanupToken } : { objectKey, purpose: 'orphan' };
  });
  const { remaining, auditFailures, protectedCount, referencedCount } = await cleanupMedia(candidates, expectedSession);
  assertSession(expectedSession);
  uploadedMediaKeys.value = remaining.map((item) => item.objectKey);
  persistCleanupKeys();
  const notices: string[] = [];
  if (remaining.length) notices.push('有未能回收的临时媒体文件，请检查网络后重试。');
  if (protectedCount) notices.push(`另有 ${protectedCount} 个旧媒体仍在保护期内，后续可在未引用媒体列表中回收。`);
  if (referencedCount) notices.push(`${referencedCount} 个媒体仍被期刊引用，服务端已保留。`);
  if (auditFailures) notices.push(`${auditFailures} 条媒体已删除，发起记录已保留，但完成审计暂未写入。`);
  if (remaining.length) throw new Error(notices.join(''));
  if (notices.length) error.value = notices.join('');
}

async function editIssue(issue: ManagedIssue) {
  if (uploading.value) return;
  if (issueDraftDirty.value && editingIssueId.value && editingIssueId.value !== issue.id && !window.confirm('当前期刊有未保存的修改。切换期刊会放弃这些修改，继续吗？')) return;
  const session = sessionGeneration;
  try {
    await cleanupCandidates();
    assertSession(session);
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '临时媒体文件未能回收';
    return;
  }
  editingIssueId.value = issue.id;
  issueHistory.value = [];
  issueModulePreviewUrls.value = {};
  discussionPageLoadedIssueId.value = '';
  discussionPageEditVersion.value = 0;
  discussionPagePublishedVersion.value = 0;
  discussionPagePublishedAt.value = null;
  discussionPageMessage.value = '';
  discussionPageError.value = '';
  editingIssueEditVersion.value = issue.editVersion;
  originalIssueStatus.value = issue.status;
  issueForm.value = { code: issue.code, label: issue.label, labelRichText: issue.labelRichText || '', month: issue.month, monthRichText: issue.monthRichText || '', theme: issue.theme, themeRichText: issue.themeRichText || '', question: issue.question, questionRichText: issue.questionRichText || '', status: issue.status, microVoiceTitle: issue.microVoiceTitle || '', microVoiceDuration: issue.microVoiceDuration || '', coverObjectKey: issue.coverObjectKey || '', microVoiceObjectKey: issue.microVoiceObjectKey || '', homeBackgroundObjectKey: issue.homeBackgroundObjectKey || '', homeMetaRichText: issue.homeMetaRichText, homeMetaFontSize: issue.homeMetaFontSize, homeMetaColor: issue.homeMetaColor, homeCoverCaptionLeft: issue.homeCoverCaptionLeft, homeCoverCaptionLeftRichText: issue.homeCoverCaptionLeftRichText || '', homeCoverCaptionRight: issue.homeCoverCaptionRight, homeCoverCaptionRightRichText: issue.homeCoverCaptionRightRichText || '', draftContent: { sections: combineCoverAndOpener(issue.draftContent?.sections || createDefaultIssueModules()), discussion: issue.draftContent?.discussion || createDefaultDiscussionContent() } };
  selectedIssueModuleId.value = issueForm.value.draftContent.sections.find((module) => module.type === 'coverStory')?.id || issueForm.value.draftContent.sections[0]?.id || '';
  originalIssueForm.value = cloneIssueForm(issueForm.value);
  issueConflict.value = false;
  issueConflictResolved.value = '';
  issueSaveMessage.value = '';
  issueValidationMessage.value = '';
  issueValidationDialogOpen.value = false;
  issueFieldErrors.value = {};
  originalMediaKeys.value = {
    cover: issue.coverObjectKey || '',
    background: issue.homeBackgroundObjectKey || '',
    voice: [...new Set([issue.microVoiceObjectKey || '', ...issueDraftMediaKeys(issueForm.value.draftContent.sections).filter((key) => key.startsWith('content/audio/'))].filter(Boolean))],
  };
  coverFile.value = null;
  voiceFile.value = null;
  mediaPreviewUrls.value = { cover: '', voice: '' };
  mediaPreviewError.value = '';
  void loadHomeBackgroundPreview(issue.homeBackgroundObjectKey || '', session);
  ensureJournalModuleSelection();
  if (activeContentSection.value === 'journal-discussion') void loadDiscussionPageDraft();
  void previewIssueModules().catch(() => { mediaPreviewError.value = '部分草稿媒体暂时无法预览'; });
}

async function resetIssue() {
  if (uploading.value) return;
  if (issueConflict.value && !window.confirm('放弃当前期刊的未保存修改？云端内容不会改变。')) return;
  const session = sessionGeneration;
  try {
    await cleanupCandidates();
    assertSession(session);
    clearIssueForm();
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '临时媒体文件未能回收';
  }
}

function issueLifecycleActionLabel(action: IssueLifecycleAction) {
  if (action === 'archive') return '归档';
  if (action === 'restore') return '恢复为草稿';
  return '删除';
}

function openIssueLifecycleAction(issue: ManagedIssue, action: IssueLifecycleAction) {
  if (issueActionBusy.value) return;
  issueActionError.value = '';
  pendingIssueAction.value = { issue, action };
}

function closeIssueLifecycleAction() {
  if (issueActionBusy.value) return;
  pendingIssueAction.value = null;
  issueActionError.value = '';
}

async function confirmIssueLifecycleAction() {
  const pending = pendingIssueAction.value;
  if (!pending || issueActionBusy.value) return;
  issueActionBusy.value = true;
  issueActionError.value = '';
  const session = sessionGeneration;
  try {
    const endpoint = `${apiBase}/content/issues/${pending.issue.id}`;
    const response = pending.action === 'delete'
      ? await apiFetch(endpoint, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
        body: JSON.stringify({ editVersion: pending.issue.editVersion }),
      })
      : await apiFetch(`${endpoint}/lifecycle`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
        body: JSON.stringify({
          editVersion: pending.issue.editVersion,
          status: pending.action === 'archive' ? 'archived' : 'draft',
        }),
      });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, `${issueLifecycleActionLabel(pending.action)}期刊失败`));
    await loadDashboard();
    assertSession(session);

    if (pending.action === 'delete' && editingIssueId.value === pending.issue.id) {
      clearIssueForm();
      await cleanupCandidates().catch(() => undefined);
      const nextIssue = issues.value.find((item) => item.status === 'published') || issues.value[0];
      if (nextIssue) await editIssue(nextIssue);
    } else if (editingIssueId.value === pending.issue.id) {
      const refreshed = issues.value.find((item) => item.id === pending.issue.id);
      if (refreshed) {
        issueForm.value.status = refreshed.status;
        editingIssueEditVersion.value = refreshed.editVersion;
        originalIssueStatus.value = refreshed.status;
      }
    }

    const message = pending.action === 'archive'
      ? `期刊 ${pending.issue.code} 已归档，线上首页会同步切换。`
      : pending.action === 'restore'
        ? `期刊 ${pending.issue.code} 已恢复为草稿，可继续编辑或重新发布。`
        : `期刊 ${pending.issue.code} 已永久删除。`;
    pendingIssueAction.value = null;
    issueSaveMessage.value = message;
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      issueActionError.value = caught instanceof Error ? caught.message : `${issueLifecycleActionLabel(pending.action)}期刊失败，请稍后重试。`;
    }
  } finally {
    if (session === sessionGeneration) issueActionBusy.value = false;
  }
}

async function uploadMedia(file: File, kind: 'image' | 'audio' | 'video', expectedSession = sessionGeneration) {
  const urlResponse = await apiFetch(`${apiBase}/content/media/upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, kind }),
  });
  if (handleAdminUnauthorized(urlResponse, expectedSession)) throw new Error('后台登录已过期，请重新登录。');
  assertSession(expectedSession);
  if (!urlResponse.ok) throw new Error(await responseMessage(urlResponse, '无法创建媒体上传地址'));
  const target = await urlResponse.json();
  if (!isMediaUploadTarget(target)) {
    throw new Error('服务器未返回有效的临时媒体清理凭证');
  }
  uploadedMediaKeys.value.push(target.objectKey);
  mediaCleanupTokens.value[target.objectKey] = target.cleanupToken;
  persistCleanupKeys();
  const uploadResponse = await apiFetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file }, mediaUploadTimeoutMs);
  assertSession(expectedSession);
  if (!uploadResponse.ok) throw new Error(await responseMessage(uploadResponse, '媒体上传失败'));
  return target.objectKey as string;
}

function selectIssueModuleFile(module: ManagedIssueModule, event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (module.type === 'audio') {
    void uploadIssueModuleMedia(module, file);
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = '栏目图片仅支持 JPG、PNG 或 WebP。';
    return;
  }
  error.value = '';
  requestImageCrop(file, `编辑${issueModuleLabel(module)}图片`, (croppedFile) => uploadIssueModuleMedia(module, croppedFile));
}

async function uploadIssueModuleMedia(module: ManagedIssueModule, file: File) {
  const session = sessionGeneration;
  uploading.value = true;
  try {
    const kind = module.type === 'audio' ? 'audio' : 'image';
    const objectKey = await uploadMedia(file, kind, session);
    assertSession(session);
    if (kind === 'audio') {
      if (module.tracks?.[0]) module.tracks[0].audioObjectKey = objectKey;
      module.audioObjectKey = objectKey;
    }
    else module.imageObjectKey = objectKey;
    if (module.type === 'cover' || module.type === 'coverStory') issueForm.value.coverObjectKey = objectKey;
    if (module.type === 'audio') {
      issueForm.value.microVoiceObjectKey = objectKey;
      syncIssueFieldsToModules();
    }
    const params = new URLSearchParams({ objectKey });
    const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.ok) {
      const result = await response.json();
      if (isMediaViewTarget(result)) issueModulePreviewUrls.value = { ...issueModulePreviewUrls.value, [module.id]: result.url };
    }
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '媒体上传失败';
  } finally {
    if (session === sessionGeneration) uploading.value = false;
  }
}

async function selectIssueAudioTrackFile(module: ManagedIssueModule, track: ManagedAudioTrack, event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const session = sessionGeneration;
  uploading.value = true;
  try {
    const kind = track.mediaType === 'video' ? 'video' : 'audio';
    const objectKey = await uploadMedia(file, kind, session);
    if (kind === 'video') track.videoObjectKey = objectKey;
    else track.audioObjectKey = objectKey;
    syncIssueFieldsToModules();
    const params = new URLSearchParams({ objectKey });
    const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.ok) {
      const result = await response.json();
      if (isMediaViewTarget(result)) {
        issueModulePreviewUrls.value = { ...issueModulePreviewUrls.value, [issueAudioTrackPreviewKey(module.id, track.id)]: result.url };
      }
    }
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '微声音上传失败';
  } finally {
    if (session === sessionGeneration) uploading.value = false;
  }
}

type IssueRequiredField = {
  key: IssueFieldKey;
  label: string;
  module: '刊期信息' | '封面与主题' | '本期问题';
  maxLength: number;
  required?: boolean;
};
const issueRequiredFields: IssueRequiredField[] = [
  { key: 'code', label: '期刊编号', module: '刊期信息', maxLength: 64 },
  { key: 'label', label: '期刊标签', module: '刊期信息', maxLength: 80 },
  { key: 'month', label: '刊期月份', module: '刊期信息', maxLength: 40 },
  { key: 'edition', label: '英文刊期标识', module: '刊期信息', maxLength: 40, required: false },
  { key: 'theme', label: '本期主题', module: '封面与主题', maxLength: 200 },
  { key: 'question', label: '本期问题', module: '本期问题', maxLength: 500 },
];

function issueFieldDefinition(key: IssueFieldKey) {
  return issueRequiredFields.find((field) => field.key === key) || null;
}

function firstIssueFieldError() {
  return issueRequiredFields.find((field) => issueFieldErrors.value[field.key]) || null;
}

function updateIssueValidationSummary() {
  const field = firstIssueFieldError();
  issueValidationMessage.value = field ? `请完善「${field.module}」：${issueFieldErrors.value[field.key]}。` : '';
}

async function closeIssueValidationDialog() {
  issueValidationDialogOpen.value = false;
  const key = firstIssueFieldError()?.key;
  if (!key) return;
  await nextTick();
  requestAnimationFrame(() => void focusIssueField(key));
}

function clearIssueFieldError(key: IssueFieldKey) {
  if (!issueFieldErrors.value[key]) return;
  const next = { ...issueFieldErrors.value };
  delete next[key];
  issueFieldErrors.value = next;
  updateIssueValidationSummary();
}

function setIssueFieldError(key: IssueFieldKey, message: string) {
  issueFieldErrors.value = { ...issueFieldErrors.value, [key]: message };
  updateIssueValidationSummary();
}

async function focusIssueField(key: IssueFieldKey) {
  if (editingIssueId.value && activeContentSection.value !== 'journal-home') {
    await openJournalSubsection('journal-home');
  }
  if (editingIssueId.value && (key === 'theme' || key === 'question')) {
    const module = issueBaseModuleTarget(key);
    if (module) selectedIssueModuleId.value = module.id;
  }
  await nextTick();
  const field = document.querySelector<HTMLElement>(`[data-issue-field="${key}"]`);
  if (!field) return;
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusTarget = field.matches('input, textarea, select, [contenteditable="true"]')
    ? field
    : field.querySelector<HTMLElement>('.rich-text-canvas[contenteditable="true"]') ||
      field.querySelector<HTMLElement>('input, textarea, select, [contenteditable="true"]');
  focusTarget?.focus({ preventScroll: true });
}

async function validateIssueRequiredFields() {
  const errors: Partial<Record<IssueFieldKey, string>> = {};
  for (const field of issueRequiredFields) {
    const value = field.key === 'edition'
      ? journalIssueEdition.value.trim()
      : String(issueForm.value[field.key] ?? '').trim();
    if (!value) {
      if (field.required !== false) errors[field.key] = `请填写${field.label}`;
      continue;
    }
    if (field.key === 'edition') {
      if (value.length > field.maxLength || /[\r\n<>]/.test(value)) {
        errors[field.key] = `${field.label}需为 40 字以内的单行纯文本`;
      }
      continue;
    }
    if (value.length < 2) errors[field.key] = `${field.label}至少需要 2 个字符`;
    else if (value.length > field.maxLength) errors[field.key] = `${field.label}不能超过 ${field.maxLength} 个字符`;
  }
  issueFieldErrors.value = errors;
  updateIssueValidationSummary();
  const first = firstIssueFieldError();
  issueValidationDialogOpen.value = Boolean(first);
  return !first;
}

function issueFieldKeyFromApiMessage(message: string): IssueFieldKey | null {
  if (/期刊编号|issueCode/i.test(message)) return 'code';
  if (/英文刊期标识|issueMeta[^\n]*edition|字段 edition|edition/i.test(message)) return 'edition';
  if (/期刊标签|label/i.test(message)) return 'label';
  if (/期刊月份|刊期月份|month/i.test(message)) return 'month';
  if (/期刊主题|本期主题|theme/i.test(message)) return 'theme';
  if (/本期问题|question/i.test(message)) return 'question';
  return null;
}

function friendlyIssueApiError(key: IssueFieldKey, message: string) {
  const field = issueFieldDefinition(key);
  if (!field) return message;
  if (key === 'edition') return '英文刊期标识需为 40 字以内的单行纯文本';
  if (/不能为空|required/i.test(message)) return `请填写${field.label}`;
  if (/长度|invalid|无效/i.test(message)) return `${field.label}的内容或长度不符合要求`;
  return `请检查${field.label}`;
}

function applyIssueApiFieldError(message: string) {
  const key = issueFieldKeyFromApiMessage(message);
  if (!key) return false;
  const friendly = friendlyIssueApiError(key, message);
  setIssueFieldError(key, friendly);
  void focusIssueField(key);
  return true;
}

async function saveIssue() {
  if (uploading.value || issueConflict.value) return;
  error.value = '';
  issueConflictResolved.value = '';
  issueValidationMessage.value = '';
  issueValidationDialogOpen.value = false;
  seedIssueModulesFromForm();
  syncIssueFieldsToModules();
  if (!(await validateIssueRequiredFields())) return;
  uploading.value = true;
  const session = sessionGeneration;
  let saved = false;
  try {
    const payload: Omit<typeof issueForm.value, 'status'> & { editVersion?: number } = { ...issueForm.value };
    delete (payload as Partial<typeof issueForm.value>).status;
    if (editingIssueId.value) payload.editVersion = editingIssueEditVersion.value;
    if (coverFile.value) {
      const objectKey = await uploadMedia(coverFile.value, 'image', session);
      issueForm.value.coverObjectKey = objectKey;
      const coverModule = issueForm.value.draftContent.sections.find((module) => module.type === 'coverStory' || module.type === 'cover');
      if (coverModule) coverModule.imageObjectKey = objectKey;
      coverFile.value = null;
      payload.coverObjectKey = objectKey;
    }
    if (voiceFile.value) {
      const objectKey = await uploadMedia(voiceFile.value, 'audio', session);
      issueForm.value.microVoiceObjectKey = objectKey;
      const audioModule = issueForm.value.draftContent.sections.find((module) => module.type === 'audio');
      if (audioModule) {
        const firstTrack = audioModule.tracks?.[0];
        if (firstTrack) firstTrack.audioObjectKey = objectKey;
        audioModule.audioObjectKey = objectKey;
      }
      voiceFile.value = null;
      payload.microVoiceObjectKey = objectKey;
    }
    syncIssueFieldsToModules();
    payload.draftContent = issueDraftContentPayload(issueForm.value.draftContent);
    const url = editingIssueId.value ? `${apiBase}/content/issues/${editingIssueId.value}` : `${apiBase}/content/issues`;
    const response = await apiFetch(url, { method: editingIssueId.value ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify(payload) });
    if (handleAdminUnauthorized(response, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (response.status === 409) {
      const conflict = await response.clone().json().catch(() => null);
      if (editingIssueId.value && ['content_issue_changed', 'content_issue_publish_conflict', 'content_issue_conflict'].includes(conflict?.code)) {
        issueConflict.value = true;
      }
    }
    if (!response.ok) throw new Error(await responseMessage(response, '保存期刊失败'));
    const savedIssue = await response.json().catch(() => null);
    if (savedIssue?.id) editingIssueId.value = savedIssue.id;
    if (Number.isSafeInteger(savedIssue?.editVersion) && savedIssue.editVersion > 0) editingIssueEditVersion.value = savedIssue.editVersion;
    else if (savedIssue?.id) editingIssueEditVersion.value += 1;
    if (typeof savedIssue?.status === 'string' && ['draft', 'published', 'archived'].includes(savedIssue.status)) issueForm.value.status = savedIssue.status;
    saved = true;
    const savedKeys = [...issueDraftMediaKeys(issueForm.value.draftContent.sections), issueForm.value.homeBackgroundObjectKey].filter((key): key is string => Boolean(key));
    const unsavedUploadedKeys = uploadedMediaKeys.value.filter((key) => !savedKeys.includes(key));
    const obsoleteKeys = [...new Set([...unsavedUploadedKeys, originalMediaKeys.value.cover, originalMediaKeys.value.background].filter((key) => key && !savedKeys.includes(key) && !key.startsWith('content/audio/') && !key.startsWith('content/video/')))];
    const candidates = obsoleteKeys.map((objectKey): MediaCleanupCandidate => {
      const cleanupToken = mediaCleanupTokens.value[objectKey];
      return cleanupToken ? { objectKey, purpose: 'temporary', cleanupToken } : { objectKey, purpose: 'orphan' };
    });
    uploadedMediaKeys.value = unsavedUploadedKeys.filter((key) => !key.startsWith('content/audio/') && !key.startsWith('content/video/'));
    persistCleanupKeys();
    originalMediaKeys.value = {
      cover: issueForm.value.coverObjectKey || '',
      background: issueForm.value.homeBackgroundObjectKey || '',
      voice: [...new Set([issueForm.value.microVoiceObjectKey || '', ...savedKeys.filter((key) => key.startsWith('content/audio/'))].filter(Boolean))],
    };
    originalIssueForm.value = cloneIssueForm(issueForm.value);
    originalIssueStatus.value = issueForm.value.status;
    issueConflict.value = false;
    issueConflictResolved.value = '';
    issueValidationMessage.value = '';
    issueValidationDialogOpen.value = false;
    issueFieldErrors.value = {};
    issueSaveMessage.value = '草稿已保存。期号、首页、人物、声音与往期入口共用这份草稿；本期讨论也可在讨论页单独保存/发布，整期发布时仍会一并写入期刊快照。';
    const cleanup = await cleanupMedia(candidates, session);
    assertSession(session);
    uploadedMediaKeys.value = cleanup.remaining.map((item) => item.objectKey);
    persistCleanupKeys();
    const failedCleanup = uploadedMediaKeys.value.length > 0;
    const cleanupWarnings: string[] = [];
    if (failedCleanup) cleanupWarnings.push('部分旧媒体文件未能回收，新建或取消编辑时可重试清理。');
    if (cleanup.protectedCount) cleanupWarnings.push(`${cleanup.protectedCount} 个旧媒体仍在保护期内，后续可在未引用媒体列表中回收。`);
    if (cleanup.referencedCount) cleanupWarnings.push(`${cleanup.referencedCount} 个媒体仍被期刊引用，服务端已保留。`);
    if (cleanup.auditFailures) cleanupWarnings.push(`${cleanup.auditFailures} 条媒体对象已删除，发起记录已保留，但完成审计暂未写入。`);
    if (cleanupWarnings.length) issueSaveMessage.value = `草稿已保存，但${cleanupWarnings.join('；')}`;
    try {
      await loadDashboard();
    } catch {
      if (session === sessionGeneration && loggedIn.value) issueSaveMessage.value = '草稿已保存，但列表暂时无法刷新，请稍后重新加载。';
    }
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) {
      if (saved) issueSaveMessage.value = '期刊已保存，但临时媒体文件清理失败。重新开始编辑时可以重试。';
      else {
        const message = caught instanceof Error ? caught.message : '保存期刊失败';
        if (!applyIssueApiFieldError(message)) presentAdminError(message);
      }
    }
  } finally {
    if (session === sessionGeneration) uploading.value = false;
  }
}

async function rebaseIssueEdits() {
  if (!editingIssueId.value || uploading.value || !issueConflict.value) return;
  uploading.value = true;
  const session = sessionGeneration;
  error.value = '';
  issueConflictResolved.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/issues`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取最新期刊版本'));
    const latestIssues = await response.json();
    if (!isManagedIssueList(latestIssues)) throw new Error('期刊列表格式无效，请刷新后台后重试');
    const latest = latestIssues.find((issue) => issue.id === editingIssueId.value);
    if (!latest || !Number.isSafeInteger(latest.editVersion) || latest.editVersion < 1) throw new Error('无法确认期刊的最新版本，请刷新后台后重试');

    const local = { ...issueForm.value };
    const original = originalIssueForm.value;
    const latestForm: IssueForm = {
      code: latest.code,
      label: latest.label,
      labelRichText: latest.labelRichText || '',
      month: latest.month,
      monthRichText: latest.monthRichText || '',
      theme: latest.theme,
      themeRichText: latest.themeRichText || '',
      question: latest.question,
      questionRichText: latest.questionRichText || '',
      status: latest.status,
      microVoiceTitle: latest.microVoiceTitle || '',
      microVoiceDuration: latest.microVoiceDuration || '',
      coverObjectKey: latest.coverObjectKey || '',
      microVoiceObjectKey: latest.microVoiceObjectKey || '',
      homeBackgroundObjectKey: latest.homeBackgroundObjectKey || '',
      homeMetaRichText: latest.homeMetaRichText,
      homeMetaFontSize: latest.homeMetaFontSize,
      homeMetaColor: latest.homeMetaColor,
      homeCoverCaptionLeft: latest.homeCoverCaptionLeft,
      homeCoverCaptionLeftRichText: latest.homeCoverCaptionLeftRichText || '',
      homeCoverCaptionRight: latest.homeCoverCaptionRight,
      homeCoverCaptionRightRichText: latest.homeCoverCaptionRightRichText || '',
      draftContent: {
        sections: combineCoverAndOpener(latest.draftContent?.sections || createDefaultIssueModules()),
        discussion: latest.draftContent?.discussion || createDefaultDiscussionContent(),
      },
    };
    issueForm.value = {
      code: local.code !== original.code ? local.code : latestForm.code,
      label: local.label !== original.label ? local.label : latestForm.label,
      labelRichText: local.labelRichText !== original.labelRichText ? local.labelRichText : latestForm.labelRichText,
      month: local.month !== original.month ? local.month : latestForm.month,
      monthRichText: local.monthRichText !== original.monthRichText ? local.monthRichText : latestForm.monthRichText,
      theme: local.theme !== original.theme ? local.theme : latestForm.theme,
      themeRichText: local.themeRichText !== original.themeRichText ? local.themeRichText : latestForm.themeRichText,
      question: local.question !== original.question ? local.question : latestForm.question,
      questionRichText: local.questionRichText !== original.questionRichText ? local.questionRichText : latestForm.questionRichText,
      status: local.status !== original.status ? local.status : latestForm.status,
      microVoiceTitle: local.microVoiceTitle !== original.microVoiceTitle ? local.microVoiceTitle : latestForm.microVoiceTitle,
      microVoiceDuration: local.microVoiceDuration !== original.microVoiceDuration ? local.microVoiceDuration : latestForm.microVoiceDuration,
      coverObjectKey: local.coverObjectKey !== original.coverObjectKey ? local.coverObjectKey : latestForm.coverObjectKey,
      microVoiceObjectKey: local.microVoiceObjectKey !== original.microVoiceObjectKey ? local.microVoiceObjectKey : latestForm.microVoiceObjectKey,
      homeBackgroundObjectKey: local.homeBackgroundObjectKey !== original.homeBackgroundObjectKey ? local.homeBackgroundObjectKey : latestForm.homeBackgroundObjectKey,
      homeMetaRichText: local.homeMetaRichText !== original.homeMetaRichText ? local.homeMetaRichText : latestForm.homeMetaRichText,
      homeMetaFontSize: local.homeMetaFontSize !== original.homeMetaFontSize ? local.homeMetaFontSize : latestForm.homeMetaFontSize,
      homeMetaColor: local.homeMetaColor !== original.homeMetaColor ? local.homeMetaColor : latestForm.homeMetaColor,
      homeCoverCaptionLeft: local.homeCoverCaptionLeft !== original.homeCoverCaptionLeft ? local.homeCoverCaptionLeft : latestForm.homeCoverCaptionLeft,
      homeCoverCaptionLeftRichText: local.homeCoverCaptionLeftRichText !== original.homeCoverCaptionLeftRichText ? local.homeCoverCaptionLeftRichText : latestForm.homeCoverCaptionLeftRichText,
      homeCoverCaptionRight: local.homeCoverCaptionRight !== original.homeCoverCaptionRight ? local.homeCoverCaptionRight : latestForm.homeCoverCaptionRight,
      homeCoverCaptionRightRichText: local.homeCoverCaptionRightRichText !== original.homeCoverCaptionRightRichText ? local.homeCoverCaptionRightRichText : latestForm.homeCoverCaptionRightRichText,
      draftContent: JSON.stringify(local.draftContent) !== JSON.stringify(original.draftContent) ? local.draftContent : latestForm.draftContent,
    };
    originalIssueForm.value = cloneIssueForm(latestForm);
    originalIssueStatus.value = latest.status;
    editingIssueEditVersion.value = latest.editVersion;
    originalMediaKeys.value = {
      cover: latest.coverObjectKey || '',
      background: latest.homeBackgroundObjectKey || '',
      voice: [...new Set([latest.microVoiceObjectKey || '', ...issueDraftMediaKeys(latestForm.draftContent.sections).filter((key) => key.startsWith('content/audio/'))].filter(Boolean))],
    };
    mediaPreviewUrls.value = { cover: '', voice: '' };
    mediaPreviewError.value = '';
    void loadHomeBackgroundPreview(issueForm.value.homeBackgroundObjectKey, session);
    issues.value = latestIssues;
    issueConflict.value = false;
    issueConflictResolved.value = '已载入云端最新版本，并保留本表单中与原版本不同的字段；请核对后再保存。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '无法载入最新期刊版本';
  } finally {
    if (session === sessionGeneration) uploading.value = false;
  }
}

function logout(message = '') {
  sessionGeneration += 1;
  dashboardRequestGeneration += 1;
  practiceContentRequestGeneration += 1;
  minePageContentRequestGeneration += 1;
  observationRequestGeneration += 1;
  discussionContributionGeneration += 1;
  discussionRestrictionGeneration += 1;
  discussionReportGeneration += 1;
  privacyRequestGeneration += 1;
  auditRequestGeneration += 1;
  orphanMediaRequestGeneration += 1;
  audioLibraryRequestGeneration += 1;
  token.value = '';
  username.value = '';
  adminPermissions.value = null;
  password.value = '';
  loading.value = false;
  sessionExpiresAt.value = 0;
  overviewUpdatedAt.value = '';
  overviewSyncError.value = '';
  home.value = null;
  issues.value = [];
  issueLifecycle.value = null;
  practiceContent.value = null;
  minePageContent.value = null;
  privacyPageContent.value = null;
  observations.value = [];
  selectedObservation.value = null;
  selectedObservationError.value = '';
  selectedObservationLoading.value = false;
  observationTotal.value = 0;
  observationOffset.value = 0;
  observationHasMore.value = false;
  observationLifecycle.value = null;
  discussionContributions.value = [];
  discussionContributionTotal.value = 0;
  discussionContributionOffset.value = 0;
  discussionContributionHasMore.value = false;
  discussionContributionSummary.value = { pending: 0, published: 0, hidden: 0, rejected: 0 };
  selectedDiscussionContribution.value = null;
  selectedDiscussionContributionError.value = '';
  discussionContributionError.value = '';
  discussionContributionActionMessage.value = '';
  discussionRestrictions.value = [];
  discussionRestrictionSummary.value = { active: 0, scheduled: 0, expired: 0, revoked: 0 };
  discussionRestrictionTotal.value = 0;
  discussionRestrictionOffset.value = 0;
  discussionRestrictionHasMore.value = false;
  discussionRestrictionLoading.value = false;
  discussionRestrictionLoadingMore.value = false;
  discussionRestrictionMoreError.value = '';
  discussionRestrictionError.value = '';
  discussionRestrictionActionMessage.value = '';
  discussionRestrictionSavingId.value = '';
  discussionRestrictionCreating.value = false;
  discussionRestrictionCreateMessage.value = '';
  discussionRestrictionCreateError.value = '';
  discussionRestrictionPrefillNickname.value = '';
  discussionRestrictionDialogOpen.value = false;
  discussionRestrictionMode.value = 'temporary';
  discussionRestrictionForm.value = { userId: '', reason: '', endsAt: '' };
  privacyRequests.value = [];
  privacyLifecycle.value = null;
  privacyTotal.value = 0;
  privacyOffset.value = 0;
  privacyHasMore.value = false;
  auditLogs.value = [];
  auditTotal.value = 0;
  auditOffset.value = 0;
  dashboardLoading.value = false;
  currentPageRefreshing.value = false;
  observationLoadingMore.value = false;
  privacyRefreshing.value = false;
  privacyLoadingMore.value = false;
  auditLoadingMore.value = false;
  uploading.value = false;
  processingPrivacyId.value = '';
  retryingPrivacyId.value = '';
  reencrypting.value = false;
  orphanMediaLoading.value = false;
  orphanMediaDeleting.value = '';
  clearIssueForm();
  orphanMedia.value = [];
  orphanMediaToken.value = '';
  orphanMediaHasMore.value = false;
  orphanMediaScanned.value = false;
  orphanMediaError.value = '';
  orphanMediaMessage.value = '';
  audioLibrary.value = [];
  audioLibraryToken.value = '';
  audioLibraryHasMore.value = false;
  audioLibraryScanned.value = false;
  audioLibraryLoading.value = false;
  audioLibraryPreviewLoading.value = '';
  audioLibraryPreviewUrls.value = {};
  audioLibraryError.value = '';
  observationMoreError.value = '';
  privacyMoreError.value = '';
  privacyActionMessage.value = '';
  privacyActionError.value = '';
  auditMoreError.value = '';
  observationStatus.value = '';
  observationMethod.value = '';
  observationIssueCode.value = '';
  observationStaleOnly.value = false;
  observationStatusBeforeStale.value = null;
  privacyStatus.value = '';
  auditActorType.value = '';
  auditAction.value = '';
  reencryptCursor.value = null;
  reencryptMessage.value = '';
  practiceContentMessage.value = '';
  practiceContentError.value = '';
  practiceContentDirty.value = false;
  practiceContentConflict.value = false;
  practiceContentSaving.value = false;
  minePageContentMessage.value = '';
  minePageContentError.value = '';
  minePageContentDirty.value = false;
  minePageContentConflict.value = false;
  minePageContentSaving.value = false;
  privacyPageDirty.value = false;
  privacyPageConflict.value = false;
  privacyPageSaving.value = false;
  privacyPageMessage.value = '';
  privacyPageError.value = '';
  adminProfile.value = null;
  closeAccountMenu();
  resetAdminNotifications();
  profileDialogOpen.value = false;
  profileAvatarError.value = '';
  profileAvatarMessage.value = '';
  localStorage.removeItem('myriad_she_admin_token');
  localStorage.removeItem('myriad_she_admin_expires_at');
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;
  error.value = message;
}

function logoutFromButton() {
  logout();
}

function handleAdminUnauthorized(response: Response, expectedSession = sessionGeneration) {
  if (response.status !== 401) return false;
  if (expectedSession === sessionGeneration && loggedIn.value) logout('后台登录已过期，请重新登录。');
  return true;
}

onMounted(() => {
  window.addEventListener('scroll', handleWorkspaceScroll, { passive: true });
  window.addEventListener('keydown', handleWorkspaceShortcut);
  window.addEventListener('focus', handleNotificationWindowFocus);
  document.addEventListener('visibilitychange', handleNotificationWindowFocus);
  handleWorkspaceScroll();
  if (!token.value || !sessionExpiresAt.value || sessionExpiresAt.value > Date.now() + maxAdminSessionSeconds * 1000) {
    localStorage.removeItem('myriad_she_admin_token');
    localStorage.removeItem('myriad_she_admin_expires_at');
    token.value = '';
    sessionExpiresAt.value = 0;
  }
  if (token.value && (!sessionExpiresAt.value || sessionExpiresAt.value <= Date.now())) {
    localStorage.removeItem('myriad_she_admin_token');
    localStorage.removeItem('myriad_she_admin_expires_at');
    token.value = '';
    sessionExpiresAt.value = 0;
  }
  consumeWecomCallback();
  if (!loggedIn.value) return;
  if (!sessionExpiresAt.value || sessionExpiresAt.value <= Date.now()) {
    logout('后台登录已过期，请重新登录。');
    return;
  }
  scheduleSessionExpiry((sessionExpiresAt.value - Date.now()) / 1000);
  const session = sessionGeneration;
  const initialLoad = (async () => {
    await loadAdminProfile();
    if (!loggedIn.value || session !== sessionGeneration || adminPasswordChangeRequired.value) return;
    startNotificationPolling();
    await enterDashboardByPermissions();
  })();
  initialLoad.catch((caught) => {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '加载失败';
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleWorkspaceScroll);
  window.removeEventListener('keydown', handleWorkspaceShortcut);
  window.removeEventListener('focus', handleNotificationWindowFocus);
  document.removeEventListener('visibilitychange', handleNotificationWindowFocus);
  resetAdminNotifications();
  wecomQrInstance?.destroyed?.();
  wecomQrInstance = null;
});
</script>

<template>
  <div class="app-frame" :class="{ 'login-frame': !loggedIn }">
    <a class="skip-link" href="#dashboard-content">跳到主要内容</a>
    <main id="dashboard-content" class="shell" :class="{ 'dashboard-shell': loggedIn, 'login-shell': !loggedIn }" :aria-busy="dashboardLoading">
    <section v-if="!loggedIn" class="login-layout" :class="{ 'wecom-open': wecomQrVisible }">
      <div class="login-visual" aria-hidden="true">
        <img src="/login-ms-brand.png?v=2" alt="" draggable="false" />
      </div>
      <section class="login-panel" aria-labelledby="login-brand">
        <div class="login-panel-inner">
          <h1 id="login-brand" class="login-brand">MYRIAD SHE</h1>
          <div v-if="wecomQrVisible" class="wecom-login">
            <div class="wecom-qr-frame">
              <div id="wecom-qr" class="wecom-qr"></div>
              <p v-if="wecomLoading" class="wecom-qr-loading">正在加载二维码…</p>
            </div>
            <p class="wecom-hint">请使用企业微信扫一扫</p>
            <p v-if="wecomError" class="error login-error" role="alert">{{ wecomError }}</p>
            <button type="button" class="wecom-back" @click="closeWecomLogin">返回账号登录</button>
          </div>
          <template v-else>
            <form @submit.prevent="login">
              <label>账号<input v-model="username" autocomplete="username" required /></label>
              <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
              <button :disabled="loading" type="submit">{{ loading ? '登录中…' : '登录' }}</button>
            </form>
            <div class="login-divider"><span>或</span></div>
            <button type="button" class="wecom-login-button" :disabled="loading || wecomLoading" @click="openWecomLogin">
              <span class="wecom-mark" aria-hidden="true">企</span>
              企业微信扫码登录
            </button>
            <p v-if="wecomError" class="error login-error" role="alert">{{ wecomError }}</p>
          </template>
        </div>
      </section>
    </section>

    <template v-else>
      <section v-if="adminPasswordChangeRequired" class="login-panel password-rotation-panel" aria-labelledby="password-rotation-title">
        <p class="eyebrow">SECURITY / FIRST LOGIN</p><h1 id="password-rotation-title">先修改员工密码</h1>
        <p class="muted">首次登录或管理员重置密码后，必须设置新的个人密码才能进入后台。</p>
        <form @submit.prevent="changeRequiredPassword">
          <label>当前密码<input v-model="passwordRotation.currentPassword" type="password" autocomplete="current-password" required /></label>
          <label>新密码（至少 12 位）<input v-model="passwordRotation.newPassword" type="password" minlength="12" maxlength="256" autocomplete="new-password" required /></label>
          <label>确认新密码<input v-model="passwordRotation.confirmPassword" type="password" minlength="12" maxlength="256" autocomplete="new-password" required /></label>
          <button :disabled="passwordRotationSaving" type="submit">{{ passwordRotationSaving ? '保存中…' : '修改密码并进入后台' }}</button>
        </form>
        <p v-if="passwordRotationError" class="error" role="alert">{{ passwordRotationError }}</p>
        <button class="quiet" type="button" @click="logoutFromButton">退出登录</button>
      </section>
      <div v-else class="dashboard-layout" :class="{ 'nav-collapsed': sidebarCollapsed }">
        <AdminCommandMenu :open="commandMenuOpen" :items="navigationItems" @close="commandMenuOpen = false" @select="selectAdminDestination" />
        <aside class="dashboard-sidebar" aria-label="后台分区导航">
          <div class="dashboard-brand">
            <div class="dashboard-brand-copy"><strong>MYRIAD SHE</strong><small>ADMIN WORKSPACE</small></div>
            <button type="button" class="quiet admin-icon-button sidebar-toggle" :aria-label="sidebarCollapsed ? '展开侧边导航' : '收起侧边导航'" :title="sidebarCollapsed ? '展开侧边导航' : '收起侧边导航'" :aria-expanded="!sidebarCollapsed" @click="sidebarCollapsed = !sidebarCollapsed"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16m6-11-3 3 3 3"/></svg></button>
          </div>
          <nav class="dashboard-nav" aria-label="后台分区">
            <div class="dashboard-nav-tabs">
              <p v-if="!isSuperAdmin && !canAccessAnyModule" class="dashboard-nav-empty">暂无授权模块</p>
              <button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'overview' }" :aria-label="sidebarCollapsed ? '工作台' : undefined" :title="sidebarCollapsed ? '工作台' : undefined" :aria-current="activeSection === 'overview' ? 'page' : undefined" aria-controls="overview-panel" @click="activeSection = 'overview'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5h7v7H4zM13 4.5h7v4h-7zM13 10.5h7v9h-7zM4 13.5h7v6H4z" /></svg><span>工作台</span></button>
              <div v-if="canAccessModule('practice')" class="dashboard-nav-group practice-nav-group" :class="{ expanded: activeSection === 'practice' && practiceNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: activeSection === 'practice' }" :aria-label="sidebarCollapsed ? '实践' : undefined" :title="sidebarCollapsed ? '实践' : undefined" :aria-current="activeSection === 'practice' ? 'page' : undefined" :aria-expanded="activeSection === 'practice' && practiceNavigationExpanded && !sidebarCollapsed" aria-controls="practice-navigation" @click.stop="openPracticeNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 4.5c-7.7.2-12.8 2.3-13.8 7.1-.8 3.4 1.8 6.3 5 6.3 5.1 0 7.8-5.5 8.8-13.4ZM5 20c2.4-4.4 5.2-7.1 9.2-9.6" /></svg><span>实践</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav" @enter="enterSubnav" @after-enter="afterEnterSubnav" @leave="leaveSubnav" @after-leave="afterLeaveSubnav"><nav v-if="activeSection === 'practice' && practiceNavigationExpanded && !sidebarCollapsed" id="practice-navigation" class="dashboard-subnav" aria-label="实践子菜单">
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'practice' }" :aria-current="activeContentSection === 'practice' ? 'page' : undefined" @click="activeContentSection = 'practice'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6zM9 8h6m-6 4h6m-6 4h3" /></svg><span>实践页面</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'practice-directory' }" :aria-current="activeContentSection === 'practice-directory' ? 'page' : undefined" @click="activeContentSection = 'practice-directory'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg><span>实践目录</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'observation' }" :aria-current="activeContentSection === 'observation' ? 'page' : undefined" @click="activeContentSection = 'observation'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v4.7l3.2 2" /></svg><span>此刻观察</span></button><button class="dashboard-subtab" :class="{ active: activeContentSection === 'shared-practice' }" :aria-current="activeContentSection === 'shared-practice' ? 'page' : undefined" @click="activeContentSection = 'shared-practice'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM7 9h10M7 12h7M7 15h4" /></svg><span>共同实践</span></button><button class="dashboard-subtab" :class="{ active: activeContentSection === 'daily-objects' }" :aria-current="activeContentSection === 'daily-objects' ? 'page' : undefined" @click="openDailyObjectsEditor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1 12H4L5 8Zm4 0V6a3 3 0 0 1 6 0v2" /></svg><span>日常之物</span></button>
                </nav></Transition>
              </div>
              <div v-if="canAccessModule('journal') || canAccessModule('media')" class="dashboard-nav-group journal-nav-group" :class="{ expanded: activeSection === 'content' && (isJournalSection(activeContentSection) || activeContentSection === 'media') && journalNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: activeSection === 'content' && (isJournalSection(activeContentSection) || activeContentSection === 'media') }" :aria-label="sidebarCollapsed ? '期刊' : undefined" :title="sidebarCollapsed ? '期刊' : undefined" :aria-current="activeSection === 'content' && (isJournalSection(activeContentSection) || activeContentSection === 'media') ? 'page' : undefined" :aria-expanded="activeSection === 'content' && journalNavigationExpanded && !sidebarCollapsed" aria-controls="journal-navigation" @click.stop="openJournalNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg><span>期刊</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav" @enter="enterSubnav" @after-enter="afterEnterSubnav" @leave="leaveSubnav" @after-leave="afterLeaveSubnav"><nav v-if="activeSection === 'content' && journalNavigationExpanded && !sidebarCollapsed" id="journal-navigation" class="dashboard-subnav" aria-label="期刊子菜单">
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-list' }" :aria-current="activeContentSection === 'journal-list' ? 'page' : undefined" @click="openJournalSubsection('journal-list')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg><span>期刊列表</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-home' }" :aria-current="activeContentSection === 'journal-home' ? 'page' : undefined" @click="openJournalSubsection('journal-home')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM4 10h16M9 14h6" /></svg><span>首页策展</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-story' }" :aria-current="activeContentSection === 'journal-story' ? 'page' : undefined" @click="openJournalSubsection('journal-story')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.2" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg><span>人物故事</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-audio' }" :aria-current="activeContentSection === 'journal-audio' ? 'page' : undefined" @click="openJournalSubsection('journal-audio')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg><span>微声音</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-discussion' }" :aria-current="activeContentSection === 'journal-discussion' ? 'page' : undefined" @click="openJournalSubsection('journal-discussion')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 9h8M8 12.5h5" /></svg><span>本期讨论</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-archive' }" :aria-current="activeContentSection === 'journal-archive' ? 'page' : undefined" @click="openJournalSubsection('journal-archive')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v13H5zM8 4h8M8 11h8M8 15h5" /></svg><span>往期策展</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'media' }" :aria-current="activeContentSection === 'media' ? 'page' : undefined" @click="openJournalSubsection('media'); loadAudioLibrary(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="9" r="1.6"/><path d="m5 17 4.5-4.5 3 3 2.5-2.5 4 4" /></svg><span>媒体库</span></button>
                </nav></Transition>
              </div>
              <div v-if="canAccessModule('pages')" class="dashboard-nav-group" :class="{ expanded: activeSection === 'content' && isPageSection(activeContentSection) && pageNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: activeSection === 'content' && isPageSection(activeContentSection) }" :aria-label="sidebarCollapsed ? '页面与协议' : undefined" :title="sidebarCollapsed ? '页面与协议' : undefined" :aria-current="activeSection === 'content' && isPageSection(activeContentSection) ? 'page' : undefined" :aria-expanded="activeSection === 'content' && pageNavigationExpanded && !sidebarCollapsed" aria-controls="page-navigation" @click.stop="openPageNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 8h6m-6 3.5h6m-6 3.5h4" /></svg><span>页面与协议</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav" @enter="enterSubnav" @after-enter="afterEnterSubnav" @leave="leaveSubnav" @after-leave="afterLeaveSubnav"><nav v-if="activeSection === 'content' && pageNavigationExpanded && !sidebarCollapsed" id="page-navigation" class="dashboard-subnav" aria-label="页面与协议子菜单">
                  <button v-if="isSuperAdmin" class="dashboard-subtab" :class="{ active: activeContentSection === 'mine' }" :aria-current="activeContentSection === 'mine' ? 'page' : undefined" @click="activeContentSection = 'mine'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0M4 4h16v16H4z" /></svg><span>我的页面设置</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'privacy-page' }" :aria-current="activeContentSection === 'privacy-page' ? 'page' : undefined" @click="activeContentSection = 'privacy-page'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.5-7 9-4.1-1.5-7-4.6-7-9V6z" /></svg><span>关于 MYRIAD SHE</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'about-history' }" :aria-current="activeContentSection === 'about-history' ? 'page' : undefined" @click="activeContentSection = 'about-history'; loadPrivacyRevisions('about-page')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2" /></svg><span>关于发布历史</span></button>
                  <button v-if="canAccessModule('pages')" class="dashboard-subtab" :class="{ active: activeContentSection === 'user-agreement' }" :aria-current="activeContentSection === 'user-agreement' ? 'page' : undefined" @click="activeContentSection = 'user-agreement'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 8h6m-6 3.5h6m-6 3.5h4" /></svg><span>用户协议</span></button>
                  <button v-if="canAccessModule('pages')" class="dashboard-subtab" :class="{ active: activeContentSection === 'privacy-policy' }" :aria-current="activeContentSection === 'privacy-policy' ? 'page' : undefined" @click="activeContentSection = 'privacy-policy'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 8h6m-6 3.5h6m-6 3.5h4" /></svg><span>隐私政策</span></button>
                  <button v-if="canAccessModule('pages')" class="dashboard-subtab" :class="{ active: activeContentSection === 'legal-history' }" :aria-current="activeContentSection === 'legal-history' ? 'page' : undefined" @click="activeContentSection = 'legal-history'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2" /></svg><span>历史版本</span></button>
                </nav></Transition>
              </div>
              <button v-if="canAccessModule('members')" type="button" class="dashboard-tab" :class="{ active: activeSection === 'members' }" :aria-label="sidebarCollapsed ? '会员列表' : undefined" :title="sidebarCollapsed ? '会员列表' : undefined" :aria-current="activeSection === 'members' ? 'page' : undefined" aria-controls="member-directory" @click="openMembersNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8m1.2 2.3a5.5 5.5 0 0 1 3.3 5.1" /></svg><span>会员列表</span></button>
              <div v-if="canAccessModule('contributions') || canAccessModule('discussion-reports') || canAccessModule('observations') || canAccessModule('privacy') || canAccessModule('audit')" class="dashboard-nav-group operations-nav-group" :class="{ expanded: isOperationsSection(activeSection) && operationsNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: isOperationsSection(activeSection) }" :aria-label="sidebarCollapsed ? '运营管理' : undefined" :title="sidebarCollapsed ? '运营管理' : undefined" :aria-expanded="isOperationsSection(activeSection) && operationsNavigationExpanded && !sidebarCollapsed" aria-controls="operations-navigation" @click.stop="openOperationsNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v12H4zM8 7.5V5h8v2.5M8 12h8M8 16h5" /></svg><span>运营管理</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav" @enter="enterSubnav" @after-enter="afterEnterSubnav" @leave="leaveSubnav" @after-leave="afterLeaveSubnav"><nav v-if="isOperationsSection(activeSection) && operationsNavigationExpanded && !sidebarCollapsed" id="operations-navigation" class="dashboard-subnav" aria-label="运营管理子菜单">
                  <button v-if="canAccessModule('contributions')" class="dashboard-subtab" :class="{ active: activeSection === 'contributions' }" :aria-current="activeSection === 'contributions' ? 'page' : undefined" @click="openOperationsSubsection('contributions')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v12H9l-5 3v-15Z"/><path d="M8 9h8m-8 4h6" /></svg><span>一起谈谈内容</span></button>
                  <button v-if="canAccessModule('contributions')" class="dashboard-subtab" :class="{ active: activeSection === 'discussion-restrictions' }" :aria-current="activeSection === 'discussion-restrictions' ? 'page' : undefined" @click="openOperationsSubsection('discussion-restrictions')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.5-7 9-4.1-1.5-7-4.6-7-9V6z"/><path d="M12 8.2v4.3"/><circle cx="12" cy="15.5" r=".8"/></svg><span>一起谈谈权限</span></button>
                  <button v-if="canAccessModule('discussion-reports')" class="dashboard-subtab" :class="{ active: activeSection === 'discussion-reports' }" :aria-current="activeSection === 'discussion-reports' ? 'page' : undefined" @click="openOperationsSubsection('discussion-reports')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 20 6v6c0 4.3-3.2 7.2-8 8.2-4.8-1-8-3.9-8-8.2V6z"/><path d="M12 8v4.6"/><circle cx="12" cy="15.6" r=".7"/></svg><span>用户举报</span></button>
                  <button v-if="canAccessModule('observations')" class="dashboard-subtab" :class="{ active: activeSection === 'observations' }" :aria-current="activeSection === 'observations' ? 'page' : undefined" @click="openOperationsSubsection('observations')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7v5l3.2 2" /></svg><span>观察记录管理</span></button>
                  <button v-if="canAccessModule('privacy')" class="dashboard-subtab" :class="{ active: activeSection === 'privacy' }" :aria-current="activeSection === 'privacy' ? 'page' : undefined" @click="openOperationsSubsection('privacy')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.5-7 9-4.1-1.5-7-4.6-7-9V6zM9.2 11.8l1.9 1.9 3.9-4" /></svg><span>隐私申请</span></button>
                  <button v-if="canAccessModule('audit')" class="dashboard-subtab" :class="{ active: activeSection === 'audit' }" :aria-current="activeSection === 'audit' ? 'page' : undefined" @click="openOperationsSubsection('audit')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h3m4 1 1.5 1.5L21 15" /></svg><span>操作记录</span></button>
                </nav></Transition>
              </div>
              <div v-if="canAccessModule('life-cards') || canAccessModule('life-card-views')" class="dashboard-nav-group life-card-nav-group" :class="{ expanded: isLifeCardSection(activeSection) && lifeCardNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: isLifeCardSection(activeSection) }" :aria-label="sidebarCollapsed ? '生命牌' : undefined" :title="sidebarCollapsed ? '生命牌' : undefined" :aria-current="isLifeCardSection(activeSection) ? 'page' : undefined" :aria-expanded="isLifeCardSection(activeSection) && lifeCardNavigationExpanded && !sidebarCollapsed" aria-controls="life-card-navigation" @click.stop="openLifeCardNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="12" height="17" rx="1.5"/><path d="M18.5 6.5H20v14H8v-1.5M8 8h4M8 12h4"/></svg><span>生命牌</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav" @enter="enterSubnav" @after-enter="afterEnterSubnav" @leave="leaveSubnav" @after-leave="afterLeaveSubnav"><nav v-if="isLifeCardSection(activeSection) && lifeCardNavigationExpanded && !sidebarCollapsed" id="life-card-navigation" class="dashboard-subnav" aria-label="生命牌子菜单">
                  <button v-if="canAccessModule('life-cards')" class="dashboard-subtab" :class="{ active: activeSection === 'life-cards' }" :aria-current="activeSection === 'life-cards' ? 'page' : undefined" @click="openLifeCardSubsection('life-cards')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="12" height="17" rx="1.5"/><path d="M18.5 6.5H20v14H8v-1.5M8 8h4M8 12h4"/></svg><span>生命牌文案</span></button>
                  <button v-if="canAccessModule('life-card-views')" class="dashboard-subtab" :class="{ active: activeSection === 'life-card-views' }" :aria-current="activeSection === 'life-card-views' ? 'page' : undefined" @click="openLifeCardSubsection('life-card-views')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3.2-6.5 8.5-6.5S20.5 12 20.5 12s-3.2 6.5-8.5 6.5S3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg><span>生命牌查看</span></button>
                </nav></Transition>
              </div>
              <div v-if="isSuperAdmin || canAccessModule('settings')" class="dashboard-nav-group system-nav-group" :class="{ expanded: isSystemSection(activeSection) && systemNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: isSystemSection(activeSection) }" :aria-label="sidebarCollapsed ? '系统管理' : undefined" :title="sidebarCollapsed ? '系统管理' : undefined" :aria-expanded="isSystemSection(activeSection) && systemNavigationExpanded && !sidebarCollapsed" aria-controls="system-navigation" @click.stop="openSystemNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" /></svg><span>系统管理</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav" @enter="enterSubnav" @after-enter="afterEnterSubnav" @leave="leaveSubnav" @after-leave="afterLeaveSubnav"><nav v-if="isSystemSection(activeSection) && systemNavigationExpanded && !sidebarCollapsed" id="system-navigation" class="dashboard-subnav" aria-label="系统管理子菜单">
                  <button v-if="canAccessModule('settings')" class="dashboard-subtab" :class="{ active: activeSection === 'settings' }" :aria-current="activeSection === 'settings' ? 'page' : undefined" @click="openSystemSubsection('settings')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15 21 17.5 19.5 20l-2.7-.6a7 7 0 0 1-1.2.7l-.8 2.4h-3l-.8-2.4-1.2-.7L7.1 20l-1.5-2.5L7 15a7 7 0 0 1 0-1.4l-1.4-2.5 1.5-2.5 2.7.6a7 7 0 0 1 1.2-.7l.8-2.4h3l.8 2.4 1.2.7 2.7-.6 1.5 2.5-1.4 2.5a7 7 0 0 1 0 1.4Z" /></svg><span>系统设置</span></button>
                  <button v-if="canAccessModule('settings')" class="dashboard-subtab" :class="{ active: activeSection === 'store-settings' }" :aria-current="activeSection === 'store-settings' ? 'page' : undefined" @click="openSystemSubsection('store-settings')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></svg><span>商城开放</span></button>
                  <button v-if="canAccessModule('settings')" class="dashboard-subtab" :class="{ active: activeSection === 'status-machine' }" :aria-current="activeSection === 'status-machine' ? 'page' : undefined" @click="openSystemSubsection('status-machine')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4.2 8.7M17.5 7.5l-4.2 8.7"/></svg><span>模块状态机</span></button>
                  <button v-if="isSuperAdmin" class="dashboard-subtab" :class="{ active: activeSection === 'employees' }" :aria-current="activeSection === 'employees' ? 'page' : undefined" @click="openSystemSubsection('employees')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8m1.2 2.3a5.5 5.5 0 0 1 3.3 5.1" /></svg><span>员工与权限</span></button>
                </nav></Transition>
              </div>
            </div>
          </nav>
          <div class="sidebar-account-menu">
            <button type="button" class="dashboard-nav-footer" :class="{ active: sidebarAccountMenuOpen }" :aria-expanded="sidebarAccountMenuOpen" aria-haspopup="menu" aria-controls="sidebar-account-menu" :aria-label="`管理工作空间，${adminIdentity.name}，${adminIdentity.roleLabel}`" @click="toggleSidebarAccountMenu">
              <span class="admin-workspace-mark" aria-hidden="true"><img v-if="adminIdentity.avatarUrl" :src="adminIdentity.avatarUrl" alt="" /><span v-else>M</span></span>
              <div class="admin-workspace-copy"><strong>管理工作空间</strong><small>{{ adminIdentity.roleLabel }}</small></div>
              <span class="admin-workspace-dot" aria-hidden="true"></span>
              <svg class="admin-workspace-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
            </button>
            <div v-if="sidebarAccountMenuOpen" class="account-menu-backdrop" @click="closeAccountMenu"></div>
            <div v-if="sidebarAccountMenuOpen" id="sidebar-account-menu" class="account-menu-panel sidebar-account-menu-panel" role="menu" aria-label="管理工作空间账号菜单">
              <div class="account-menu-head">
                <span class="account-menu-avatar">
                  <img v-if="adminIdentity.avatarUrl" :src="adminIdentity.avatarUrl" alt="" />
                  <span v-else aria-hidden="true">M</span>
                </span>
                <span class="account-menu-copy"><strong>{{ adminIdentity.name }}</strong><small>{{ adminIdentity.roleLabel }}</small></span>
              </div>
              <button type="button" class="account-menu-item" role="menuitem" @click="openProfileDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/></svg><span>个人资料</span></button>
              <button type="button" class="account-menu-item" role="menuitem" @click="openPasswordDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z"/></svg><span>修改密码</span></button>
              <button type="button" class="account-menu-item" role="menuitem" @click="logoutFromButton"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5H6.8A1.3 1.3 0 0 0 5.5 5.8v12.4a1.3 1.3 0 0 0 1.3 1.3h7.7M13.5 12H20m0 0-2.8-2.8M20 12l-2.8 2.8"/></svg><span>退出登录</span></button>
            </div>
          </div>
        </aside>
        <div class="dashboard-workspace">
          <header class="topbar">
            <div class="topbar-title" :key="currentView.title"><p class="eyebrow">MYRIAD SHE / {{ currentView.eyebrow }}</p><h1 tabindex="-1">{{ currentView.title }}</h1><p v-if="activeSection !== 'overview'" class="admin-page-description">{{ currentDestination?.description }}</p></div>
            <div class="topbar-actions">
              <button type="button" class="quiet admin-command-trigger" aria-label="快捷导航" aria-keyshortcuts="Control+k Meta+k" @click="openCommandMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><span>快速前往</span><kbd>⌘ / Ctrl K</kbd></button>
              <button v-if="activeSection !== 'overview'" type="button" class="quiet admin-page-refresh" :disabled="currentPageRefreshing || dashboardLoading" :aria-busy="currentPageRefreshing" :aria-label="currentPageRefreshing ? '刷新中…' : '刷新页面'" title="刷新页面" @click="refreshCurrentPage"><svg :class="{ spinning: currentPageRefreshing }" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17"/></svg><span>{{ currentPageRefreshing ? '刷新中…' : '刷新页面' }}</span></button>
              <div class="admin-notification">
                <button
                  type="button"
                  class="quiet admin-notification-trigger"
                  :aria-expanded="notificationsOpen"
                  aria-haspopup="dialog"
                  :aria-label="notificationUnreadCount ? `通知，${notificationUnreadCount} 条未读` : '通知'"
                  @click="toggleNotificationPanel"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-2.5 7-2.5 8.5h17C20.5 16 18 16 18 9Z"/><path d="M9.5 20a2.8 2.8 0 0 0 5 0"/></svg>
                  <span v-if="notificationUnreadCount" class="admin-notification-badge">{{ notificationUnreadCount > 99 ? '99+' : notificationUnreadCount }}</span>
                </button>
                <div v-if="notificationsOpen" class="admin-notification-backdrop" @click="closeNotificationPanel"></div>
                <section
                  v-if="notificationsOpen"
                  class="admin-notification-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="admin-notification-title"
                  @keydown.esc.stop="closeNotificationPanel"
                >
                  <header class="admin-notification-head">
                    <div class="admin-notification-heading">
                      <p class="eyebrow">USER ACTIVITY</p>
                      <h2 id="admin-notification-title">
                        通知
                        <span v-if="notificationUnreadCount" class="admin-notification-count">{{ notificationUnreadCount > 99 ? '99+' : notificationUnreadCount }} 条未读</span>
                        <span v-else class="admin-notification-count is-empty">全部已读</span>
                      </h2>
                    </div>
                    <button
                      type="button"
                      class="quiet admin-notification-read-all"
                      :disabled="notificationUnreadCount === 0 || notificationsMarkingAll || Boolean(notificationsMarkingId)"
                      @click="markAllNotificationsRead"
                    >
                      {{ notificationsMarkingAll ? '处理中…' : '全部已读' }}
                    </button>
                  </header>
                  <div class="admin-notification-body" aria-live="polite">
                    <p v-if="notificationsLoading && notificationItems.length === 0" class="admin-notification-state">正在读取通知…</p>
                    <p v-else-if="notificationsError && notificationItems.length === 0" class="admin-notification-state is-error" role="alert">{{ notificationsError }}</p>
                    <p v-else-if="notificationItems.length === 0" class="admin-notification-state">
                      <strong>还没有用户操作通知</strong>
                      <span>新用户加入、保存观察或提交内容后，会在这里提醒你。</span>
                    </p>
                    <template v-else>
                      <p v-if="notificationsError" class="admin-notification-inline-error" role="alert">{{ notificationsError }}</p>
                      <div class="admin-notification-list">
                        <button
                          v-for="item in notificationItems"
                          :key="item.id"
                          type="button"
                          class="admin-notification-item"
                          :class="{ 'is-read': item.isRead, 'is-marking': notificationsMarkingId === item.id }"
                          :aria-label="`${item.title}，${item.content}${item.isRead ? '，已读' : '，未读'}`"
                          @click="markNotificationRead(item)"
                        >
                          <span class="admin-notification-dot" :class="{ 'is-read': item.isRead }" aria-hidden="true"></span>
                          <span class="admin-notification-copy">
                            <strong>{{ item.title }}</strong>
                            <span>{{ item.content }}</span>
                            <time :datetime="item.createdAt" :title="notificationExactTime(item.createdAt)">
                              {{ notificationsMarkingId === item.id ? '正在标记已读…' : notificationTimeLabel(item.createdAt) }}
                            </time>
                          </span>
                        </button>
                      </div>
                    </template>
                  </div>
                </section>
              </div>              <div class="account-menu">
  <button type="button" class="account-avatar-button" :aria-expanded="accountMenuOpen" aria-haspopup="menu" :aria-label="`账号菜单，${adminIdentity.name}`" @click="toggleAccountMenu">
    <img v-if="adminIdentity.avatarUrl" :src="adminIdentity.avatarUrl" alt="" />
    <span v-else aria-hidden="true">M</span>
  </button>
  <div v-if="accountMenuOpen" class="account-menu-backdrop" @click="closeAccountMenu"></div>
  <div v-if="accountMenuOpen" class="account-menu-panel" role="menu">
    <div class="account-menu-head">
      <span class="account-menu-avatar">
        <img v-if="adminIdentity.avatarUrl" :src="adminIdentity.avatarUrl" alt="" />
        <span v-else aria-hidden="true">M</span>
      </span>
      <span class="account-menu-copy"><strong>{{ adminIdentity.name }}</strong><small>{{ adminIdentity.roleLabel }}</small></span>
    </div>
    <button type="button" class="account-menu-item" role="menuitem" @click="openProfileDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/></svg><span>个人资料</span></button>
    <button type="button" class="account-menu-item" role="menuitem" @click="openPasswordDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z"/></svg><span>修改密码</span></button>
    <button type="button" class="account-menu-item" role="menuitem" @click="logoutFromButton"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5H6.8A1.3 1.3 0 0 0 5.5 5.8v12.4a1.3 1.3 0 0 0 1.3 1.3h7.7M13.5 12H20m0 0-2.8-2.8M20 12l-2.8 2.8"/></svg><span>退出登录</span></button>
  </div>
</div>
<p v-if="passwordMessage" class="topbar-status" role="status">{{ passwordMessage }}</p>
            </div>
          </header>
        <Teleport to="body">
<div v-if="profileDialogOpen" class="observation-modal-backdrop" @click.self="profileDialogOpen = false">
          <section class="observation-detail-panel account-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="account-profile-title" @keydown.esc="profileDialogOpen = false">
            <div class="section-heading">
              <div><p class="eyebrow">ACCOUNT / PROFILE</p><h3 id="account-profile-title">个人资料</h3></div>
              <button type="button" class="quiet" aria-label="关闭个人资料" @click="profileDialogOpen = false">关闭</button>
            </div>
            <div class="panel-body">
              <div class="account-profile-summary">
                <span class="account-profile-avatar">
                  <img v-if="adminIdentity.avatarUrl" :src="adminIdentity.avatarUrl" alt="" />
                  <span v-else aria-hidden="true">M</span>
                </span>
                <div class="account-profile-copy">
                  <strong>{{ adminIdentity.name }}</strong>
                  <span>{{ adminProfile?.username || '当前账号' }}</span>
                  <small>{{ adminIdentity.roleLabel }}</small>
                </div>
              </div>
              <div class="account-profile-actions">
                <label v-if="adminProfile?.canEditAvatar" class="quiet account-avatar-upload">
                  {{ profileAvatarSaving ? '上传中…' : '更换头像' }}
                  <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="profileAvatarSaving" @change="uploadMyAvatar" />
                </label>
                <button v-if="adminIdentity.avatarUrl && adminProfile?.canEditAvatar" type="button" class="quiet" :disabled="profileAvatarSaving" @click="removeMyAvatar">恢复默认 M 头像</button>
              </div>
              <p class="muted account-profile-note">支持 JPEG、PNG、WebP，最大 2 MB；未设置头像时，右上角和员工列表统一显示 M。</p>
              <p v-if="!adminProfile?.canEditAvatar" class="muted">当前环境管理员由部署配置登录，暂不支持修改头像。</p>
              <p v-if="profileAvatarError" class="error" role="alert">{{ profileAvatarError }}</p>
              <p v-if="profileAvatarMessage" class="status-message" role="status">{{ profileAvatarMessage }}</p>
            </div>
          </section>
        </div>
<div v-if="passwordDialogOpen" class="observation-modal-backdrop" @click.self="passwordDialogOpen = false">
          <section class="observation-detail-panel password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title" @keydown.esc="passwordDialogOpen = false">
            <div class="section-heading"><div><p class="eyebrow">ACCOUNT / PASSWORD</p><h3 id="password-dialog-title">修改密码</h3></div><button type="button" class="quiet" aria-label="关闭修改密码" @click="passwordDialogOpen = false">关闭</button></div>
          <div class="panel-body">
            <form class="password-form" @submit.prevent="submitPasswordChange">
              <label>当前密码<input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required /></label>
              <label>新密码（至少 12 位）<input v-model="passwordForm.newPassword" type="password" minlength="12" autocomplete="new-password" required /></label>
              <label>确认新密码<input v-model="passwordForm.confirmPassword" type="password" minlength="12" autocomplete="new-password" required /></label>
              <p v-if="passwordError" class="error" role="alert">{{ passwordError }}</p>
              <div class="topbar-actions"><button type="submit" :disabled="passwordSaving">{{ passwordSaving ? '保存中…' : '保存新密码' }}</button><button type="button" class="quiet" :disabled="passwordSaving" @click="passwordDialogOpen = false">取消</button></div>
            </form>
          </div>
        </section>
        </div>
</Teleport>
          <button v-if="showBackToTop" type="button" class="to-top" aria-label="回到顶部" title="回到顶部" @click="scrollToTop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>
          <p v-if="dashboardLoading" class="loading-note" role="status" aria-live="polite">正在同步云端数据…</p>
      <section v-if="activeSection === 'overview'" id="overview-panel" class="overview-workspace" :aria-busy="dashboardLoading">
        <header class="panel overview-hero">
          <div class="overview-hero-copy">
            <p class="eyebrow">A LITTLE CARE, EVERY DAY</p>
            <h2>{{ overviewGreeting }}</h2>
            <p class="overview-hero-description">从这里，照看每一份真实的表达。</p>
            <p class="muted">{{ adminRoleLabels[adminRole] }} · 已授权 {{ adminModuleList.length }} / {{ adminModules.length }} 个模块</p>
          </div>
          <div class="overview-hero-date">
            <span>{{ new Date(overviewUpdatedAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase() }}</span>
            <time :datetime="overviewUpdatedAt || undefined">{{ new Date(overviewUpdatedAt || Date.now()).toLocaleDateString('zh-CN', { year: 'numeric', weekday: 'long' }) }}</time>
          </div>
          <div class="overview-hero-actions">
            <button v-if="canAccessModule('journal')" type="button" @click="openJournalSubsection('journal-list')">期刊工作台 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
            <button v-if="canAccessModule('contributions')" type="button" class="quiet" @click="activeSection = 'contributions'; refreshDiscussionContributions()">管理讨论内容</button>
            <button v-if="canAccessModule('observations')" type="button" class="quiet" @click="activeSection = 'observations'; refreshObservations()">观察记录</button>
            <button v-if="isSuperAdmin" type="button" class="quiet" @click="activeSection = 'employees'; loadEmployees()">员工与权限</button>
            <span class="overview-sync-message" :class="{ 'has-error': Boolean(overviewSyncError) }" role="status">{{ dashboardLoading ? '正在同步最新数据' : overviewSyncError ? '数据同步未完成，请重试' : overviewUpdatedAt ? '更新于 ' + displayDate(overviewUpdatedAt) : '等待同步数据' }}</span>
            <button type="button" class="quiet overview-sync" :class="{ 'is-syncing': dashboardLoading }" :disabled="dashboardLoading || currentPageRefreshing" @click="refreshCurrentPage"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17"/></svg>{{ dashboardLoading ? '同步中…' : '刷新数据' }}</button>
          </div>
        </header>

        <p v-if="adminModuleList.length === 0" class="panel overview-empty">当前账号还没有获得任何后台模块。请让超级管理员在「员工与权限 → 授权模块」中勾选后使用。</p>

        <div class="overview-section-heading">
          <div><h3>运营概览</h3><p>内容、社区与日常运营，一目了然。</p></div>
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/></svg>截至最近一次同步</span>
        </div>
        <div class="overview-metrics">
          <article v-if="canAccessModule('journal')" class="panel overview-metric">
            <div class="overview-metric-top"><p class="eyebrow">JOURNAL / 当前期刊</p><span class="overview-metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h5a4 4 0 0 1 4 4v13a4 4 0 0 0-4-3H3zM12 8a4 4 0 0 1 4-4h5v14h-5a4 4 0 0 0-4 3"/></svg></span></div>
            <strong>{{ dashboardLoading && !overviewUpdatedAt ? '—' : issueLifecycle?.publishedCode || '尚未发布' }}</strong>
            <p class="overview-metric-line">草稿 {{ issueLifecycle?.draftCount ?? 0 }} 期 · 归档 {{ issueLifecycle?.archivedCount ?? 0 }} 期</p>
            <small>{{ issueLifecycle?.publishedUpdatedAt ? '发布时间 ' + displayDate(issueLifecycle.publishedUpdatedAt) : '还没有已发布期刊' }}</small>
            <button type="button" class="quiet overview-metric-action" @click="openJournalSubsection('journal-list')"><span>管理期刊</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </article>

          <article v-if="canAccessModule('contributions')" class="panel overview-metric">
            <div class="overview-metric-top"><p class="eyebrow">REVIEW / 经历审核</p><span class="overview-metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h12v15H8zM4 7v14h12M11 10l2 2 4-4"/></svg></span></div>
            <strong><AnimatedNumber :value="discussionContributionSummary.pending" :loading="dashboardLoading" /><span class="overview-metric-unit">条待审核</span></strong>
            <p class="overview-metric-line">本期讨论里用户主动保存的经历</p>
            <small v-if="discussionContributions[0]">最近提交：{{ displayDate(discussionContributions[0].createdAt) }}</small>
            <small v-else>暂时没有待审核内容</small>
            <button type="button" class="quiet overview-metric-action" @click="activeSection = 'contributions'; refreshDiscussionContributions()"><span>进入审核队列</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </article>

          <article v-if="canAccessModule('observations')" class="panel overview-metric" data-tone="sage">
            <div class="overview-metric-top"><p class="eyebrow">OBSERVATIONS / 此刻观察</p><span class="overview-metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span></div>
            <strong><AnimatedNumber :value="observationLifecycle?.savedCount ?? observationTotal" :loading="dashboardLoading" /><span class="overview-metric-unit">条已保存</span></strong>
            <p class="overview-metric-line">草稿 {{ observationLifecycle?.draftCount ?? 0 }} 条 · 超期草稿 {{ observationLifecycle?.staleDraftCount ?? 0 }} 条</p>
            <small>保留期 {{ observationLifecycle?.retentionDays ?? 90 }} 天</small>
            <button type="button" class="quiet overview-metric-action" @click="activeSection = 'observations'; refreshObservations()"><span>查看观察记录</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </article>

          <article v-if="canAccessModule('members')" class="panel overview-metric">
            <div class="overview-metric-top"><p class="eyebrow">MEMBERS / 社区会员</p><span class="overview-metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3.5"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 4a3.5 3.5 0 0 1 0 7m4 10v-2a6 6 0 0 0-4-5.5"/></svg></span></div>
            <strong><AnimatedNumber :value="memberTotal" :loading="dashboardLoading" /><span class="overview-metric-unit">位会员</span></strong>
            <p class="overview-metric-line">按注册时间倒序展示在会员列表</p>
            <small>{{ members[0] ? '最近注册 ' + displayDate(members[0].createdAt) : '暂无注册会员' }}</small>
            <button type="button" class="quiet overview-metric-action" @click="activeSection = 'members'; refreshMembers()"><span>打开会员列表</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </article>

          <article v-if="canAccessModule('privacy')" class="panel overview-metric" data-tone="amber">
            <div class="overview-metric-top"><p class="eyebrow">PRIVACY / 隐私申请</p><span class="overview-metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-8 3v6c0 5 8 9 8 9s8-4 8-9V6zM9 12l2 2 4-4"/></svg></span></div>
            <strong><AnimatedNumber :value="privacyLifecycle?.pendingCount ?? 0" :loading="dashboardLoading" /><span class="overview-metric-unit">条待处理</span></strong>
            <p class="overview-metric-line">其中到期 {{ privacyLifecycle?.duePendingCount ?? 0 }} 条 · 失败 {{ privacyLifecycle?.failedCount ?? 0 }} 条</p>
            <small>{{ privacyLifecycle?.oldestPendingAt ? '最早申请 ' + displayDate(privacyLifecycle.oldestPendingAt) : '没有积压的删除申请' }}</small>
            <button type="button" class="quiet overview-metric-action" @click="activeSection = 'privacy'; refreshPrivacy(true)"><span>处理删除申请</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </article>

          <article v-if="canAccessModule('audit')" class="panel overview-metric">
            <div class="overview-metric-top"><p class="eyebrow">AUDIT / 操作记录</p><span class="overview-metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/></svg></span></div>
            <strong><AnimatedNumber :value="auditTotal" :loading="dashboardLoading" /><span class="overview-metric-unit">条操作记录</span></strong>
            <p class="overview-metric-line">覆盖用户、管理员与系统动作</p>
            <small>{{ auditLogs[0] ? '最近动作 ' + displayDate(auditLogs[0].createdAt) : '暂无审计记录' }}</small>
            <button type="button" class="quiet overview-metric-action" @click="activeSection = 'audit'; refreshAudit()"><span>查看操作记录</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </article>
        </div>

      </section>
      <section v-if="activeSection === 'content' && activeContentSection === 'journal-list'" id="journal-list" class="content-area">
        <div class="journal-list-layout">
          <aside class="panel issue-list-panel">
            <div class="section-heading"><h3>全部期次</h3><div class="issue-list-heading-actions"><small>{{ issues.length }} 期</small><button type="button" class="quiet" @click="startNewIssue">＋ 新建期刊</button></div></div>
            <div v-for="item in issues" :key="item.id" class="issue-list-row" :class="{ active: editingIssueId === item.id }">
              <button type="button" class="issue-list-item" :class="{ active: editingIssueId === item.id }" @click="editIssue(item)"><strong><RichTextView inline :text="item.label" :rich-text="item.labelRichText" /> · <RichTextView inline :text="item.theme" :rich-text="item.themeRichText" /></strong><small><RichTextView inline :text="item.month" :rich-text="item.monthRichText" /> · {{ journalIssueStatusLabel(item.status) }} · v{{ item.publishedVersion }}</small></button>
              <div class="issue-list-actions" aria-label="期刊操作">
                <button v-if="item.status === 'published'" type="button" class="quiet" :disabled="issueActionBusy" :aria-label="`归档期刊 ${item.code}`" @click="openIssueLifecycleAction(item, 'archive')">归档</button>
                <button v-if="item.status === 'archived'" type="button" class="quiet" :disabled="issueActionBusy" :aria-label="`恢复期刊 ${item.code} 为草稿`" @click="openIssueLifecycleAction(item, 'restore')">恢复草稿</button>
                <button type="button" class="quiet danger" :disabled="issueActionBusy" :aria-label="`删除期刊 ${item.code}`" @click="openIssueLifecycleAction(item, 'delete')">删除</button>
              </div>
            </div>
            <p v-if="!issues.length" class="muted">还没有期刊。先新建一份草稿。</p>
            <details class="issue-live-home"><summary>当前线上首页 <span>v{{ home?.publishedVersion || 0 }}</span></summary>
              <div v-if="home?.issue" class="issue-live-home-body"><strong><RichTextView inline :text="home.issue.label" :rich-text="home.issue.labelRichText" /> · <RichTextView inline :text="home.issue.theme" :rich-text="home.issue.themeRichText" /></strong><small><RichTextView inline :text="home.issue.month" :rich-text="home.issue.monthRichText" /> · {{ home.issue.code }}</small>
                <ol><li v-for="(module, index) in (home.modules || []).filter((item) => item.enabled)" :key="module.id"><span>{{ String(index + 1).padStart(2, '0') }}</span><div><strong>{{ issueModuleLabel(module) }}</strong><small><RichTextView inline :text="issueModuleSummary(module)" :rich-text="issueModuleSummaryRichText(module)" :fallback="'无摘要'" /></small></div></li></ol>
              </div><p v-else class="muted">当前没有已发布期刊。</p>
            </details>
          </aside>
          <div class="journal-list-main">
            <form v-if="!editingIssueId" class="panel issue-editor-form journal-create-form" novalidate @submit.prevent="saveIssue">
              <div class="section-heading"><div><p class="eyebrow">NEW ISSUE</p><h3>新建期刊草稿</h3></div><small>只在后台保存，不会立即上线</small></div>
              <div class="journal-meta-grid">
                <div class="journal-meta-column">
                  <label class="journal-issue-field" data-issue-field="code" :class="{ 'is-invalid': issueFieldErrors.code }">期刊编号<input v-model="issueForm.code" required minlength="2" maxlength="64" placeholder="例如：issue-03" :aria-invalid="Boolean(issueFieldErrors.code)" @input="clearIssueFieldError('code')" /><small v-if="issueFieldErrors.code" class="field-inline-error" role="alert">{{ issueFieldErrors.code }}</small></label>
                  <div class="journal-issue-field" data-issue-field="month" :class="{ 'is-invalid': issueFieldErrors.month }"><JournalRichTextField :model-value="issueForm.month" :rich-text="issueForm.monthRichText" label="刊期月份" :invalid="Boolean(issueFieldErrors.month)" :error="issueFieldErrors.month || ''" @update:model-value="setIssueBaseField('month', $event)" @update:rich-text="setIssueBaseRichText('month', $event)" /></div>
                  <label class="journal-issue-field" data-issue-field="edition" :class="{ 'is-invalid': issueFieldErrors.edition }">英文刊期标识<input v-model="journalIssueEdition" maxlength="40" placeholder="A CURATED EDITION" :aria-invalid="Boolean(issueFieldErrors.edition)" aria-describedby="issue-edition-help-create" @input="clearIssueFieldError('edition')" /><small v-if="issueFieldErrors.edition" class="field-inline-error" role="alert">{{ issueFieldErrors.edition }}</small><small id="issue-edition-help-create" class="field-help">显示在刊期月份右侧；留空后隐藏；保存草稿并确认发布后生效。</small></label>
                </div>
                <div class="journal-meta-column">
                  <div class="journal-issue-field" data-issue-field="label" :class="{ 'is-invalid': issueFieldErrors.label }"><JournalRichTextField :model-value="issueForm.label" :rich-text="issueForm.labelRichText" label="期刊标签" :invalid="Boolean(issueFieldErrors.label)" :error="issueFieldErrors.label || ''" @update:model-value="setIssueBaseField('label', $event)" @update:rich-text="setIssueBaseRichText('label', $event)" /></div>
                </div>
              </div>
              <div class="form-grid issue-create-basics"><div class="journal-issue-field" data-issue-field="theme" :class="{ 'is-invalid': issueFieldErrors.theme }"><JournalRichTextField :model-value="issueForm.theme" :rich-text="issueForm.themeRichText" label="本期主题" :invalid="Boolean(issueFieldErrors.theme)" :error="issueFieldErrors.theme || ''" @update:model-value="setIssueBaseField('theme', $event)" @update:rich-text="setIssueBaseRichText('theme', $event)" /></div><div class="journal-issue-field" data-issue-field="question" :class="{ 'is-invalid': issueFieldErrors.question }"><JournalRichTextField :model-value="issueForm.question" :rich-text="issueForm.questionRichText" label="本期问题" :invalid="Boolean(issueFieldErrors.question)" :error="issueFieldErrors.question || ''" @update:model-value="setIssueBaseField('question', $event)" @update:rich-text="setIssueBaseRichText('question', $event)" /></div></div>
              <p class="field-help">创建后进入「首页策展」继续补充封面、人物、声音与讨论。这里填写的主题与问题会成为封面标题和「本期问题」栏目的初始值；这些模块共用同一份草稿。</p>
              <div class="form-actions"><button type="submit" :disabled="uploading">{{ uploading ? '创建中…' : '创建草稿并继续' }}</button><button type="button" class="quiet" @click="startNewIssue">清空</button></div>
            </form>
            <template v-else>
              <section class="panel journal-overview">
                <div class="section-heading"><div><p class="eyebrow">CURRENT ISSUE</p><h3><RichTextView inline :text="issueForm.label" :rich-text="issueForm.labelRichText" /> · <RichTextView inline :text="issueForm.month" :rich-text="issueForm.monthRichText" /></h3></div><span class="journal-status-pill" :class="'is-' + issueForm.status">{{ journalIssueStatusLabel(issueForm.status) }}</span></div>
                <div class="journal-overview-meta">
                  <div><small>期刊编号</small><strong>{{ issueForm.code }}</strong></div>
                  <div><small>本期主题</small><strong><RichTextView inline :text="journalCoverTitle" :rich-text="journalCoverTitleRichText" fallback="尚未填写封面标题" /></strong></div>
                  <div><small>本期问题</small><strong><RichTextView inline :text="journalQuestionTitle" :rich-text="journalQuestionTitleRichText" fallback="尚未填写问题栏目" /></strong></div>
                  <div><small>线上版本</small><strong>v{{ journalCurrentIssue?.publishedVersion || 0 }}</strong></div>
                  <div><small>草稿版本</small><strong>v{{ editingIssueEditVersion || 1 }}</strong></div>
                  <div><small>最近更新</small><strong>{{ displayDate(journalCurrentIssue?.updatedAt) }}</strong></div>
                </div>
                <div class="journal-overview-actions">
                  <button type="button" @click="goToJournalSection('journal-home')">首页策展</button>
                  <button type="button" class="quiet" @click="goToJournalSection('journal-story')">人物故事</button>
                  <button type="button" class="quiet" @click="goToJournalSection('journal-audio')">微声音</button>
                  <button type="button" class="quiet" @click="goToJournalSection('journal-discussion')">本期讨论</button>
                  <button type="button" class="quiet" @click="goToJournalSection('journal-archive')">往期策展</button>
                </div>
                <div class="journal-overview-release">
                  <button type="button" class="quiet" :disabled="uploading || issueConflict || !issueDraftDirty" @click="saveIssue">{{ uploading ? '保存中…' : '保存整份草稿' }}</button>
                  <button type="button" :disabled="uploading || issueConflict || issueDraftDirty" @click="publishIssue">确认发布整期</button>
                  <button type="button" class="quiet" :disabled="!editingIssueId" @click="loadIssueHistory">查看发布历史</button>
                  <small>发布后本期所有模块一起上线，并自动归档上一期线上期刊。有未保存修改时需先保存草稿。</small>
                </div>
              </section>
              <p v-if="issueSaveMessage" class="status-message" role="status">{{ issueSaveMessage }}</p>
              <p v-if="issueConflict" class="error" role="alert">{{ issueConflictResolved || '云端草稿已变化，请先载入最新版本核对后再保存。' }} <button type="button" class="quiet" :disabled="uploading" @click="rebaseIssueEdits">载入最新版本</button></p>
              <ol v-if="issueHistory.length" class="issue-history"><li v-for="item in issueHistory" :key="item.version"><details><summary>v{{ item.version }} · {{ displayDate(item.publishedAt) }} · {{ item.publishedBy || '系统' }}</summary><pre>{{ JSON.stringify(item.snapshot, null, 2) }}</pre></details></li></ol>
            </template>
          </div>
        </div>
      </section>
      <section v-if="activeSection === 'content' && ['journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive'].includes(activeContentSection)" id="journal-module-workspace" class="content-area">
        <div class="journal-preview-layout" :class="{ 'has-preview': showJournalPreview }">
          <aside v-if="showJournalPreview" class="journal-preview-rail" aria-label="小程序预览">
            <template v-if="activeContentSection === 'journal-audio'">
              <AudioPagePreview
                :view="audioPreviewView"
                :active-key="activeAudioKey"
                :track-id="audioPreviewTrack?.id || ''"
                :tracks="audioPreviewTracks"
                :title="String(journalAudioModule?.title || '')"
                :title-rich-text="String(journalAudioModule?.titleRichText || '')"
                :subtitle="String(journalAudioModule?.subtitle || '')"
                :subtitle-rich-text="String(journalAudioModule?.subtitleRichText || '')"
                :issue-code="String(issueForm.code || '')"
                :media-urls="audioPreviewMediaUrls"
                @pick="pickAudioKey"
                @open-detail="openAudioTrackDetail"
                @switch-view="setAudioPreviewView"
              />
            </template>
            <template v-else-if="activeContentSection === 'journal-story' && storyEditorTab === 'detail'">
              <StoryDetailPreview
                :active-key="activeStoryDetailKey"
                :issue-code="String(issueForm.code || '')"
                :title="journalCoverTitle"
                :title-rich-text="journalCoverTitleRichText"
                :intro="storyDetailIntro"
                :intro-rich-text="storyDetailIntroRichText"
                :image-url="storyDetailImageUrl"
                :alt-text="String(storyDetailModule?.altText || '')"
                :caption-left="String(storyDetailModule?.detailCaptionLeft || storyDetailModule?.captionLeft || '')"
                :caption-left-rich-text="String(storyDetailModule?.detailCaptionLeftRichText || storyDetailModule?.captionLeftRichText || '')"
                :caption-right="String(storyDetailModule?.detailCaptionRight || '人物纪实')"
                :caption-right-rich-text="String(storyDetailModule?.detailCaptionRightRichText || '')"
                :source="String(storyDetailModule?.detailSource || '')"
                :source-rich-text="String(storyDetailModule?.detailSourceRichText || '')"
                :paragraph1="String(storyDetailModule?.detailParagraph1 || '')"
                :paragraph1-rich-text="String(storyDetailModule?.detailParagraph1RichText || '')"
                :paragraph2="String(storyDetailModule?.detailParagraph2 || '')"
                :paragraph2-rich-text="String(storyDetailModule?.detailParagraph2RichText || '')"
                :quote="String(storyDetailModule?.detailQuote || '')"
                :quote-rich-text="String(storyDetailModule?.detailQuoteRichText || '')"
                :official-article-url="String(storyDetailModule?.officialArticleUrl || '')"
                @pick="pickStoryDetailKey"
                @pick-from-home="editStoryHeadlineFromHome"
              />
            </template>
            <template v-else>
              <JournalHomePreview
                :modules="issueForm.draftContent.sections"
                :image-urls="issueModulePreviewUrls"
                :background-image-url="homeBackgroundPreviewUrl"
                :active-key="selectedIssueModuleId"
                :issue-number="journalPreviewIssueNumber"
                :issue-number-rich-text="journalPreviewIssueNumberRichText"
                :issue-edition="journalPreviewIssueEdition"
                :issue-edition-rich-text="journalPreviewIssueEditionRichText"
                :issue-edition-suffix="journalPreviewIssueEditionSuffix"
                :question-fallback="issueForm.question"
                :question-fallback-rich-text="issueForm.questionRichText"
                :theme-fallback="issueForm.theme"
                :theme-fallback-rich-text="issueForm.themeRichText"
                @pick="focusIssueModule"
              />
            </template>
          </aside>
          <form class="panel issue-editor-form journal-module-form" novalidate @submit.prevent="saveIssue" @focusin="focusModuleFromEditor">
          <div class="journal-context">
            <div class="journal-context-copy">
              <p class="eyebrow">CURRENT ISSUE</p>
              <strong><RichTextView inline :text="issueForm.label" :rich-text="issueForm.labelRichText" fallback="未选择期刊" /><span v-if="issueForm.month || issueForm.monthRichText" class="journal-context-month"><RichTextView inline :text="issueForm.month" :rich-text="issueForm.monthRichText" /></span></strong>
              <div class="journal-context-meta">
                <span class="journal-status-pill" :class="'is-' + issueForm.status">{{ journalIssueStatusLabel(issueForm.status) }}</span>
                <small>{{ issueForm.code || '未设置期号' }}</small>
                <small>·</small>
                <small>草稿 v{{ editingIssueEditVersion || 1 }}</small>
              </div>
            </div>
            <label class="journal-context-select">切换期刊<select :value="editingIssueId" @change="selectJournalIssue"><option value="" disabled>请选择期刊</option><option v-for="item in issues" :key="item.id" :value="item.id">{{ item.label }} · {{ item.month }} · {{ journalIssueStatusLabel(item.status) }}</option></select></label>
            <button type="button" class="quiet journal-section-back" @click="goToJournalSection('journal-list')">返回期刊列表</button>
          </div>
          <div v-if="!editingIssueId" class="journal-empty-state"><strong>还没有选择期刊</strong><p>从上方选择一份期刊，或先到「期刊列表」新建草稿，再回来编辑这个模块。</p><button type="button" @click="goToJournalSection('journal-list')">去期刊列表</button></div>
          <template v-else>
            <section v-if="activeContentSection === 'journal-home'" class="journal-meta-panel">
              <div class="section-heading"><div><p class="eyebrow">ISSUE META</p><h3>刊期信息</h3></div><small>首页顶部显示</small></div>
              <label>首页顶部介绍<input v-model="journalHomeIntroduction" maxlength="120" aria-describedby="home-introduction-help" /></label>
              <p id="home-introduction-help" class="field-help">显示在首页品牌栏下方，最多 120 字。留空则隐藏；保存整份草稿并确认发布后生效。</p>
              <div class="journal-meta-grid">
                <div class="journal-meta-column">
                  <label class="journal-issue-field" data-issue-field="code" :class="{ 'is-invalid': issueFieldErrors.code }">期刊编号<input v-model="issueForm.code" required minlength="2" maxlength="64" :aria-invalid="Boolean(issueFieldErrors.code)" @input="clearIssueFieldError('code')" /><small v-if="issueFieldErrors.code" class="field-inline-error" role="alert">{{ issueFieldErrors.code }}</small></label>
                  <div class="journal-issue-field" data-issue-field="month" :class="{ 'is-invalid': issueFieldErrors.month }"><JournalRichTextField :model-value="issueForm.month" :rich-text="issueForm.monthRichText" label="刊期月份" :invalid="Boolean(issueFieldErrors.month)" :error="issueFieldErrors.month || ''" @update:model-value="setIssueBaseField('month', $event)" @update:rich-text="setIssueBaseRichText('month', $event)" /></div>
                  <label class="journal-issue-field" data-issue-field="edition" :class="{ 'is-invalid': issueFieldErrors.edition }">英文刊期标识<input v-model="journalIssueEdition" maxlength="40" placeholder="A CURATED EDITION" :aria-invalid="Boolean(issueFieldErrors.edition)" aria-describedby="issue-edition-help-edit" @input="clearIssueFieldError('edition')" /><small v-if="issueFieldErrors.edition" class="field-inline-error" role="alert">{{ issueFieldErrors.edition }}</small><small id="issue-edition-help-edit" class="field-help">显示在刊期月份右侧；留空后隐藏；保存草稿并确认发布后生效。</small></label>
                </div>
                <div class="journal-meta-column">
                  <div class="journal-issue-field" data-issue-field="label" :class="{ 'is-invalid': issueFieldErrors.label }"><JournalRichTextField :model-value="issueForm.label" :rich-text="issueForm.labelRichText" label="期刊标签" :invalid="Boolean(issueFieldErrors.label)" :error="issueFieldErrors.label || ''" @update:model-value="setIssueBaseField('label', $event)" @update:rich-text="setIssueBaseRichText('label', $event)" /></div>
                </div>
              </div>
              <div class="journal-derived-grid">
                <div><small>本期主题 · 取自封面标题</small><strong><RichTextView inline :text="journalCoverTitle" :rich-text="journalCoverTitleRichText" fallback="尚未填写" /></strong><button type="button" class="quiet" :disabled="!journalCoverModule" @click="selectJournalModule(journalCoverModule)">去修改封面</button></div>
                <div><small>本期问题 · 取自主页问题栏目</small><strong><RichTextView inline :text="journalQuestionTitle" :rich-text="journalQuestionTitleRichText" fallback="尚未填写" /></strong><button type="button" class="quiet" :disabled="!journalQuestionModule" @click="selectJournalModule(journalQuestionModule)">去修改问题</button></div>
              </div>
            </section>
            <section v-if="activeContentSection === 'journal-home'" class="journal-background-panel" aria-labelledby="home-background-title">
              <div class="journal-background-thumb" :class="{ 'is-loading': homeBackgroundPreviewLoading }">
                <img v-if="homeBackgroundPreviewUrl" :src="homeBackgroundPreviewUrl" alt="首页底图预览" />
                <span v-else-if="homeBackgroundPreviewLoading">正在载入…</span>
                <svg v-else class="journal-background-mark" viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="7" width="32" height="34" rx="3"/><circle cx="18" cy="17" r="3"/><path d="m11 34 9-10 6 6 4-4 7 8"/></svg>
              </div>
              <div class="journal-background-copy">
                <p class="eyebrow">HOME BACKGROUND</p>
                <h3 id="home-background-title">首页底图</h3>
              </div>
              <div class="journal-background-actions">
                <button type="button" :disabled="uploading || issueConflict || homeBackgroundPreviewLoading" @click="openHomeBackgroundPicker">{{ issueForm.homeBackgroundObjectKey ? '替换底图' : '上传底图' }}</button>
                <button v-if="issueForm.homeBackgroundObjectKey" type="button" class="quiet" :disabled="uploading || issueConflict" @click="removeHomeBackground">移除</button>
              </div>
              <p v-if="homeBackgroundError" class="error" role="alert">{{ homeBackgroundError }}</p>
              <input ref="homeBackgroundFileInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="selectHomeBackgroundFile" />
            </section>
            <div v-if="activeContentSection === 'journal-story'" class="story-editor-tabs">
              <div class="story-editor-tab-group" role="tablist" aria-label="人物故事编辑页面">
                <button type="button" role="tab" :class="{ 'is-active': storyEditorTab === 'home' }" :aria-selected="storyEditorTab === 'home'" @click="setStoryEditorTab('home')">首页入口</button>
                <button type="button" role="tab" :class="{ 'is-active': storyEditorTab === 'detail' }" :aria-selected="storyEditorTab === 'detail'" @click="setStoryEditorTab('detail')">详情页</button>
              </div>
              <p class="field-help">{{ storyEditorTab === 'home' ? '首页那张人物纪实卡片：图片、引言与图上两行说明。' : '点进卡片后的独立页面：图片说明、文章来源、正文两段、结尾引言与公众号链接保存后一起生效。' }}</p>
            </div>
            <div v-if="activeContentSection !== 'journal-discussion' && (activeContentSection !== 'journal-story' || storyEditorTab === 'home')" class="journal-module-toolbar-wrap">
              <div class="issue-module-toolbar"><h3>{{ journalModuleWorkspaceTitle }}</h3><select v-if="journalAddableModuleTypes.length" aria-label="新增栏目类型" @change="(event) => { const target = event.target as HTMLSelectElement; if (target.value) { addIssueModule(target.value as ManagedIssueModule['type']); target.value = ''; } }"><option value="">＋ 新增栏目</option><option v-for="type in journalAddableModuleTypes" :key="type" :value="type">{{ issueModuleTypeLabel(type) }}</option></select></div>
              <p class="field-help">选择一个栏目进行编辑；启用、排序与删除只改这份草稿。保存会写入整期，发布也会整期一起生效。</p>
              <nav class="issue-module-picker" aria-label="选择要编辑的栏目"><button v-for="(module, index) in issueForm.draftContent.sections" v-show="isIssueModuleVisibleInJournalSection(module)" :key="module.id" type="button" :class="{ active: selectedIssueModuleId === module.id }" :aria-pressed="selectedIssueModuleId === module.id" @click="selectedIssueModuleId = module.id"><small>{{ String(index + 1).padStart(2, '0') }}</small><span>{{ issueModuleLabel(module) }}</span><em :class="{ 'is-hidden': !module.enabled }">{{ module.enabled ? '显示' : '隐藏' }}</em></button></nav>
              <p v-if="!issueForm.draftContent.sections.some(isIssueModuleVisibleInJournalSection)" class="field-help">这个模块还没有栏目。到「首页策展」新增对应栏目后再回来编辑。</p>
            </div>
            <details v-if="activeContentSection === 'journal-discussion'" class="issue-module-details discussion-editor-details" open>
              <summary>本期讨论页文案与示例对话</summary>
              <p class="field-help">示例经历与编辑追问只用于排版演示。用户主动保存的正文会进入审核队列并加密存储；本编辑器只维护固定文案与示例，不会自动发布用户内容。</p>
              <div class="discussion-save-bar">
                <div>
                  <strong>独立保存与发布</strong>
                  <p class="field-help">这里只更新本期讨论页，不需要重发整期期刊。发布后小程序会读取新版讨论内容；读者分享的发布与精华在「一起谈谈内容」中处理，会员发布权限在「一起谈谈权限」中单独管理。</p>
                  <p v-if="discussionPageLoading" class="muted" role="status">正在读取本期讨论的独立草稿…</p>
                  <p v-else-if="discussionPagePublishedVersion" class="field-help">线上：第 {{ discussionPagePublishedVersion }} 版<span v-if="discussionPagePublishedAt"> · {{ displayDate(discussionPagePublishedAt) }}</span></p>
                  <p v-else class="field-help">线上尚未单独发布；小程序当前仍显示整期发布时的讨论内容。</p>
                  <p v-if="discussionPageMessage" class="status-message" role="status">{{ discussionPageMessage }}</p>
                  <p v-if="discussionPageError" class="error" role="alert">{{ discussionPageError }}</p>
                </div>
                <div class="form-actions">
                  <button type="button" class="quiet" :disabled="discussionPageLoading || discussionPageSaving || discussionPagePublishing" @click="saveDiscussionPage(false)">{{ discussionPageSaving ? '保存中…' : '保存讨论草稿' }}</button>
                  <button type="button" :disabled="discussionPageLoading || discussionPageSaving || discussionPagePublishing" @click="saveDiscussionPage(true)">{{ discussionPagePublishing ? '发布中…' : '发布本期讨论' }}</button>
                </div>
              </div>
              <div class="discussion-copy-grid">
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.number" :rich-text="discussionCopyRichText('number')" label="栏目序号" @update:rich-text="setDiscussionCopyRichText('number', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.kicker" :rich-text="discussionCopyRichText('kicker')" label="栏目眉题" @update:rich-text="setDiscussionCopyRichText('kicker', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.issueLine" :rich-text="discussionCopyRichText('issueLine')" label="期刊提示" @update:rich-text="setDiscussionCopyRichText('issueLine', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.title" :rich-text="discussionCopyRichText('title')" label="主标题" @update:rich-text="setDiscussionCopyRichText('title', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.intro" :rich-text="discussionCopyRichText('intro')" label="开场提问" @update:rich-text="setDiscussionCopyRichText('intro', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.paragraph1" :rich-text="discussionCopyRichText('paragraph1')" label="第一段" @update:rich-text="setDiscussionCopyRichText('paragraph1', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.paragraph2" :rich-text="discussionCopyRichText('paragraph2')" label="第二段" @update:rich-text="setDiscussionCopyRichText('paragraph2', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.paragraph3" :rich-text="discussionCopyRichText('paragraph3')" label="第三段" @update:rich-text="setDiscussionCopyRichText('paragraph3', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.writeAction" :rich-text="discussionCopyRichText('writeAction')" label="写入按钮" @update:rich-text="setDiscussionCopyRichText('writeAction', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.voicesTitle" :rich-text="discussionCopyRichText('voicesTitle')" label="讨论区标题" @update:rich-text="setDiscussionCopyRichText('voicesTitle', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.exampleBadge" :rich-text="discussionCopyRichText('exampleBadge')" label="示例标记" @update:rich-text="setDiscussionCopyRichText('exampleBadge', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.exampleNotice" :rich-text="discussionCopyRichText('exampleNotice')" label="示例说明" @update:rich-text="setDiscussionCopyRichText('exampleNotice', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.selfEyebrow" :rich-text="discussionCopyRichText('selfEyebrow')" label="私密观察眉题" @update:rich-text="setDiscussionCopyRichText('selfEyebrow', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.selfTitle" :rich-text="discussionCopyRichText('selfTitle')" label="私密观察标题" @update:rich-text="setDiscussionCopyRichText('selfTitle', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.selfBody" :rich-text="discussionCopyRichText('selfBody')" label="私密观察说明" @update:rich-text="setDiscussionCopyRichText('selfBody', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.selfAction" :rich-text="discussionCopyRichText('selfAction')" label="私密观察按钮" @update:rich-text="setDiscussionCopyRichText('selfAction', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composeTitle" :rich-text="discussionCopyRichText('composeTitle')" label="写作页标题" @update:rich-text="setDiscussionCopyRichText('composeTitle', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composeHeading" :rich-text="discussionCopyRichText('composeHeading')" label="写作页主标题" @update:rich-text="setDiscussionCopyRichText('composeHeading', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composeFieldLabel" :rich-text="discussionCopyRichText('composeFieldLabel')" label="写作字段名称" @update:rich-text="setDiscussionCopyRichText('composeFieldLabel', $event)" /></div>
                <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composePlaceholder" :rich-text="discussionCopyRichText('composePlaceholder')" label="输入提示" @update:rich-text="setDiscussionCopyRichText('composePlaceholder', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composePreviewAction" :rich-text="discussionCopyRichText('composePreviewAction')" label="写作页主按钮文字" @update:rich-text="setDiscussionCopyRichText('composePreviewAction', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composeSaveAction" :rich-text="discussionCopyRichText('composeSaveAction')" label="预览页确认提交按钮文字" @update:rich-text="setDiscussionCopyRichText('composeSaveAction', $event)" /></div>
                <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.composeDiscardAction" :rich-text="discussionCopyRichText('composeDiscardAction')" label="放弃操作文字" @update:rich-text="setDiscussionCopyRichText('composeDiscardAction', $event)" /></div>
              </div>
              <section class="discussion-detail-copy">
                <div class="discussion-detail-copy-heading">
                  <div><p class="eyebrow">THREAD DETAIL</p><h4>一段对话详情页</h4></div>
                  <small>小程序 pages/discussion-thread</small>
                </div>
                <p class="field-help">配置首页进入“查看这段对话”后的导航、标题、来源标签、互动按钮、说明和页尾文字。回应来源文案中可使用 {author} 占位符；未填写时会自动使用小程序内置默认文案。</p>
                <div class="discussion-copy-grid">
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailNavTitle" :rich-text="discussionCopyRichText('detailNavTitle')" label="顶部导航标题" @update:rich-text="setDiscussionCopyRichText('detailNavTitle', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailKicker" :rich-text="discussionCopyRichText('detailKicker')" label="详情页眉题" @update:rich-text="setDiscussionCopyRichText('detailKicker', $event)" /></div>
                  <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailTitle" :rich-text="discussionCopyRichText('detailTitle')" label="详情页主标题" @update:rich-text="setDiscussionCopyRichText('detailTitle', $event)" /></div>
                  <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailNote" :rich-text="discussionCopyRichText('detailNote')" label="标题下提示" @update:rich-text="setDiscussionCopyRichText('detailNote', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.exampleLabel" :rich-text="discussionCopyRichText('exampleLabel')" label="示例来源标签" @update:rich-text="setDiscussionCopyRichText('exampleLabel', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.communityLabel" :rich-text="discussionCopyRichText('communityLabel')" label="读者分享标签" @update:rich-text="setDiscussionCopyRichText('communityLabel', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.featuredLabel" :rich-text="discussionCopyRichText('featuredLabel')" label="精华标签" @update:rich-text="setDiscussionCopyRichText('featuredLabel', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.localLabel" :rich-text="discussionCopyRichText('localLabel')" label="本机发言标签" @update:rich-text="setDiscussionCopyRichText('localLabel', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.repliesTitle" :rich-text="discussionCopyRichText('repliesTitle')" label="回应区标题" @update:rich-text="setDiscussionCopyRichText('repliesTitle', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.replyAction" :rich-text="discussionCopyRichText('replyAction')" label="回应按钮前缀" @update:rich-text="setDiscussionCopyRichText('replyAction', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.reportAction" :rich-text="discussionCopyRichText('reportAction')" label="举报按钮文字" @update:rich-text="setDiscussionCopyRichText('reportAction', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.reportedAction" :rich-text="discussionCopyRichText('reportedAction')" label="已举报文字" @update:rich-text="setDiscussionCopyRichText('reportedAction', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.replyContextExample" :rich-text="discussionCopyRichText('replyContextExample')" label="示例回应来源（用 {author}）" @update:rich-text="setDiscussionCopyRichText('replyContextExample', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.replyContextCommunity" :rich-text="discussionCopyRichText('replyContextCommunity')" label="读者回应来源（用 {author}）" @update:rich-text="setDiscussionCopyRichText('replyContextCommunity', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.footerPrimary" :rich-text="discussionCopyRichText('footerPrimary')" label="页尾主按钮" @update:rich-text="setDiscussionCopyRichText('footerPrimary', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.footerSecondary" :rich-text="discussionCopyRichText('footerSecondary')" label="页尾次按钮" @update:rich-text="setDiscussionCopyRichText('footerSecondary', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailMoreTitle" :rich-text="discussionCopyRichText('detailMoreTitle')" label="更多说明弹窗标题" @update:rich-text="setDiscussionCopyRichText('detailMoreTitle', $event)" /></div>
                  <div class="discussion-field-wide"><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailMoreBody" :rich-text="discussionCopyRichText('detailMoreBody')" label="更多说明弹窗正文" @update:rich-text="setDiscussionCopyRichText('detailMoreBody', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailLoading" :rich-text="discussionCopyRichText('detailLoading')" label="加载中文案" @update:rich-text="setDiscussionCopyRichText('detailLoading', $event)" /></div>
                  <div><JournalRichTextField v-model="issueForm.draftContent.discussion.copy.detailRetry" :rich-text="discussionCopyRichText('detailRetry')" label="重新读取文字" @update:rich-text="setDiscussionCopyRichText('detailRetry', $event)" /></div>
                </div>
              </section>
              <div class="discussion-thread-toolbar"><h4>读者经历与回应</h4><button type="button" class="quiet" :disabled="issueForm.draftContent.discussion.threads.length >= 20" @click="addDiscussionThread">＋ 添加示例经历</button></div>
              <article v-for="(thread, threadIndex) in issueForm.draftContent.discussion.threads" :key="thread.id" class="discussion-thread-editor">
                <header><strong>{{ String(threadIndex + 1).padStart(2, '0') }} · 示例经历</strong><button type="button" class="quiet" :disabled="threadIndex === 0" aria-label="上移示例经历" @click="moveDiscussionThread(threadIndex, -1)">↑</button><button type="button" class="quiet" :disabled="threadIndex === issueForm.draftContent.discussion.threads.length - 1" aria-label="下移示例经历" @click="moveDiscussionThread(threadIndex, 1)">↓</button><button type="button" class="quiet danger" @click="removeDiscussionThread(threadIndex)">删除经历</button></header>
                <label>示例称呼<input v-model="thread.author" required maxlength="40" /></label>
                <div><JournalRichTextField v-model="thread.body" v-model:rich-text="thread.bodyRichText" label="经历正文" /></div>
                <div class="discussion-thread-toolbar"><strong>编辑回应</strong><button type="button" class="quiet" :disabled="thread.replies.length >= 20" @click="addDiscussionReply(threadIndex)">＋ 添加回应</button></div>
                <div v-for="(reply, replyIndex) in thread.replies" :key="reply.id" class="discussion-reply-editor">
                  <div class="discussion-reply-toolbar"><label>回应署名<input v-model="reply.author" required maxlength="40" /></label><button type="button" class="quiet" :disabled="replyIndex === 0" aria-label="上移回应" @click="moveDiscussionReply(threadIndex, replyIndex, -1)">↑</button><button type="button" class="quiet" :disabled="replyIndex === thread.replies.length - 1" aria-label="下移回应" @click="moveDiscussionReply(threadIndex, replyIndex, 1)">↓</button><button type="button" class="quiet danger" @click="removeDiscussionReply(threadIndex, replyIndex)">删除回应</button></div>
                  <div><JournalRichTextField v-model="reply.body" v-model:rich-text="reply.bodyRichText" label="回应正文" /></div>
                </div>
              </article>
              <details class="issue-preview-disclosure discussion-live-preview">
                <summary><span>手机页面预览</span><span>内容随下方草稿修改</span></summary>
                <div class="discussion-phone-preview">
                  <header><span>‹</span><strong>本期讨论</strong><span>···</span></header>
                  <div class="discussion-phone-body">
                    <small><RichTextView inline :text="discussionCopyText('number')" :rich-text="discussionCopyRichText('number')" />　<RichTextView inline :text="discussionCopyText('kicker')" :rich-text="discussionCopyRichText('kicker')" /></small>
                    <p class="discussion-phone-issue"><RichTextView inline :text="discussionCopyText('issueLine')" :rich-text="discussionCopyRichText('issueLine')" /></p>
                    <h3><RichTextView inline :text="discussionCopyText('title')" :rich-text="discussionCopyRichText('title')" /></h3><p><RichTextView inline :text="discussionCopyText('intro')" :rich-text="discussionCopyRichText('intro')" /></p>
                    <p><RichTextView inline :text="discussionCopyText('paragraph1')" :rich-text="discussionCopyRichText('paragraph1')" /></p><p><RichTextView inline :text="discussionCopyText('paragraph2')" :rich-text="discussionCopyRichText('paragraph2')" /></p><p><RichTextView inline :text="discussionCopyText('paragraph3')" :rich-text="discussionCopyRichText('paragraph3')" /></p>
                    <div class="discussion-phone-link"><RichTextView inline :text="discussionCopyText('writeAction')" :rich-text="discussionCopyRichText('writeAction')" /> <span>↗</span></div>
                    <section v-for="thread in issueForm.draftContent.discussion.threads" :key="thread.id"><small>{{ thread.author }}　示例</small><RichTextView :text="thread.body" :rich-text="thread.bodyRichText || ''" /><article v-for="reply in thread.replies" :key="reply.id"><small>{{ reply.author }} · 示例</small><RichTextView :text="reply.body" :rich-text="reply.bodyRichText || ''" /></article></section>
                    <section><small><RichTextView inline :text="discussionCopyText('selfEyebrow')" :rich-text="discussionCopyRichText('selfEyebrow')" /></small><h3><RichTextView inline :text="discussionCopyText('selfTitle')" :rich-text="discussionCopyRichText('selfTitle')" /></h3><p><RichTextView inline :text="discussionCopyText('selfBody')" :rich-text="discussionCopyRichText('selfBody')" /></p></section>
                  </div>
                </div>
              </details>
              <details class="issue-preview-disclosure discussion-live-preview">
                <summary><span>一段对话详情页手机预览</span><span>使用第一条示例经历</span></summary>
                <div class="discussion-phone-preview discussion-thread-phone-preview">
                  <header><span>‹</span><strong><RichTextView inline :text="discussionCopyText('detailNavTitle')" :rich-text="discussionCopyRichText('detailNavTitle')" /></strong><span>···</span></header>
                  <div class="discussion-phone-body">
                    <small><RichTextView inline :text="discussionCopyText('number')" :rich-text="discussionCopyRichText('number')" />　<RichTextView inline :text="discussionCopyText('detailKicker')" :rich-text="discussionCopyRichText('detailKicker')" /></small>
                    <h3><RichTextView inline :text="discussionCopyText('detailTitle')" :rich-text="discussionCopyRichText('detailTitle')" /></h3>
                    <p><RichTextView inline :text="discussionCopyText('intro')" :rich-text="discussionCopyRichText('intro')" /></p>
                    <p class="discussion-thread-preview-note"><RichTextView inline :text="discussionCopyText('detailNote')" :rich-text="discussionCopyRichText('detailNote')" /></p>
                    <section v-if="issueForm.draftContent.discussion.threads[0]" class="discussion-thread-preview-origin">
                      <small><strong>{{ issueForm.draftContent.discussion.threads[0].author }}</strong>　<RichTextView inline :text="discussionCopyText('exampleLabel')" :rich-text="discussionCopyRichText('exampleLabel')" /></small>
                      <RichTextView :text="issueForm.draftContent.discussion.threads[0].body" :rich-text="issueForm.draftContent.discussion.threads[0].bodyRichText || ''" />
                      <div class="discussion-thread-preview-actions">
                        <span><RichTextView inline :text="discussionCopyText('replyAction')" :rich-text="discussionCopyRichText('replyAction')" /> {{ issueForm.draftContent.discussion.threads[0].author }} ↗</span>
                        <span><RichTextView inline :text="discussionCopyText('reportAction')" :rich-text="discussionCopyRichText('reportAction')" /></span>
                      </div>
                    </section>
                    <section v-if="issueForm.draftContent.discussion.threads[0]" class="discussion-thread-preview-replies">
                      <h4><RichTextView inline :text="discussionCopyText('repliesTitle')" :rich-text="discussionCopyRichText('repliesTitle')" /></h4>
                      <article v-for="reply in issueForm.draftContent.discussion.threads[0].replies.slice(0, 2)" :key="reply.id">
                        <small><strong>{{ reply.author }}</strong>　<RichTextView inline :text="discussionCopyText('exampleLabel')" :rich-text="discussionCopyRichText('exampleLabel')" /></small>
                        <RichTextView :text="reply.body" :rich-text="reply.bodyRichText || ''" />
                      </article>
                    </section>
                    <div class="discussion-thread-preview-footer"><span><RichTextView inline :text="discussionCopyText('footerPrimary')" :rich-text="discussionCopyRichText('footerPrimary')" /> <small>→</small></span><span><RichTextView inline :text="discussionCopyText('footerSecondary')" :rich-text="discussionCopyRichText('footerSecondary')" /> <small>→</small></span></div>
                  </div>
                </div>
              </details>
              <details class="issue-preview-disclosure discussion-live-preview">
                <summary><span>写作页面手机预览</span><span>草稿文案预览，不会发布</span></summary>
                <div class="discussion-phone-preview discussion-compose-phone-preview">
                  <header><span>‹</span><strong><RichTextView inline :text="discussionCopyText('composeTitle')" :rich-text="discussionCopyRichText('composeTitle')" /></strong><span>···</span></header>
                  <div class="discussion-phone-body">
                    <small><RichTextView inline :text="discussionCopyText('number')" :rich-text="discussionCopyRichText('number')" />　<RichTextView inline :text="discussionCopyText('composeTitle')" :rich-text="discussionCopyRichText('composeTitle')" /></small>
                    <h3><RichTextView inline :text="discussionCopyText('composeHeading')" :rich-text="discussionCopyRichText('composeHeading')" /></h3>
                    <p><RichTextView inline :text="discussionCopyText('intro')" :rich-text="discussionCopyRichText('intro')" /></p>
                    <div class="discussion-compose-preview-label"><RichTextView inline :text="discussionCopyText('composeFieldLabel')" :rich-text="discussionCopyRichText('composeFieldLabel')" /></div>
                    <div class="discussion-compose-preview-input"><RichTextView inline :text="discussionCopyText('composePlaceholder')" :rich-text="discussionCopyRichText('composePlaceholder')" /></div>
                    <div class="discussion-compose-preview-count">0 / 2000</div>
                    <div class="discussion-phone-primary">
                      <div class="discussion-phone-primary-copy">
                        <RichTextView inline :text="discussionCopyText('composePreviewAction')" :rich-text="discussionCopyRichText('composePreviewAction')" />
                        <small>下一步：预览确认后，提交审核</small>
                      </div>
                      <span>→</span>
                    </div>
                    <div class="discussion-compose-preview-actions"><span>保存草稿并退出</span><span><RichTextView inline :text="discussionCopyText('composeDiscardAction')" :rich-text="discussionCopyRichText('composeDiscardAction')" /></span></div>
                  </div>
                </div>
              </details>
            </details>
            <datalist id="issue-module-page-presets"><option value="/pages/home/index">首页</option><option value="/pages/story-detail/index?id=story">人物故事</option><option value="/pages/audio/index">本期微声音</option><option value="/pages/practice/index">实践</option><option value="/pages/about/index">关于</option><option value="/pages/archive/index">往期档案</option><option value="/pages/daily-objects/index">日常之物</option><option value="/pages/shared-practice/index">共同实践</option><option value="/pages/contact-support/index">联系客服</option></datalist>
                        <section v-if="activeContentSection === 'journal-story' && storyEditorTab === 'detail'" class="story-detail-editor" @focusin="focusStoryDetailField">
              <div class="section-heading"><div><p class="eyebrow">STORY DETAIL</p><h3>人物故事详情页</h3></div><small>小程序 pages/story-detail</small></div>
              <template v-if="storyDetailModule">
                <div class="form-grid">
                  <div data-story-field="caption-left"><JournalRichTextField :model-value="issueModuleString(storyDetailModule, 'detailCaptionLeft')" :rich-text="issueModuleString(storyDetailModule, 'detailCaptionLeftRichText')" label="详情图片左侧说明" @update:model-value="setIssueModuleString(storyDetailModule, 'detailCaptionLeft', $event)" @update:rich-text="setIssueModuleString(storyDetailModule, 'detailCaptionLeftRichText', $event)" /></div>
                  <div data-story-field="caption-right"><JournalRichTextField :model-value="issueModuleString(storyDetailModule, 'detailCaptionRight')" :rich-text="issueModuleString(storyDetailModule, 'detailCaptionRightRichText')" label="详情图片右侧说明" @update:model-value="setIssueModuleString(storyDetailModule, 'detailCaptionRight', $event)" @update:rich-text="setIssueModuleString(storyDetailModule, 'detailCaptionRightRichText', $event)" /></div>
                  <div data-story-field="source"><JournalRichTextField :model-value="issueModuleString(storyDetailModule, 'detailSource')" :rich-text="issueModuleString(storyDetailModule, 'detailSourceRichText')" label="文章来源说明" @update:model-value="setIssueModuleString(storyDetailModule, 'detailSource', $event)" @update:rich-text="setIssueModuleString(storyDetailModule, 'detailSourceRichText', $event)" /></div>
                  <label data-story-field="article-url">公众号文章链接<input type="url" :value="String(storyDetailModule.officialArticleUrl || '')" maxlength="2048" placeholder="https://mp.weixin.qq.com/s/..." @input="setIssueModuleText(storyDetailModule, 'officialArticleUrl', $event)" /></label>
                  <div data-story-field="paragraph1"><JournalRichTextField :model-value="issueModuleString(storyDetailModule, 'detailParagraph1')" :rich-text="issueModuleString(storyDetailModule, 'detailParagraph1RichText')" label="故事正文第一段" @update:model-value="setIssueModuleString(storyDetailModule, 'detailParagraph1', $event)" @update:rich-text="setIssueModuleString(storyDetailModule, 'detailParagraph1RichText', $event)" /></div>
                  <div data-story-field="paragraph2"><JournalRichTextField :model-value="issueModuleString(storyDetailModule, 'detailParagraph2')" :rich-text="issueModuleString(storyDetailModule, 'detailParagraph2RichText')" label="故事正文第二段" @update:model-value="setIssueModuleString(storyDetailModule, 'detailParagraph2', $event)" @update:rich-text="setIssueModuleString(storyDetailModule, 'detailParagraph2RichText', $event)" /></div>
                  <div data-story-field="quote"><JournalRichTextField :model-value="issueModuleString(storyDetailModule, 'detailQuote')" :rich-text="issueModuleString(storyDetailModule, 'detailQuoteRichText')" label="结尾引言" @update:model-value="setIssueModuleString(storyDetailModule, 'detailQuote', $event)" @update:rich-text="setIssueModuleString(storyDetailModule, 'detailQuoteRichText', $event)" /></div>
                </div>
              </template>
              <p v-else class="field-help">这一期还没有「人物纪实」栏目，先到「首页策展」补一个再回来。</p>
            </section>
<div v-if="activeContentSection !== 'journal-discussion' && (activeContentSection !== 'journal-story' || storyEditorTab === 'home')" class="issue-module-list"><article v-for="(module, index) in issueForm.draftContent.sections" v-show="selectedIssueModuleId === module.id && isIssueModuleVisibleInJournalSection(module)" :key="module.id" :data-issue-module="module.id" class="issue-module-card">
              <header><span>{{ String(index + 1).padStart(2, '0') }} · {{ issueModuleLabel(module) }}</span><label class="issue-module-toggle"><input v-model="module.enabled" type="checkbox" />启用</label><button type="button" class="quiet" :disabled="index === 0" aria-label="上移栏目" @click="moveIssueModule(index, -1)">↑</button><button type="button" class="quiet" :disabled="index === issueForm.draftContent.sections.length - 1" aria-label="下移栏目" @click="moveIssueModule(index, 1)">↓</button><button v-if="!['issueMeta','coverStory','cover','opener','question','observationAction','sharedPracticeAction'].includes(module.type)" type="button" class="quiet danger" aria-label="删除栏目" @click="removeIssueModule(index)">删除</button></header>
              <div v-if="module.type === 'coverStory' || module.type === 'cover' || module.type === 'story' || module.type === 'image'" class="form-grid"><label v-if="module.type === 'coverStory' || module.type === 'cover' || module.type === 'story' || module.type === 'image'">上传 / 替换图片<input type="file" accept="image/jpeg,image/png,image/webp" @change="selectIssueModuleFile(module, $event)" /></label><label>图片对象路径<input :value="String(module.imageObjectKey || '')" placeholder="content/image/..." @input="setIssueModuleText(module, 'imageObjectKey', $event)" /></label><label>图片替代文本<input :value="String(module.altText || '')" @input="setIssueModuleText(module, 'altText', $event)" /></label></div>
              <div v-if="module.type === 'coverStory' || module.type === 'cover' || module.type === 'story'" class="journal-issue-field" :data-issue-field="module.type === 'coverStory' || module.type === 'cover' ? 'theme' : undefined" :class="{ 'is-invalid': (module.type === 'coverStory' || module.type === 'cover') && issueFieldErrors.theme }"><div><JournalRichTextField :model-value="issueModuleString(module, 'title')" :rich-text="issueModuleString(module, 'titleRichText')" :label="module.type === 'story' ? '标题 / 人物引言' : '本期主题'" :invalid="module.type === 'coverStory' || module.type === 'cover' ? Boolean(issueFieldErrors.theme) : false" :error="module.type === 'coverStory' || module.type === 'cover' ? issueFieldErrors.theme || '' : ''" @update:model-value="setIssueModuleString(module, 'title', $event)" @update:rich-text="setIssueModuleString(module, 'titleRichText', $event)" /></div></div>
              <div v-else-if="module.type === 'contents'"><div><JournalRichTextField :model-value="issueModuleString(module, 'title')" :rich-text="issueModuleString(module, 'titleRichText')" label="目录标题" @update:model-value="setIssueModuleString(module, 'title', $event)" @update:rich-text="setIssueModuleString(module, 'titleRichText', $event)" /></div></div>
              <div v-else-if="module.type === 'archive'"><div><JournalRichTextField :model-value="issueModuleString(module, 'title')" :rich-text="issueModuleString(module, 'titleRichText')" label="档案区标题" @update:model-value="setIssueModuleString(module, 'title', $event)" @update:rich-text="setIssueModuleString(module, 'titleRichText', $event)" /></div></div>
              <div v-else-if="module.type !== 'issueMeta' && module.type !== 'audio'" class="journal-issue-field" :data-issue-field="module.type === 'question' ? 'question' : undefined" :class="{ 'is-invalid': module.type === 'question' && issueFieldErrors.question }"><div><JournalRichTextField :model-value="issueModuleString(module, 'title')" :rich-text="issueModuleString(module, 'titleRichText')" :label="module.type === 'question' ? '本期问题' : '标题 / 引言'" :invalid="module.type === 'question' ? Boolean(issueFieldErrors.question) : false" :error="module.type === 'question' ? issueFieldErrors.question || '' : ''" @update:model-value="setIssueModuleString(module, 'title', $event)" @update:rich-text="setIssueModuleString(module, 'titleRichText', $event)" /></div></div>
              <div v-if="module.type === 'issueMeta' || module.type === 'coverStory' || module.type === 'story' || module.type === 'question'"><div><JournalRichTextField :model-value="issueModuleString(module, 'eyebrow')" :rich-text="issueModuleString(module, 'eyebrowRichText')" label="栏目眉题" @update:model-value="setIssueModuleString(module, 'eyebrow', $event)" @update:rich-text="setIssueModuleString(module, 'eyebrowRichText', $event)" /></div></div>
              <div v-if="module.type === 'story'" class="form-grid"><div><JournalRichTextField :model-value="issueModuleString(module, 'captionLeft')" :rich-text="issueModuleString(module, 'captionLeftRichText')" label="图片左侧说明" @update:model-value="setIssueModuleString(module, 'captionLeft', $event)" @update:rich-text="setIssueModuleString(module, 'captionLeftRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'captionRight')" :rich-text="issueModuleString(module, 'captionRightRichText')" label="图片右侧说明" @update:model-value="setIssueModuleString(module, 'captionRight', $event)" @update:rich-text="setIssueModuleString(module, 'captionRightRichText', $event)" /></div></div>
              <button v-if="module.type === 'story'" type="button" class="quiet story-card-detail-link" @click="setStoryEditorTab('detail')">编辑详情页正文 →</button>
              <div v-if="module.type === 'storyAction'" class="form-grid"><label>跳转目标栏目<input :value="String(module.targetId || 'story')" maxlength="64" @input="setIssueModuleText(module, 'targetId', $event)" /></label></div>
              <div v-if="module.type === 'issueMeta'"><div><JournalRichTextField :model-value="issueModuleString(module, 'month')" :rich-text="issueModuleString(module, 'monthRichText')" label="月份文字" @update:model-value="setIssueModuleString(module, 'month', $event)" @update:rich-text="setIssueModuleString(module, 'monthRichText', $event)" /></div></div>
              <div v-if="module.body !== undefined || ['coverStory','opener','story','question','observationAction','sharedPracticeAction','brandFooter'].includes(module.type)"><div><JournalRichTextField :model-value="issueModuleString(module, 'body')" :rich-text="issueModuleString(module, 'bodyRichText')" label="正文 / 说明" @update:model-value="setIssueModuleString(module, 'body', $event)" @update:rich-text="setIssueModuleString(module, 'bodyRichText', $event)" /></div></div>
              <details v-if="module.type === 'contents'" class="issue-module-details"><summary>编辑四条目录内容</summary><div class="form-grid"><div><JournalRichTextField :model-value="issueModuleString(module, 'entry1Label')" :rich-text="issueModuleString(module, 'entry1LabelRichText')" label="01 栏目" @update:model-value="setIssueModuleString(module, 'entry1Label', $event)" @update:rich-text="setIssueModuleString(module, 'entry1LabelRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry1Summary')" :rich-text="issueModuleString(module, 'entry1SummaryRichText')" label="01 说明" @update:model-value="setIssueModuleString(module, 'entry1Summary', $event)" @update:rich-text="setIssueModuleString(module, 'entry1SummaryRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry2Label')" :rich-text="issueModuleString(module, 'entry2LabelRichText')" label="02 栏目" @update:model-value="setIssueModuleString(module, 'entry2Label', $event)" @update:rich-text="setIssueModuleString(module, 'entry2LabelRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry2Summary')" :rich-text="issueModuleString(module, 'entry2SummaryRichText')" label="02 说明" @update:model-value="setIssueModuleString(module, 'entry2Summary', $event)" @update:rich-text="setIssueModuleString(module, 'entry2SummaryRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry3Label')" :rich-text="issueModuleString(module, 'entry3LabelRichText')" label="03 栏目" @update:model-value="setIssueModuleString(module, 'entry3Label', $event)" @update:rich-text="setIssueModuleString(module, 'entry3LabelRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry3Summary')" :rich-text="issueModuleString(module, 'entry3SummaryRichText')" label="03 说明" @update:model-value="setIssueModuleString(module, 'entry3Summary', $event)" @update:rich-text="setIssueModuleString(module, 'entry3SummaryRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry4Label')" :rich-text="issueModuleString(module, 'entry4LabelRichText')" label="04 栏目" @update:model-value="setIssueModuleString(module, 'entry4Label', $event)" @update:rich-text="setIssueModuleString(module, 'entry4LabelRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entry4Summary')" :rich-text="issueModuleString(module, 'entry4SummaryRichText')" label="04 说明" @update:model-value="setIssueModuleString(module, 'entry4Summary', $event)" @update:rich-text="setIssueModuleString(module, 'entry4SummaryRichText', $event)" /></div></div><p class="field-help">四项分别链接到人物、微声音、观察和共同实践；目标由小程序固定，不接收自定义路由。</p></details>
              <details v-if="module.type === 'archive'" class="issue-module-details"><summary>编辑策展条目</summary><div class="form-grid"><div><JournalRichTextField :model-value="issueModuleString(module, 'entryLabel')" :rich-text="issueModuleString(module, 'entryLabelRichText')" label="刊期说明" @update:model-value="setIssueModuleString(module, 'entryLabel', $event)" @update:rich-text="setIssueModuleString(module, 'entryLabelRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'entryTitle')" :rich-text="issueModuleString(module, 'entryTitleRichText')" label="档案标题" @update:model-value="setIssueModuleString(module, 'entryTitle', $event)" @update:rich-text="setIssueModuleString(module, 'entryTitleRichText', $event)" /></div></div><p class="field-help">当前只展示档案预告；旧期详情入口尚未开放。</p></details>
              <div v-if="module.type === 'coverStory'" class="form-grid cover-story-typography"><label>主题标题字号（rpx）<input type="number" min="20" max="120" step="1" :value="Number(module.titleFontSize || 72)" @input="setIssueModuleText(module, 'titleFontSize', $event)" /></label><label>主题标题颜色<input type="color" :value="String(module.titleColor || '#59483d')" @input="setIssueModuleText(module, 'titleColor', $event)" /></label><label>主题说明字号（rpx）<input type="number" min="20" max="120" step="1" :value="Number(module.bodyFontSize || 30)" @input="setIssueModuleText(module, 'bodyFontSize', $event)" /></label><label>主题说明颜色<input type="color" :value="String(module.bodyColor || '#40362f')" @input="setIssueModuleText(module, 'bodyColor', $event)" /></label></div>
              <div v-if="module.type === 'coverStory'" class="form-grid"><div><JournalRichTextField :model-value="issueModuleString(module, 'captionLeft')" :rich-text="issueModuleString(module, 'captionLeftRichText')" label="封面左侧说明" @update:model-value="setIssueModuleString(module, 'captionLeft', $event)" @update:rich-text="setIssueModuleString(module, 'captionLeftRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'captionRight')" :rich-text="issueModuleString(module, 'captionRightRichText')" label="封面右侧说明" @update:model-value="setIssueModuleString(module, 'captionRight', $event)" @update:rich-text="setIssueModuleString(module, 'captionRightRichText', $event)" /></div><div><JournalRichTextField :model-value="issueModuleString(module, 'byline')" :rich-text="issueModuleString(module, 'bylineRichText')" label="策展署名" @update:model-value="setIssueModuleString(module, 'byline', $event)" @update:rich-text="setIssueModuleString(module, 'bylineRichText', $event)" /></div></div>
              <section v-if="module.type === 'audio'" class="issue-audio-editor" @focusin="focusAudioField">
                <p class="field-help">最多可添加 20 段，每段可以是声音或视频；至少 1 段有可播放文件即可。每段可配置最多 8 个详情页操作模块（小程序页面、网站或分享）。视频建议使用 MP4（H.264），单个文件不超过 200 MB。发布后小程序才会显示更新。</p>
                <div class="form-grid">
                  <div data-audio-field="hero:title"><div><JournalRichTextField :model-value="issueModuleString(module, 'title')" :rich-text="issueModuleString(module, 'titleRichText')" label="列表页标题" @update:model-value="setIssueModuleString(module, 'title', $event)" @update:rich-text="setIssueModuleString(module, 'titleRichText', $event)" /></div></div>
                  <div data-audio-field="hero:subtitle"><div><JournalRichTextField :model-value="issueModuleString(module, 'subtitle')" :rich-text="issueModuleString(module, 'subtitleRichText')" label="列表页副标题" @update:model-value="setIssueModuleString(module, 'subtitle', $event)" @update:rich-text="setIssueModuleString(module, 'subtitleRichText', $event)" /></div></div>
                </div>
                <article v-for="(track, trackIndex) in issueAudioTracks(module)" :key="track.id" :data-audio-track="track.id" class="issue-audio-track">
                  <header><strong>{{ trackIndex === 0 ? '主微声音' : `更多微声音 ${String(trackIndex + 1).padStart(2, '0')}` }}</strong><span class="issue-audio-kind">{{ track.mediaType === 'video' ? '视频' : '声音' }}</span><button v-if="trackIndex > 0" type="button" class="quiet danger" :disabled="uploading" @click="removeIssueAudioTrack(module, trackIndex)">移除</button></header>
                  <div class="form-grid">
                    <label :data-audio-field="`track:${track.id}:type`">媒体类型<select :value="track.mediaType" :disabled="uploading" @change="setIssueAudioTrackMediaType(track, module, $event)"><option value="audio">声音</option><option value="video">视频</option></select></label>
                    <div :data-audio-field="`track:${track.id}:title`"><JournalRichTextField :model-value="issueAudioTrackString(track, 'title')" :rich-text="track.titleRichText || ''" label="列表标题" @update:model-value="setIssueAudioTrackPlainText(track, 'title', $event)" @update:rich-text="setIssueAudioTrackRichText(track, 'title', $event)" /></div>
                    <label :data-audio-field="`track:${track.id}:duration`">时长文字<input :value="track.duration" maxlength="20" placeholder="01:12" @input="setIssueAudioTrackText(track, 'duration', $event)" /></label>
                    <label :data-audio-field="`track:${track.id}:file`">上传 / 替换{{ track.mediaType === 'video' ? '视频' : '音频' }}<input type="file" :accept="track.mediaType === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'audio/mpeg,audio/mp4,audio/wav,audio/x-m4a'" :disabled="uploading" @change="selectIssueAudioTrackFile(module, track, $event)" /></label>
                    <label :data-audio-field="`track:${track.id}:file`">媒体对象路径<input :value="track.mediaType === 'video' ? String(track.videoObjectKey || '') : String(track.audioObjectKey || '')" :placeholder="track.mediaType === 'video' ? 'content/video/...' : 'content/audio/...'" readonly /></label>
                  </div>
                  <video v-if="track.mediaType === 'video' && issueModulePreviewUrls[issueAudioTrackPreviewKey(module.id, track.id)]" class="media-preview-video" controls preload="metadata" :src="issueModulePreviewUrls[issueAudioTrackPreviewKey(module.id, track.id)]">当前浏览器不支持视频预览</video>
                  <audio v-else-if="issueModulePreviewUrls[issueAudioTrackPreviewKey(module.id, track.id)]" class="media-preview-audio" controls preload="none" :src="issueModulePreviewUrls[issueAudioTrackPreviewKey(module.id, track.id)]">当前浏览器不支持音频试听</audio>
                  <div class="audio-field-grid">
                    <div :data-audio-field="`track:${track.id}:detailTitle`"><JournalRichTextField :model-value="issueAudioTrackString(track, 'detailTitle')" :rich-text="track.detailTitleRichText || ''" label="详情页标题" @update:model-value="setIssueAudioTrackPlainText(track, 'detailTitle', $event)" @update:rich-text="setIssueAudioTrackRichText(track, 'detailTitle', $event)" /></div>
                    <div :data-audio-field="`track:${track.id}:subtitle`"><JournalRichTextField :model-value="issueAudioTrackString(track, 'subtitle')" :rich-text="track.subtitleRichText || ''" label="引言说明" @update:model-value="setIssueAudioTrackPlainText(track, 'subtitle', $event)" @update:rich-text="setIssueAudioTrackRichText(track, 'subtitle', $event)" /></div>
                    <div :data-audio-field="`track:${track.id}:description`"><JournalRichTextField :model-value="issueAudioTrackString(track, 'description')" :rich-text="track.descriptionRichText || ''" label="这段声音 / 视频的解释" @update:model-value="setIssueAudioTrackPlainText(track, 'description', $event)" @update:rich-text="setIssueAudioTrackRichText(track, 'description', $event)" /></div>
                    <div :data-audio-field="`track:${track.id}:quote`"><JournalRichTextField :model-value="issueAudioTrackString(track, 'quote')" :rich-text="track.quoteRichText || ''" label="引言" @update:model-value="setIssueAudioTrackPlainText(track, 'quote', $event)" @update:rich-text="setIssueAudioTrackRichText(track, 'quote', $event)" /></div>
                    <div class="audio-field-wide" :data-audio-field="`track:${track.id}:transcript`"><JournalRichTextField :model-value="issueAudioTrackString(track, 'transcript')" :rich-text="track.transcriptRichText || ''" label="音频文字稿" @update:model-value="setIssueAudioTrackPlainText(track, 'transcript', $event)" @update:rich-text="setIssueAudioTrackRichText(track, 'transcript', $event)" /></div>
                  </div>
                  <details class="issue-module-details issue-audio-actions-editor" :data-audio-field="`track:${track.id}:actions`" open>
                    <summary>详情页操作模块 · 可添加多个分享或跳转（{{ (track.actions || []).length }}/{{ maxIssueAudioActions }}）</summary>
                    <p class="field-help">这些按钮会显示在微声音正文下方，并可按顺序添加多个。小程序页面须以 /pages/ 开头；网站须为 HTTPS；分享会打开微信分享面板。</p>
                    <div v-for="(action, actionIndex) in (track.actions || [])" :key="action.id" class="issue-audio-action-row">
                      <label>操作类型<select :value="action.kind" :disabled="uploading" @change="setIssueAudioActionKind(action, $event)"><option value="page">小程序页面</option><option value="web">网站</option><option value="share">分享给朋友</option></select></label>
                      <div><JournalRichTextField :model-value="action.label" :rich-text="action.labelRichText || ''" label="按钮文字" @update:model-value="setIssueAudioActionLabel(action, $event)" @update:rich-text="setIssueAudioActionLabelRichText(action, $event)" /></div>
                      <label v-if="action.kind === 'page'">小程序页面路径<input list="issue-module-page-presets" :value="action.path || ''" maxlength="512" placeholder="/pages/story-detail/index?id=story" @input="setIssueAudioActionText(action, 'path', $event)" /></label>
                      <label v-if="action.kind === 'web'">网站链接（HTTPS）<input type="url" :value="action.url || ''" maxlength="2048" placeholder="https://example.com/article" @input="setIssueAudioActionText(action, 'url', $event)" /></label>
                      <button type="button" class="quiet danger" :disabled="uploading" :aria-label="`移除操作模块 ${action.label || actionIndex + 1}`" @click="removeIssueAudioAction(track, actionIndex)">移除</button>
                    </div>
                    <button v-if="(track.actions || []).length < maxIssueAudioActions" type="button" class="quiet" :disabled="uploading" @click="addIssueAudioAction(track)">＋ 添加操作模块</button>
                  </details>
                </article>
                <button v-if="issueAudioTracks(module).length < maxIssueAudioTracks" type="button" class="secondary" :disabled="uploading" @click="addIssueAudioTrack(module)">＋ 添加微声音</button>
                <p v-else class="field-help">已达到 20 段上限。</p>
              </section>
              <div v-if="module.transcript !== undefined && module.type !== 'audio'"><div><JournalRichTextField :model-value="issueModuleString(module, 'transcript')" :rich-text="issueModuleString(module, 'transcriptRichText')" label="音频文字稿" @update:model-value="setIssueModuleString(module, 'transcript', $event)" @update:rich-text="setIssueModuleString(module, 'transcriptRichText', $event)" /></div></div>
              <div v-if="module.text !== undefined"><div><JournalRichTextField :model-value="issueModuleString(module, 'text')" :rich-text="issueModuleString(module, 'textRichText')" label="引言内容" @update:model-value="setIssueModuleString(module, 'text', $event)" @update:rich-text="setIssueModuleString(module, 'textRichText', $event)" /></div></div>
              <div v-if="module.attribution !== undefined"><div><JournalRichTextField :model-value="issueModuleString(module, 'attribution')" :rich-text="issueModuleString(module, 'attributionRichText')" label="引言署名" @update:model-value="setIssueModuleString(module, 'attribution', $event)" @update:rich-text="setIssueModuleString(module, 'attributionRichText', $event)" /></div></div>
              <div v-if="module.caption !== undefined"><div><JournalRichTextField :model-value="issueModuleString(module, 'caption')" :rich-text="issueModuleString(module, 'captionRichText')" label="图片说明" @update:model-value="setIssueModuleString(module, 'caption', $event)" @update:rich-text="setIssueModuleString(module, 'captionRichText', $event)" /></div></div>
              <details v-if="module.type !== 'audio'" class="issue-module-details issue-module-link-editor">
                <summary>模块跳转（小程序页面 / 网站）</summary>
                <div class="form-grid">
                  <label>跳转类型<select :value="String(module.linkType || 'none')" @change="setIssueModuleLinkType(module, $event)"><option value="none">不跳转</option><option value="page">小程序页面</option><option value="web">网站</option></select></label>
                  <div><div><JournalRichTextField :model-value="issueModuleString(module, 'linkLabel')" :rich-text="issueModuleString(module, 'linkLabelRichText')" label="入口文字" @update:model-value="setIssueModuleString(module, 'linkLabel', $event)" @update:rich-text="setIssueModuleString(module, 'linkLabelRichText', $event)" /></div></div>
                </div>
                <label v-if="module.linkType === 'page'">小程序页面路径<input list="issue-module-page-presets" :value="String(module.linkPath || '')" maxlength="512" placeholder="/pages/story-detail/index?id=story" @input="setIssueModuleText(module, 'linkPath', $event)" /></label>
                <label v-if="module.linkType === 'web'">网站链接（HTTPS）<input type="url" :value="String(module.linkUrl || '')" maxlength="2048" placeholder="https://example.com/article" @input="setIssueModuleText(module, 'linkUrl', $event)" /></label>
                <p class="field-help">配置后，该栏目底部会出现入口。小程序页面须以 /pages/ 开头；网站须为 HTTPS，并先在小程序后台配置业务域名。</p>
              </details>
            </article></div>
            <section v-if="activeContentSection === 'journal-archive'" class="panel journal-past-panel">
              <div class="section-heading"><div><p class="eyebrow">PAST ISSUES</p><h3>往期与归档期次</h3></div><small>由期刊状态自动生成，不能手工新增</small></div>
              <p class="field-help">这里只读展示当前期之外的线上与归档期次；「策展档案」栏目的入口文案在上方编辑。旧期正文仍按各自发布版本保留。</p>
              <div class="journal-past-list">
                <article v-for="item in journalPastIssues" :key="item.id">
                  <div class="journal-past-copy"><small><RichTextView inline :text="item.publishedMonth || item.month" :rich-text="item.publishedMonthRichText || item.monthRichText" /> · {{ item.code }}</small><strong><RichTextView inline :text="item.publishedTheme || item.theme" :rich-text="item.publishedThemeRichText || item.themeRichText" /></strong><span>{{ journalIssueStatusLabel(item.status) }} · v{{ item.publishedVersion }}</span></div>
                  <div class="journal-past-actions">
                    <button type="button" class="quiet" @click="editIssue(item)">载入此期</button>
                    <button v-if="item.status === 'published'" type="button" class="quiet" :disabled="issueActionBusy" :aria-label="`归档期刊 ${item.code}`" @click="openIssueLifecycleAction(item, 'archive')">归档</button>
                    <button v-if="item.status === 'archived'" type="button" class="quiet" :disabled="issueActionBusy" :aria-label="`恢复期刊 ${item.code} 为草稿`" @click="openIssueLifecycleAction(item, 'restore')">恢复草稿</button>
                    <button type="button" class="quiet danger" :disabled="issueActionBusy" :aria-label="`删除期刊 ${item.code}`" @click="openIssueLifecycleAction(item, 'delete')">删除</button>
                  </div>
                </article>
                <p v-if="!journalPastIssues.length" class="muted">还没有其他往期或归档期次。</p>
              </div>
            </section>
            <p v-if="issueConflict" class="error" role="alert">草稿已被其他管理员修改；本地内容已保留，请载入最新版本后核对。 <button type="button" class="quiet" :disabled="uploading" @click="rebaseIssueEdits">载入最新版本</button></p>
            <p v-if="issueSaveMessage" class="status-message" role="status">{{ issueSaveMessage }}</p>
            <footer class="journal-savebar" :class="{ 'is-dirty': issueDraftDirty }">
              <div class="journal-savebar-copy"><strong>{{ issueDraftDirty ? '有未保存的修改' : '已与云端同步' }}</strong><small>整份期刊草稿 · 保存会同时写入期号、首页、人物、声音、讨论与往期入口</small></div>
              <div class="form-actions"><button type="submit" :disabled="uploading || issueConflict">{{ uploading ? '保存中…' : '保存整份草稿' }}</button><button type="button" class="quiet" :disabled="uploading || issueConflict || issueDraftDirty" @click="publishIssue">确认发布整期</button></div>
            </footer>
          </template>
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'content' && activeContentSection === 'media'" id="content-media" class="content-area">
        <div class="journal-page-head">
          <div class="journal-page-head-copy"><p class="eyebrow">EDITORIAL / MEDIA</p><small>全局媒体资源，独立于期刊草稿；上传后的封面、人物图与音频可在这里复核、试听和回收，保存期刊时不会改动这里。</small></div>
        </div>
        <div class="media-maintenance audio-library">
          <div class="section-heading"><div><p class="eyebrow">AUDIO ARCHIVE</p><h3>已上传音频 <span>{{ audioLibraryScanned ? `· ${audioLibrary.length} 段已载入` : '' }}</span></h3></div><button class="quiet" :disabled="audioLibraryLoading || Boolean(audioLibraryPreviewLoading)" @click="loadAudioLibrary(true)">{{ audioLibraryLoading ? '读取中…' : audioLibraryScanned ? '刷新音频库' : '读取音频库' }}</button></div>
          <p class="muted">这里保留并展示所有已上传音频，包括未发布和已从栏目移除的文件；音频不参与自动或手动回收。</p>
          <p v-if="audioLibraryError" class="error" role="alert">{{ audioLibraryError }}</p>
          <div v-if="audioLibraryScanned" class="audio-library-list">
            <article v-for="item in audioLibrary" :key="item.objectKey" class="audio-library-row"><div class="audio-library-file"><strong>{{ item.objectKey.split('/').pop() }}</strong><code class="mono media-object-key">{{ item.objectKey }}</code></div><span>{{ displayFileSize(item.size) }}</span><time>{{ displayDate(item.lastModified) }}</time><button type="button" class="quiet" :disabled="Boolean(audioLibraryPreviewLoading)" @click="previewAudioLibraryItem(item.objectKey)">{{ audioLibraryPreviewLoading === item.objectKey ? '准备中…' : audioLibraryPreviewUrls[item.objectKey] ? '刷新试听' : '试听' }}</button><audio v-if="audioLibraryPreviewUrls[item.objectKey]" controls preload="none" :src="audioLibraryPreviewUrls[item.objectKey]">当前浏览器不支持音频试听</audio></article>
            <p v-if="!audioLibrary.length && audioLibraryHasMore" class="muted">本页没有音频对象，后面仍有文件。</p>
            <button v-if="audioLibraryHasMore || audioLibraryLoading" class="quiet" :disabled="audioLibraryLoading" @click="loadAudioLibrary(false)">{{ audioLibraryLoading ? '读取中…' : '读取更多' }}</button>
          </div>
          <p v-if="audioLibraryScanned && !audioLibrary.length && !audioLibraryHasMore && !audioLibraryLoading && !audioLibraryError" class="muted">音频库为空。</p>
        </div>
        <div class="media-maintenance">
          <div class="section-heading"><div><p class="eyebrow">MEDIA STORAGE</p><h3>未引用媒体</h3></div><button class="quiet" :disabled="orphanMediaLoading || Boolean(orphanMediaDeleting)" @click="loadOrphanMedia(true)">{{ orphanMediaLoading ? '扫描中…' : orphanMediaScanned ? '重新扫描' : '扫描媒体' }}</button></div>
          <p class="muted">仅列出超过 {{ orphanMediaGraceHours }} 小时且未被任何期刊引用的对象。删除前服务端会再次检查引用；不会自动清理。</p>
          <p v-if="orphanMediaError" class="error" role="alert">{{ orphanMediaError }}</p>
          <p v-if="orphanMediaMessage" class="status-message" role="status">{{ orphanMediaMessage }}</p>
          <div v-if="orphanMediaScanned" class="media-orphan-list">
            <div v-for="item in orphanMedia" :key="item.objectKey" class="media-orphan-row"><span class="mono media-object-key">{{ item.objectKey }}</span><span>{{ displayFileSize(item.size) }}</span><span>{{ displayDate(item.lastModified) }}</span><button v-if="isSuperAdmin" class="danger quiet" :disabled="Boolean(orphanMediaDeleting) || orphanMediaLoading" @click="removeOrphanMedia(item.objectKey)">{{ orphanMediaDeleting === item.objectKey ? '删除中…' : '删除' }}</button></div>
            <p v-if="!orphanMedia.length && orphanMediaHasMore" class="muted">本页没有可回收对象，后面仍有媒体待检查。</p>
            <button v-if="orphanMediaHasMore || orphanMediaLoading" class="quiet" :disabled="orphanMediaLoading" @click="loadOrphanMedia(false)">{{ orphanMediaLoading ? '读取中…' : '读取更多' }}</button>
          </div>
          <p v-if="orphanMediaScanned && !orphanMedia.length && !orphanMediaHasMore && !orphanMediaLoading && !orphanMediaError" class="muted">没有可回收的未引用媒体。</p>
        </div>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'practice'" id="practice-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE PAGE</p><h2>实践页面文案</h2></div></div>
        <div v-if="!practiceContent" class="practice-empty">
          <p class="muted">实践页面配置尚未读取。</p>
          <button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button>
        </div>
        <div v-else-if="practiceContent" class="preview-layout has-preview">
          <aside class="preview-rail" aria-label="小程序实践页预览">
            <PracticePagePreview :content="practiceContent" :active-key="activePracticeKey" @pick="pickPracticeKey" />
          </aside>
          <form class="practice-form" @submit.prevent="savePracticeContent" @focusin="focusPracticeField">
            <div class="practice-page-fields">
              <div class="practice-field" data-practice-field="title">
                <RichTextEditor v-model="practiceContent.titleRichText" v-model:font-size="practiceContent.titleFontSize" v-model:color="practiceContent.titleColor" label="页面标题" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
              <div class="practice-field" data-practice-field="meta">
                <RichTextEditor v-model="practiceContent.metaLeftRichText" v-model:font-size="practiceContent.metaLeftFontSize" v-model:color="practiceContent.metaLeftColor" label="左侧页眉（默认：实践）" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
              <div class="practice-field" data-practice-field="meta">
                <RichTextEditor v-model="practiceContent.metaRightRichText" v-model:font-size="practiceContent.metaRightFontSize" v-model:color="practiceContent.metaRightColor" label="右侧页眉（默认：此刻归安）" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
              <div class="practice-field" data-practice-field="intro">
                <RichTextEditor v-model="practiceContent.introRichText" v-model:font-size="practiceContent.introFontSize" v-model:color="practiceContent.introColor" label="页面说明" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
            </div>
            <section class="observation-copy-group practice-footer-editor" data-practice-field="footer">
              <h3>页尾文案</h3>
              <p class="field-help">这四项对应实践页最底部的品牌与签名文案。支持富文本、字号、颜色与行内排版。</p>
              <div class="practice-field">
                <RichTextEditor v-model="practiceContent.footerCopy.brand.richText" v-model:font-size="practiceContent.footerCopy.brand.fontSize" v-model:color="practiceContent.footerCopy.brand.color" label="页尾品牌" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
              <div class="practice-field">
                <RichTextEditor v-model="practiceContent.footerCopy.line1.richText" v-model:font-size="practiceContent.footerCopy.line1.fontSize" v-model:color="practiceContent.footerCopy.line1.color" label="页尾主文案一" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
              <div class="practice-field">
                <RichTextEditor v-model="practiceContent.footerCopy.label.richText" v-model:font-size="practiceContent.footerCopy.label.fontSize" v-model:color="practiceContent.footerCopy.label.color" label="页尾小标题" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
              <div class="practice-field">
                <RichTextEditor v-model="practiceContent.footerCopy.line2.richText" v-model:font-size="practiceContent.footerCopy.line2.fontSize" v-model:color="practiceContent.footerCopy.line2.color" label="页尾主文案二" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
              </div>
            </section>
            <p v-if="practiceContentConflict" class="error full" role="alert">实践页面已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
            <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
            <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
          <PracticeSaveBar
            :dirty="practiceContentDirty"
            :conflict="practiceContentConflict"
            :saving="practiceContentSaving"
            label="实践页面 · 标题、页眉、说明与页尾"
            :can-publish="isSuperAdmin && Boolean(practiceContent && practiceContent.draft)"
            reload-label="放弃修改并载入最新版本"
            @publish="publishPracticeContent"
            @reload="reloadPracticeContent"
          />
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'practice-directory'" id="practice-directory-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / DIRECTORY</p><h2>实践目录</h2></div></div>
        <div v-if="!practiceContent" class="practice-empty">
          <p class="muted">实践页面配置尚未读取。</p>
          <button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button>
        </div>
        <div v-else class="preview-layout has-preview">
          <aside class="preview-rail" aria-label="小程序实践页预览">
            <PracticePagePreview :content="practiceContent" :active-key="activePracticeKey" @pick="pickPracticeKey" />
          </aside>
          <form class="practice-form" @submit.prevent="savePracticeContent">
            <div class="directory-toolbar">
              <div class="directory-toolbar-copy">
                <strong>目录顺序</strong>
                <p class="muted">小程序按这个顺序编号 01、02、03…；新增的条目排在最后。「日常之物」开关只控制该目录入口是否开启，商城是否开放请在「系统管理 → 商城开放」中单独配置。</p>
              </div>
              <div class="directory-toolbar-actions">
                <select v-model="newPracticeEntryTarget" :disabled="practiceContentSaving || practiceContentConflict" aria-label="新增条目点进去打开哪一页">
                  <option value="observation">此刻观察</option>
                  <option value="shared-practice">共同实践</option>
                  <option value="daily-goods">日常之物</option>
                </select>
                <button type="button" class="quiet" :disabled="practiceContentSaving || practiceContentConflict || practiceContent.entries.length >= 100" @click="addPracticeEntry()">＋ 新增目录</button>
              </div>
            </div>
            <ol class="practice-directory-list">
              <li v-for="(entry, index) in practiceContent.entries" :key="entry.key" class="practice-directory-row">
                <span class="practice-directory-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="practice-directory-copy">
                  <strong>{{ practiceEntryText(entry.titleRichText) || '未命名目录' }}</strong>
                  <small>{{ practiceEntryText(entry.contextRichText) }}</small>
                </span>
                <span class="practice-directory-target">{{ practiceEntrySectionLabel(entry) }}</span>
                <button
                  type="button"
                  class="practice-directory-state"
                  :class="{ off: !entry.enabled }"
                  :disabled="practiceContentSaving || practiceContentConflict || (isDailyGoodsPracticeEntry(entry) && !isSuperAdmin)"
                  :aria-pressed="entry.enabled"
                  :aria-label="`${practiceEntryText(entry.titleRichText) || '目录入口'}${entry.enabled ? '已开启，点击关闭' : '已关闭，点击开启'}`"
                  :title="isDailyGoodsPracticeEntry(entry) && !isSuperAdmin ? '仅超级管理员可切换日常之物入口' : entry.enabled ? '点击关闭' : '点击开启'"
                  @click="togglePracticeEntryEnabled(entry)"
                >{{ entry.enabled ? '开启' : '关闭' }}</button>
                <span class="practice-directory-actions">
                  <button type="button" class="practice-directory-move" :disabled="index === 0 || practiceContentSaving || practiceContentConflict" aria-label="上移" @click="movePracticeEntry(entry, -1)">↑</button>
                  <button type="button" class="practice-directory-move" :disabled="index === practiceContent.entries.length - 1 || practiceContentSaving || practiceContentConflict" aria-label="下移" @click="movePracticeEntry(entry, 1)">↓</button>
                  <button type="button" class="practice-directory-edit" :disabled="practiceContentSaving || practiceContentConflict" @click="openPracticeEntry(entry)">编辑</button>
                  <button type="button" class="practice-entry-delete" :disabled="practiceContentSaving || practiceContentConflict" @click="removePracticeEntry(entry)">删除</button>
                </span>
              </li>
            </ol>
            <p v-if="practiceContentConflict" class="error" role="alert">实践页面已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
            <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
            <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
            <PracticeSaveBar
              :dirty="practiceContentDirty"
              :conflict="practiceContentConflict"
              :saving="practiceContentSaving"
              label="实践目录 · 顺序、入口与状态"
              :can-publish="isSuperAdmin && Boolean(practiceContent && practiceContent.draft)"
              reload-label="放弃修改并载入最新版本"
              @publish="publishPracticeContent"
              @reload="reloadPracticeContent"
            />
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'observation'" id="practice-observation-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / CONTENT / OBSERVATION</p><h2>此刻观察</h2></div></div>
        <div class="practice-entry-tabs" role="tablist" :aria-label="`此刻观察：首页入口或详情页`">
          <button type="button" role="tab" :class="{ active: practiceEntryTab('observation') === 'home' }" :aria-selected="practiceEntryTab('observation') === 'home'" @click="setPracticeEntryTab('observation', 'home')">首页入口</button>
          <button type="button" role="tab" :class="{ active: practiceEntryTab('observation') === 'detail' }" :aria-selected="practiceEntryTab('observation') === 'detail'" @click="setPracticeEntryTab('observation', 'detail')">详情页</button>
        </div>
        <div v-if="!practiceContent" class="practice-empty"><p class="muted">此刻观察内容尚未读取。</p><button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button></div>
        <div v-else-if="practiceContent" class="preview-layout has-preview">
          <aside class="preview-rail" aria-label="小程序此刻观察页预览">
            <PracticePagePreview v-if="practiceEntryTab('observation') === 'home'" :content="practiceContent" :active-key="activePracticeKey" @pick="pickPracticeKey" />
            <CopyPagePreview v-else-if="observationDetailView === 'flat'" title="此刻观察" subtitle="OBSERVATION" :groups="observationCopyGroups" :copy="observationDetailCopy" :active-key="activeObservationKey" @pick="pickObservationKey" />
            <RealityStagesPreview v-else-if="observationDetailView === 'reality' && observationRealityCopy" :copy="observationRealityCopy" :stage="activeRealityStage" :active-key="activeObservationKey" @pick="pickObservationKey" />
            <SeasonIntroPreview v-else-if="observationDetailView === 'season' && observationSeasonCopy" :copy="observationSeasonCopy" :active-key="activeObservationKey" @pick="pickObservationKey" />
            <SeasonStagesPreview v-else-if="observationDetailView === 'season-stages' && observationSeasonStagesCopy" :copy="observationSeasonStagesCopy" :stage="activeSeasonStage" :now-tab="activeSeasonNowTab" :active-key="activeObservationKey" @pick="pickObservationKey" />
            <ObservationRecordPreview v-else-if="observationDetailView === 'record' && observationRecordCopy" :copy="observationRecordCopy" :active-key="activeObservationKey" @pick="pickObservationKey" />
          </aside>
          <form v-if="practiceEntryTab('observation') === 'home'" class="practice-form" @submit.prevent="savePracticeContent" @focusin="focusPracticeField">
            <div class="practice-entry-toolbar">
              <p class="muted">这一页列出的入口卡片；删除后小程序实践页不再显示它。</p>
              <button type="button" class="quiet" :disabled="practiceContentSaving || practiceContentConflict || (practiceContent?.entries.length ?? 0) >= 100" @click="addPracticeEntry('observation')">＋ 新增目录</button>
            </div>
            <p v-if="!practiceEntriesFor('observation').length" class="muted">这一页还没有入口卡片，先新增一个。</p>
            <PracticeEntryEditor v-for="entry in practiceEntriesFor('observation')" :key="entry.key" :entry="entry" :index="practiceEntryIndex(entry.key)" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" @toggle-enabled="togglePracticeEntryEnabled(entry)" @delete="removePracticeEntry(entry)" />
            <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
            <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
            <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
            <PracticeSaveBar :dirty="practiceContentDirty" :conflict="practiceContentConflict" :saving="practiceContentSaving" label="此刻观察 · 首页入口" :can-publish="isSuperAdmin && Boolean(practiceContent.draft)" @publish="publishPracticeContent" @reload="reloadPracticeContent" />
          </form>
          <form v-else class="practice-form observation-detail-form" @submit.prevent="savePracticeContent" @focusin="focusObservationField">
            <div class="practice-entry-tabs observation-detail-tabs" role="tablist" aria-label="此刻观察详情页编辑范围">
              <button type="button" role="tab" :class="{ active: observationDetailView === 'flat' }" :aria-selected="observationDetailView === 'flat'" @click="observationDetailView = 'flat'">基础文案</button>
              <button type="button" role="tab" :class="{ active: observationDetailView === 'reality' }" :aria-selected="observationDetailView === 'reality'" @click="observationDetailView = 'reality'">现实处境四页</button>
              <button type="button" role="tab" :class="{ active: observationDetailView === 'season' }" :aria-selected="observationDetailView === 'season'" @click="observationDetailView = 'season'">四时气韵入口页</button>
              <button type="button" role="tab" :class="{ active: observationDetailView === 'season-stages' }" :aria-selected="observationDetailView === 'season-stages'" @click="observationDetailView = 'season-stages'">四时气韵四页</button>
              <button type="button" role="tab" :class="{ active: observationDetailView === 'record' }" :aria-selected="observationDetailView === 'record'" @click="observationDetailView = 'record'">观察记录页</button>
            </div>
            <div v-if="observationDetailView === 'flat'" class="observation-copy-groups">
              <section v-for="group in observationCopyGroups" :key="group.title" class="observation-copy-group">
                <h3>{{ group.title }}</h3>
                <div v-for="field in group.fields" :key="field.key" :data-copy-field="field.key" class="copy-field">
                  <RichTextEditor v-model="practiceContent.observationCopy[field.key].richText" v-model:font-size="practiceContent.observationCopy[field.key].fontSize" v-model:color="practiceContent.observationCopy[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                </div>
              </section>
            </div>
            <div v-else-if="observationDetailView === 'reality'" class="reality-stage-editor">
              <div class="reality-stage-tabs" role="tablist" aria-label="现实处境四页阶段">
                <button v-for="(stage, index) in realityStageDefinitions" :key="stage.key" type="button" role="tab" :class="{ active: activeRealityStage === stage.key }" :aria-selected="activeRealityStage === stage.key" @click="activeRealityStage = stage.key">0{{ index + 1 }} {{ stage.label }}</button>
              </div>
              <div class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.realityStages[activeRealityStage].align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.realityStages[activeRealityStage].spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>
              <div class="observation-copy-groups">
                <section class="observation-copy-group reality-stage-copy-group">
                  <h3>{{ realityStageDefinitions.find((stage) => stage.key === activeRealityStage)?.label }} · 页面内容</h3>
                  <div v-for="field in realityStageCopyFields" :key="field.key" :data-reality-field="`reality:${activeRealityStage}:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.realityStages[activeRealityStage][field.key].richText" v-model:font-size="practiceContent.observationCopy.realityStages[activeRealityStage][field.key].fontSize" v-model:color="practiceContent.observationCopy.realityStages[activeRealityStage][field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>
            </div>
            <div v-else-if="observationDetailView === 'season'" class="reality-stage-editor">
              <div class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.seasonIntro.align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.seasonIntro.spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>
              <div class="observation-copy-groups">
                <section v-for="group in seasonIntroCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-season-field="`season:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.seasonIntro[field.key].richText" v-model:font-size="practiceContent.observationCopy.seasonIntro[field.key].fontSize" v-model:color="practiceContent.observationCopy.seasonIntro[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>
            </div>
            <div v-else-if="observationDetailView === 'season-stages'" class="reality-stage-editor season-stage-editor">
              <div class="reality-stage-tabs" role="tablist" aria-label="四时气韵四页阶段">
                <button v-for="stage in seasonStageDefinitions" :key="stage.key" type="button" role="tab" :class="{ active: activeSeasonStage === stage.key }" :aria-selected="activeSeasonStage === stage.key" @click="activeSeasonStage = stage.key">{{ stage.index }} {{ stage.label }}</button>
              </div>
              <div v-if="activeSeasonStage === 'now'" class="reality-stage-tabs season-stage-subtabs" role="tablist" aria-label="四时气韵此刻页内容">
                <button type="button" role="tab" :class="{ active: activeSeasonNowTab === 'recent' }" :aria-selected="activeSeasonNowTab === 'recent'" @click="activeSeasonNowTab = 'recent'">最近发生了什么</button>
                <button type="button" role="tab" :class="{ active: activeSeasonNowTab === 'change' }" :aria-selected="activeSeasonNowTab === 'change'" @click="activeSeasonNowTab = 'change'">此刻的变化</button>
              </div>
              <div v-if="activeSeasonStage === 'card'" class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.seasonStages.card.align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.seasonStages.card.spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>
              <div v-else-if="activeSeasonStage === 'now'" class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.seasonStages.now.align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.seasonStages.now.spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>
              <div v-else-if="activeSeasonStage === 'choice'" class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.seasonStages.choice.align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.seasonStages.choice.spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>
              <div v-else class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.seasonStages.action.align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.seasonStages.action.spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>

              <div v-if="activeSeasonStage === 'card'" class="observation-copy-groups">
                <section v-for="group in seasonCardCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-season-stage-field="`season-stage:card:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.seasonStages.card[field.key].richText" v-model:font-size="practiceContent.observationCopy.seasonStages.card[field.key].fontSize" v-model:color="practiceContent.observationCopy.seasonStages.card[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>

              <div v-else-if="activeSeasonStage === 'now' && activeSeasonNowTab === 'recent'" class="observation-copy-groups">
                <section v-for="group in seasonNowRecentCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-season-stage-field="`season-stage:now:recent:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.seasonStages.now.recent[field.key].richText" v-model:font-size="practiceContent.observationCopy.seasonStages.now.recent[field.key].fontSize" v-model:color="practiceContent.observationCopy.seasonStages.now.recent[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
                <section class="observation-copy-group">
                  <h3>关系选项</h3>
                  <div v-for="option in practiceContent.observationCopy.seasonStages.now.recent.relations" :key="option.key" :data-season-stage-field="`season-stage:now:recent:relations:${option.key}:label`" class="copy-field">
                    <RichTextEditor v-model="option.label.richText" v-model:font-size="option.label.fontSize" v-model:color="option.label.color" :label="`关系选项 · ${option.key}`" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>

              <div v-else-if="activeSeasonStage === 'now'" class="observation-copy-groups">
                <section v-for="group in seasonNowChangeCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-season-stage-field="`season-stage:now:change:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.seasonStages.now.change[field.key].richText" v-model:font-size="practiceContent.observationCopy.seasonStages.now.change[field.key].fontSize" v-model:color="practiceContent.observationCopy.seasonStages.now.change[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
                <section class="observation-copy-group">
                  <h3>状态选项</h3>
                  <div v-for="option in practiceContent.observationCopy.seasonStages.now.change.states" :key="option.key" class="copy-field">
                    <div :data-season-stage-field="`season-stage:now:change:states:${option.key}:label`">
                      <RichTextEditor v-model="option.label.richText" v-model:font-size="option.label.fontSize" v-model:color="option.label.color" :label="`状态${option.key} · 标题`" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                    </div>
                    <div :data-season-stage-field="`season-stage:now:change:states:${option.key}:hint`">
                      <RichTextEditor v-model="option.hint.richText" v-model:font-size="option.hint.fontSize" v-model:color="option.hint.color" :label="`状态${option.key} · 说明`" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                    </div>
                  </div>
                </section>
              </div>

              <div v-else-if="activeSeasonStage === 'choice'" class="observation-copy-groups">
                <section v-for="group in seasonChoiceCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-season-stage-field="`season-stage:choice:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.seasonStages.choice[field.key].richText" v-model:font-size="practiceContent.observationCopy.seasonStages.choice[field.key].fontSize" v-model:color="practiceContent.observationCopy.seasonStages.choice[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>

              <div v-else class="observation-copy-groups">
                <section v-for="group in seasonActionCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-season-stage-field="`season-stage:action:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.seasonStages.action[field.key].richText" v-model:font-size="practiceContent.observationCopy.seasonStages.action[field.key].fontSize" v-model:color="practiceContent.observationCopy.seasonStages.action[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>
            </div>
            <div v-else class="reality-stage-editor">
              <div class="reality-stage-controls">
                <label>对齐方式<select v-model="practiceContent.observationCopy.record.align" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
                <label>内容间距<select v-model="practiceContent.observationCopy.record.spacing" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty"><option value="compact">紧凑</option><option value="standard">标准</option><option value="roomy">宽松</option></select></label>
              </div>
              <div class="observation-copy-groups">
                <section v-for="group in observationRecordCopyGroups" :key="group.title" class="observation-copy-group">
                  <h3>{{ group.title }}</h3>
                  <div v-for="field in group.fields" :key="field.key" :data-record-field="`record:${field.key}`" class="copy-field">
                    <RichTextEditor v-model="practiceContent.observationCopy.record[field.key].richText" v-model:font-size="practiceContent.observationCopy.record[field.key].fontSize" v-model:color="practiceContent.observationCopy.record[field.key].color" :label="field.label" :min-font-size="10" :max-font-size="48" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </section>
              </div>
            </div>
            <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
            <p v-if="practiceContentDirty && !practiceContentSaving" class="muted" role="status">有未保存的修改。</p>
            <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
            <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
            <PracticeSaveBar
              :dirty="practiceContentDirty"
              :conflict="practiceContentConflict"
              :saving="practiceContentSaving"
              label="此刻观察 · 详情页"
              :can-publish="isSuperAdmin && Boolean(practiceContent && practiceContent.draft)"
              @publish="publishPracticeContent"
              @reload="reloadPracticeContent"
            />
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'shared-practice'" id="practice-shared-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / CONTENT / SHARED PRACTICE</p><h2>共同实践</h2></div></div>
        <div class="practice-entry-tabs" role="tablist" :aria-label="`共同实践：首页入口或详情页`">
          <button type="button" role="tab" :class="{ active: practiceEntryTab('shared-practice') === 'home' }" :aria-selected="practiceEntryTab('shared-practice') === 'home'" @click="setPracticeEntryTab('shared-practice', 'home')">首页入口</button>
          <button type="button" role="tab" :class="{ active: practiceEntryTab('shared-practice') === 'detail' }" :aria-selected="practiceEntryTab('shared-practice') === 'detail'" @click="setPracticeEntryTab('shared-practice', 'detail')">详情页</button>
        </div>
        <div v-if="!practiceContent" class="practice-empty"><p class="muted">共同实践内容尚未读取。</p><button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button></div>
        <div v-else-if="practiceContent" class="preview-layout has-preview">
          <aside class="preview-rail" aria-label="小程序共同实践页预览">
            <PracticePagePreview v-if="practiceEntryTab('shared-practice') === 'home'" :content="practiceContent" :active-key="activePracticeKey" @pick="pickPracticeKey" />
            <CopyPagePreview v-else :title="practiceCopyIssueCode ? `共同实践 · 按期` : `共同实践`" :subtitle="practiceCopyIssueCode ? practiceCopyIssueCode : `SHARED PRACTICE`" :groups="visibleSharedPracticeCopyGroups" :copy="practiceContent.sharedPracticeCopy" :extra-sections="sharedPracticeExtraSections" :active-key="activeObservationKey" @pick="pickObservationKey" />
          </aside>
          <form v-if="practiceEntryTab('shared-practice') === 'home'" class="practice-form" @submit.prevent="savePracticeContent" @focusin="focusPracticeField">
            <div class="practice-entry-toolbar">
              <p class="muted">这一页列出的入口卡片；删除后小程序实践页不再显示它。</p>
              <button type="button" class="quiet" :disabled="practiceContentSaving || practiceContentConflict || (practiceContent?.entries.length ?? 0) >= 100" @click="addPracticeEntry('shared-practice')">＋ 新增目录</button>
            </div>
            <p v-if="!practiceEntriesFor('shared-practice').length" class="muted">这一页还没有入口卡片，先新增一个。</p>
            <PracticeEntryEditor v-for="entry in practiceEntriesFor('shared-practice')" :key="entry.key" :entry="entry" :index="practiceEntryIndex(entry.key)" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" @toggle-enabled="togglePracticeEntryEnabled(entry)" @delete="removePracticeEntry(entry)" />
            <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
            <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
            <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
            <PracticeSaveBar :dirty="practiceContentDirty" :conflict="practiceContentConflict" :saving="practiceContentSaving" label="共同实践 · 首页入口" :can-publish="isSuperAdmin && Boolean(practiceContent.draft)" @publish="publishPracticeContent" @reload="reloadPracticeContent" />
          </form>
          <form v-else class="practice-form" @submit.prevent="savePracticeContent" @focusin="focusObservationField">
        <div class="practice-copy-panel">
          <div class="practice-copy-panel-head">
            <div>
              <h3>按期文案</h3>
              <p class="muted">选定一期后只改这一期的文案；段落与条目数量不限，可增删与排序。未保存过则沿用全局默认值。</p>
            </div>
            <div class="practice-copy-panel-actions">
              <select v-model="practiceCopyIssueCode" aria-label="选择期刊">
                <option value="">选择期刊</option>
                <option v-for="issue in issues" :key="issue.code" :value="issue.code">{{ issue.label }} · {{ issue.code }}</option>
              </select>
              <button type="button" class="quiet" :disabled="!practiceCopyIssueCode || practiceCopySaving" @click="copyPracticeFromOtherIssue">复制相邻期</button>
            </div>
          </div>

          <p v-if="practiceCopyError" class="error" role="alert">{{ practiceCopyError }}</p>
          <p v-if="practiceCopyMessage" class="status-message" role="status">{{ practiceCopyMessage }}</p>
          <p v-if="practiceCopyLoading" class="muted">正在读取该期文案…</p>

          <template v-if="practiceCopyIssueCode && !practiceCopyLoading">
            <p class="muted practice-copy-source">
              当前来源：{{ practiceCopySource === 'issue' ? '该期独立文案' : '全局默认值（尚未为该期单独保存）' }}
            </p>

            <label class="setting-toggle practice-copy-publish-toggle">
              <span>
                <strong>线下活动已发布</strong>
                <small>关闭时，小程序仅隐藏本期的线下活动说明；下方条目仍可提前编辑和保存，开启后立即展示。</small>
              </span>
              <input v-model="practiceCopyOfflinePublished" type="checkbox" :disabled="practiceCopySaving" />
            </label>

            <section class="practice-copy-block">
              <header><h4>线上 · 讨论说明段落</h4><button type="button" class="quiet" @click="addParagraph">+ 添加段落</button></header>
              <p v-if="!practiceCopyParagraphs.length" class="muted">还没有段落，点击「添加段落」开始。</p>
              <div v-for="(paragraph, index) in practiceCopyParagraphs" :key="`p-${index}`" :data-copy-field="`paragraph:${index}`" class="practice-copy-row">
                <span class="practice-copy-order">{{ index + 1 }}</span>
                <RichTextEditor v-model="paragraph.richText" v-model:font-size="paragraph.fontSize" v-model:color="paragraph.color" label="段落内容" />
                <div class="practice-copy-row-actions">
                  <button type="button" class="quiet" :disabled="index === 0" @click="moveParagraph(index, -1)">上移</button>
                  <button type="button" class="quiet" :disabled="index === practiceCopyParagraphs.length - 1" @click="moveParagraph(index, 1)">下移</button>
                  <button type="button" class="quiet" @click="removeParagraph(index)">删除</button>
                </div>
              </div>
            </section>

            <section class="practice-copy-block">
              <header><h4>线下活动说明条目</h4><button type="button" class="quiet" @click="addRule">+ 添加条目</button></header>
              <p v-if="!practiceCopyRules.length" class="muted">还没有条目，点击「添加条目」开始。</p>
              <div v-for="(rule, index) in practiceCopyRules" :key="`r-${index}`" :data-copy-field="`rule:${index}`" class="practice-copy-rule">
                <div class="practice-copy-rule-head">
                  <span class="practice-copy-order">{{ index + 1 }}</span>
                  <div class="practice-copy-row-actions">
                    <button type="button" class="quiet" :disabled="index === 0" @click="moveRule(index, -1)">上移</button>
                    <button type="button" class="quiet" :disabled="index === practiceCopyRules.length - 1" @click="moveRule(index, 1)">下移</button>
                    <button type="button" class="quiet" @click="removeRule(index)">删除</button>
                  </div>
                </div>
                <RichTextEditor v-model="rule.number.richText" v-model:font-size="rule.number.fontSize" v-model:color="rule.number.color" label="序号" />
                <RichTextEditor v-model="rule.title.richText" v-model:font-size="rule.title.fontSize" v-model:color="rule.title.color" label="标题" />
                <RichTextEditor v-model="rule.copy.richText" v-model:font-size="rule.copy.fontSize" v-model:color="rule.copy.color" label="说明" />
              </div>
            </section>

            <div class="form-actions">
              <button type="button" :disabled="practiceCopySaving" @click="savePracticeCopy">{{ practiceCopySaving ? '保存中…' : '保存该期文案' }}</button>
              <button type="button" class="quiet" :disabled="practiceCopyLoading" @click="loadPracticeCopy">重新读取</button>
            </div>
          </template>
        </div>

          <div class="observation-copy-groups"><section v-for="group in sharedPracticeCopyGroups" :key="group.title" class="observation-copy-group"><h3>{{ group.title }}</h3><div v-for="field in group.fields" :key="field.key" class="copy-field" :data-copy-field="field.key"><RichTextEditor v-model="practiceContent.sharedPracticeCopy[field.key].richText" v-model:font-size="practiceContent.sharedPracticeCopy[field.key].fontSize" v-model:color="practiceContent.sharedPracticeCopy[field.key].color" :label="field.label" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" /></div></section></div>
          <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p><p v-if="practiceContentDirty && !practiceContentSaving" class="muted" role="status">有未保存的修改。</p><p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p><p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
          <PracticeSaveBar
            :dirty="practiceContentDirty"
            :conflict="practiceContentConflict"
            :saving="practiceContentSaving"
            label="共同实践 · 详情页"
            :can-publish="isSuperAdmin && Boolean(practiceContent && practiceContent.draft)"
            @publish="publishPracticeContent"
            @reload="reloadPracticeContent"
          />
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'daily-objects'" id="practice-daily-objects-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / DAILY OBJECTS</p><h2>日常之物</h2></div></div>
        <div class="practice-entry-tabs" role="tablist" :aria-label="`日常之物：首页入口或详情页`">
          <button type="button" role="tab" :class="{ active: practiceEntryTab('daily-objects') === 'home' }" :aria-selected="practiceEntryTab('daily-objects') === 'home'" @click="setPracticeEntryTab('daily-objects', 'home')">首页入口</button>
          <button type="button" role="tab" :class="{ active: practiceEntryTab('daily-objects') === 'detail' }" :aria-selected="practiceEntryTab('daily-objects') === 'detail'" @click="setPracticeEntryTab('daily-objects', 'detail')">详情页</button>
        </div>
        <div v-if="!dailyObjectsContent" class="practice-empty"><p class="muted">日常之物设置尚未读取。</p><button class="quiet" :disabled="dashboardLoading" @click="loadDailyObjectsContent">重新读取</button></div>
        <div v-else-if="dailyObjectsContent" class="preview-layout has-preview">
          <aside class="preview-rail" aria-label="小程序日常之物预览">
            <PracticePagePreview v-if="practiceEntryTab('daily-objects') === 'home' && practiceContent" :content="practiceContent" :active-key="activePracticeKey" @pick="pickPracticeKey" />
            <DailyObjectsPreview v-else :content="dailyObjectsContent" :image-urls="dailyObjectPreviewUrls" :article-image-url="dailyObjectArticlePreviewUrl" :mode="dailyObjectsPreviewMode" :active-key="activeDailyKey" @pick="pickDailyKey" />
          </aside>
          <form v-if="practiceEntryTab('daily-objects') === 'home' && practiceContent" class="practice-form" @submit.prevent="savePracticeContent" @focusin="focusPracticeField">
            <div class="practice-entry-toolbar">
              <p class="muted">这一页列出的入口卡片；删除后小程序实践页不再显示它。</p>
              <button type="button" class="quiet" :disabled="practiceContentSaving || practiceContentConflict || (practiceContent?.entries.length ?? 0) >= 100" @click="addPracticeEntry('daily-goods')">＋ 新增目录</button>
            </div>
            <p v-if="!practiceEntriesFor('daily-objects').length" class="muted">这一页还没有入口卡片，先新增一个。</p>
            <PracticeEntryEditor v-for="entry in practiceEntriesFor('daily-objects')" :key="entry.key" :entry="entry" :index="practiceEntryIndex(entry.key)" :disabled="practiceContentSaving || practiceContentConflict || (isDailyGoodsPracticeEntry(entry) && !isSuperAdmin)" @change="markPracticeContentDirty" @toggle-enabled="togglePracticeEntryEnabled(entry)" @delete="removePracticeEntry(entry)" />
            <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
            <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
            <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
            <PracticeSaveBar :dirty="practiceContentDirty" :conflict="practiceContentConflict" :saving="practiceContentSaving" label="日常之物 · 首页入口" :can-publish="isSuperAdmin && Boolean(practiceContent.draft)" @publish="publishPracticeContent" @reload="reloadPracticeContent" />
          </form>
          <form v-else class="practice-form daily-objects-form" @submit.prevent="saveDailyObjectsContent" @focusin="focusDailyField">
          <section class="daily-shop-gate"><div><h3>开放设置</h3><p>「实践目录 → 日常之物」入口控制目录是否开启；「系统管理 → 商城开放」独立控制商城是否对外营业。两处都开启后才会展示商品。</p></div><button type="button" class="quiet" @click="openDailyObjectsEntrySettings">设置目录入口状态</button></section>
          <section class="observation-copy-group daily-landing-editor"><h3>未开放页</h3><p class="field-help full">目录入口或商城关闭时展示。文章标题、节选、配图与公众号链接未填写时，小程序会分别沿用首页人物故事中的对应内容。</p><div class="daily-objects-fields">
            <div class="daily-field" data-daily-field="landing"><label class="full">首屏标题<textarea v-model="dailyObjectsContent.landingTitle" rows="4" maxlength="500" @input="markDailyObjectsDirty"></textarea></label><label class="full">首屏说明<textarea v-model="dailyObjectsContent.landingIntro" rows="3" maxlength="500" @input="markDailyObjectsDirty"></textarea></label><label>开放状态<input v-model="dailyObjectsContent.landingStatus" maxlength="120" @input="markDailyObjectsDirty" /></label><label>品牌中文<input v-model="dailyObjectsContent.brandSubtitle" maxlength="80" @input="markDailyObjectsDirty" /></label></div>
            <div class="daily-field" data-daily-field="her-days"><label>栏目标题<input v-model="dailyObjectsContent.herDaysTitle" maxlength="80" @input="markDailyObjectsDirty" /></label><label>英文标识<input v-model="dailyObjectsContent.herDaysEnglish" maxlength="80" @input="markDailyObjectsDirty" /></label></div>
            <div class="daily-field" data-daily-field="article-title"><label>节选标签<input v-model="dailyObjectsContent.articleLabel" maxlength="80" @input="markDailyObjectsDirty" /></label><label>文章标题<input v-model="dailyObjectsContent.articleTitle" maxlength="200" @input="markDailyObjectsDirty" /></label><label class="full">文章节选<textarea v-model="dailyObjectsContent.articleExcerpt" rows="5" maxlength="1000" @input="markDailyObjectsDirty"></textarea></label></div>
            <div class="daily-field daily-landing-image" data-daily-field="article-image"><div class="daily-image-field"><span class="daily-image-label">日常文章配图</span><img v-if="dailyObjectArticlePreviewUrl || dailyObjectsContent.articleImage.startsWith('https://') || dailyObjectsContent.articleImage.startsWith('/assets/')" class="daily-image-preview" :src="dailyObjectArticlePreviewUrl || dailyObjectsContent.articleImage" alt="日常文章配图预览" /><label class="daily-image-upload" :class="{ disabled: Boolean(dailyObjectUploadingId) || dailyObjectsSaving || dailyObjectsConflict }"><input type="file" accept="image/*" :disabled="Boolean(dailyObjectUploadingId) || dailyObjectsSaving || dailyObjectsConflict" @change="uploadDailyObjectImage($event, 'article-image')" /><span>{{ dailyObjectUploadingId === 'article-image' ? '上传中…' : '选择并上传图片' }}</span></label><small>未配置时回退首页人物故事配图。</small><input v-model="dailyObjectsContent.articleImage" aria-label="日常文章图片路径或对象键" maxlength="2048" placeholder="也可粘贴 /assets/ 路径或 HTTPS 地址" @input="markDailyObjectsDirty" /></div><div class="daily-image-metadata"><label>图片替代文字<input v-model="dailyObjectsContent.articleImageAlt" maxlength="120" @input="markDailyObjectsDirty" /></label><label>图片说明<input v-model="dailyObjectsContent.articleCaption" maxlength="300" @input="markDailyObjectsDirty" /></label></div></div>
            <div class="daily-field" data-daily-field="article-action"><label class="full">公众号文章链接<input v-model="dailyObjectsContent.officialArticleUrl" type="url" maxlength="2048" placeholder="https://mp.weixin.qq.com/s/..." @input="markDailyObjectsDirty" /></label><label class="full">阅读按钮文字<input v-model="dailyObjectsContent.officialArticleButton" maxlength="120" @input="markDailyObjectsDirty" /></label></div>
            <div class="daily-field" data-daily-field="everyday-explore"><label>探索标题<input v-model="dailyObjectsContent.everydayObjectsTitle" maxlength="80" @input="markDailyObjectsDirty" /></label><label>英文标识<input v-model="dailyObjectsContent.everydayObjectsEnglish" maxlength="80" @input="markDailyObjectsDirty" /></label><label class="full">探索说明<textarea v-model="dailyObjectsContent.everydayObjectsIntro" rows="3" maxlength="500" @input="markDailyObjectsDirty"></textarea></label></div>
          </div></section>
          <section class="observation-copy-group"><h3>商品页首屏</h3><div class="daily-objects-fields">
            <div class="daily-field" data-daily-field="brand"><label>品牌英文<input v-model="dailyObjectsContent.brandName" maxlength="80" @input="markDailyObjectsDirty" /></label><label>品牌中文<input v-model="dailyObjectsContent.brandSubtitle" maxlength="80" @input="markDailyObjectsDirty" /></label></div>
            <div class="daily-field" data-daily-field="header"><label>英文眉题<input v-model="dailyObjectsContent.eyebrow" maxlength="80" @input="markDailyObjectsDirty" /></label><label>页面标题<input v-model="dailyObjectsContent.title" maxlength="120" @input="markDailyObjectsDirty" /></label>
            <label class="full">页面说明<textarea v-model="dailyObjectsContent.intro" rows="3" maxlength="500" @input="markDailyObjectsDirty"></textarea></label></div>
            <div class="daily-field" data-daily-field="note"><label>预览说明<input v-model="dailyObjectsContent.previewNote" maxlength="300" @input="markDailyObjectsDirty" /></label><label>联系支持文字<input v-model="dailyObjectsContent.supportLabel" maxlength="120" @input="markDailyObjectsDirty" /></label></div>
          </div></section>
          <section class="observation-copy-group"><div class="daily-products-heading"><h3>商品与详情</h3><button class="quiet" type="button" :disabled="dailyObjectsSaving || dailyObjectsConflict || dailyObjectsContent.products.length >= 50" @click="addDailyObjectsProduct">＋ 新增商品</button></div>
            <article v-for="(product, index) in dailyObjectsContent.products" :key="product.id" :data-daily-field="`product:${product.id}`" class="daily-product-editor">
              <div class="daily-product-editor-heading"><strong>{{ product.id }} · 商品 {{ String(index + 1).padStart(2, '0') }}</strong><label class="daily-product-enabled"><input v-model="product.enabled" type="checkbox" @change="markDailyObjectsDirty" />在商品页显示</label></div>
              <div class="daily-objects-fields">
                <label>商品编号<input v-model="product.id" maxlength="32" @input="markDailyObjectsDirty" /></label><label>中文名称<input v-model="product.name" maxlength="80" @input="markDailyObjectsDirty" /></label>
                <label>英文标识<input v-model="product.english" maxlength="80" @input="markDailyObjectsDirty" /></label><label>价格<input v-model="product.price" maxlength="40" @input="markDailyObjectsDirty" /></label>
                <label>价格说明<input v-model="product.priceLabel" maxlength="80" @input="markDailyObjectsDirty" /></label>
                <div class="daily-image-field"><span class="daily-image-label">商品图片</span><img v-if="dailyObjectPreviewUrls[product.id] || product.image.startsWith('https://') || product.image.startsWith('/assets/')" class="daily-image-preview" :src="dailyObjectPreviewUrls[product.id] || product.image" alt="商品图片预览" /><label class="daily-image-upload" :class="{ disabled: Boolean(dailyObjectUploadingId) || dailyObjectsSaving || dailyObjectsConflict }"><input type="file" accept="image/*" :disabled="Boolean(dailyObjectUploadingId) || dailyObjectsSaving || dailyObjectsConflict" @change="uploadDailyObjectImage($event, product.id)" /><span>{{ dailyObjectUploadingId === product.id ? '上传中…' : '选择并上传图片' }}</span></label><small>支持常见图片格式，大小受服务器上传限制。</small><input v-model="product.image" aria-label="商品图片路径或对象键" maxlength="2048" placeholder="也可粘贴图片路径 / HTTPS 地址" @input="markDailyObjectsDirty" /></div>
                <label class="full">商品详情说明<textarea v-model="product.description" rows="3" maxlength="1000" @input="markDailyObjectsDirty"></textarea></label>
                <label class="full">选择规格与数量说明<textarea v-model="product.optionDetails" rows="2" maxlength="1000" @input="markDailyObjectsDirty"></textarea></label>
                <label class="full">使用与日常说明<textarea v-model="product.dailyUseDetails" rows="2" maxlength="1000" @input="markDailyObjectsDirty"></textarea></label>
                <label class="full">交付与售后说明<textarea v-model="product.deliveryDetails" rows="2" maxlength="1000" @input="markDailyObjectsDirty"></textarea></label>
              </div>
            </article>
          </section>
          <p v-if="dailyObjectsConflict" class="error full" role="alert">日常之物已被其他管理员更新。本地修改已保留，请重新读取后再保存。</p><p v-if="dailyObjectsDirty && !dailyObjectsSaving" class="muted" role="status">有未保存的修改。</p><p v-if="dailyObjectsError" class="error" role="alert">{{ dailyObjectsError }}</p><p v-if="dailyObjectsMessage" class="status-message" role="status">{{ dailyObjectsMessage }}</p>
          <PracticeSaveBar
            :dirty="dailyObjectsDirty"
            :conflict="dailyObjectsConflict"
            :saving="dailyObjectsSaving"
            label="日常之物 · 首屏与商品文案"
            :can-publish="isSuperAdmin"
            @publish="publishDailyObjectsContent"
            @reload="loadDailyObjectsContent"
          />
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'content' && activeContentSection === 'privacy-page'" id="privacy-page-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRIVACY / ABOUT</p><h2>关于 MYRIAD SHE</h2></div></div>
        <p class="muted">当前线上版本：第 {{ privacyPagePublishedVersion }} 版<span v-if="privacyPagePublishedAt"> · {{ new Date(privacyPagePublishedAt).toLocaleString() }}</span>。修改先保存为草稿，预览确认后再发布。</p>
        <div v-if="!privacyPageContent" class="practice-empty"><p class="muted">关于 MYRIAD SHE 内容尚未读取。</p><button class="quiet" :disabled="privacyPageSaving" @click="reloadPrivacyPageContent">重新读取</button></div>
        <form v-else class="practice-form about-editor-form" @submit.prevent="savePrivacyPageContent">
          <div class="about-editor-layout">
            <section class="observation-copy-group about-fields" @focusin="focusAboutField"><h3>页面内容</h3><label data-page-field="brand-intro">品牌介绍<textarea v-model="privacyPageContent.brandIntro" rows="6" maxlength="6000" :disabled="privacyPageSaving || privacyPageConflict" @input="markPrivacyPageDirty" /></label><label data-page-field="sources">内容来源<textarea v-model="privacyPageContent.contentSources" rows="5" maxlength="6000" :disabled="privacyPageSaving || privacyPageConflict" @input="markPrivacyPageDirty" /></label><label data-page-field="contact">联系方式<textarea v-model="privacyPageContent.contactInfo" rows="3" maxlength="6000" :disabled="privacyPageSaving || privacyPageConflict" @input="markPrivacyPageDirty" /></label></section>
            <aside class="about-draft-preview" aria-label="当前草稿预览"><div class="about-draft-preview-heading"><div><p class="eyebrow">DRAFT PREVIEW</p><h3>预览当前草稿</h3></div><span v-if="privacyPageDirty" class="draft-state">未保存</span><span v-else class="draft-state">草稿预览</span></div><AboutPagePreview :content="privacyPageContent" :active-key="activeAboutKey" @pick="pickAboutKey" /></aside>
          </div>
          <p v-if="privacyPageConflict" class="error full" role="alert">关于内容已被其他管理员更新，本地修改已保留；重新载入最新版本后再保存。</p><p v-if="privacyPageDirty && !privacyPageSaving" class="muted" role="status">有未保存的修改。</p><p v-if="privacyPageError" class="error" role="alert">{{ privacyPageError }}</p><p v-if="privacyPageMessage" class="status-message" role="status">{{ privacyPageMessage }}</p><div class="form-actions"><button type="submit" :disabled="privacyPageSaving || privacyPageConflict">{{ privacyPageSaving ? '保存中…' : '保存草稿' }}</button><button type="button" class="quiet" :disabled="privacyPageSaving || privacyPageDirty || privacyPageConflict" @click="publishPrivacyPageContent">发布到小程序</button><button v-if="privacyPageConflict" type="button" class="quiet" :disabled="privacyPageSaving" @click="reloadPrivacyPageContent">载入最新版本</button></div>
        </form>
      </section>
      <section v-if="activeSection === 'content' && activeContentSection === 'about-history'" id="about-history-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRIVACY / ABOUT / HISTORY</p><h2>关于发布历史</h2></div></div>
        <div class="about-history-list">
          <p v-if="privacyPageError" class="error" role="alert">{{ privacyPageError }}</p>
          <p v-else-if="privacyPageRevisionsLoading" class="muted" role="status">正在读取发布记录…</p>
          <p v-else-if="!privacyPageRevisions.length" class="muted">暂无发布记录。</p>
          <article v-for="revision in privacyPageRevisions" :key="revision.version" class="about-history-card">
            <header><div><p class="eyebrow">PUBLISHED VERSION</p><h3>第 {{ revision.version }} 版</h3></div><time :datetime="revision.publishedAt">{{ new Date(revision.publishedAt).toLocaleString() }}</time></header>
            <p class="about-history-actor">发布管理员：{{ revision.publishedBy || '历史记录未标注' }}</p>
            <div v-if="revision.content" class="about-history-snapshot"><section><h4>品牌介绍</h4><p>{{ revision.content.brandIntro || '—' }}</p></section><section><h4>内容来源</h4><p>{{ revision.content.contentSources || '—' }}</p></section><section><h4>联系方式</h4><p>{{ revision.content.contactInfo || '—' }}</p></section></div>
            <p v-else class="muted">此历史版本未保存内容快照。</p>
          </article>
        </div>
      </section>
      <LegalDocumentManager v-if="adminRole !== 'support_readonly'" ref="privacyDocumentManager" document-key="privacy-policy" :active="activeSection === 'content' && activeContentSection === 'privacy-policy'" :api-base="apiBase" :token="token" :can-publish="isSuperAdmin" :request="apiFetch" :response-message="responseMessage" @unauthorized="logout('后台登录已过期，请重新登录。')" />
      <LegalDocumentManager v-if="adminRole !== 'support_readonly'" ref="agreementDocumentManager" document-key="user-agreement" :active="activeSection === 'content' && activeContentSection === 'user-agreement'" :api-base="apiBase" :token="token" :can-publish="isSuperAdmin" :request="apiFetch" :response-message="responseMessage" @unauthorized="logout('后台登录已过期，请重新登录。')" />
      <LegalHistoryPanel v-if="canAccessModule('pages')" ref="legalHistoryPanel" :active="activeSection === 'content' && activeContentSection === 'legal-history'" :api-base="apiBase" :token="token" :request="apiFetch" :response-message="responseMessage" @restore="restoreLegalVersion" @unauthorized="logout('后台登录已过期，请重新登录。')" />
      <section v-if="activeSection === 'content' && activeContentSection === 'mine'" id="mine-page-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">MY PAGE CONTENT</p><h2>我的页面设置</h2></div></div>
        <div v-if="!minePageContent" class="practice-empty">
          <p class="muted">我的页面设置尚未读取。</p>
          <button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button>
        </div>
        <div v-else-if="minePageContent" class="preview-layout has-preview">
          <aside class="preview-rail" aria-label="小程序我的页面预览">
            <MinePagePreview :content="minePageContent" :active-key="activeMineKey" @pick="pickMineKey" />
          </aside>
          <form class="practice-form" @submit.prevent="saveMinePageContent" @focusin="focusMineField">
          <div class="mine-settings-layout">
            <nav class="mine-editor-tabs" role="tablist" aria-label="我的页面设置模块" aria-orientation="vertical">
              <button id="mine-tab-intro" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'intro' }" :tabindex="minePageEditorTab === 'intro' ? 0 : -1" :aria-selected="minePageEditorTab === 'intro'" aria-controls="mine-panel-intro" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'intro'">我的</button>
              <button id="mine-tab-observations" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'observations' }" :tabindex="minePageEditorTab === 'observations' ? 0 : -1" :aria-selected="minePageEditorTab === 'observations'" aria-controls="mine-panel-observations" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'observations'">01. 我的观察</button>
              <button id="mine-tab-discussions" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'discussions' }" :tabindex="minePageEditorTab === 'discussions' ? 0 : -1" :aria-selected="minePageEditorTab === 'discussions'" aria-controls="mine-panel-discussions" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'discussions'">02. 参与的讨论</button>
              <button id="mine-tab-practice" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'practice' }" :tabindex="minePageEditorTab === 'practice' ? 0 : -1" :aria-selected="minePageEditorTab === 'practice'" aria-controls="mine-panel-practice" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'practice'">03. 线下实践</button>
              <button id="mine-tab-privacy" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'privacy' }" :tabindex="minePageEditorTab === 'privacy' ? 0 : -1" :aria-selected="minePageEditorTab === 'privacy'" aria-controls="mine-panel-privacy" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'privacy'">04. 选择与隐私</button>
            </nav>
            <div class="mine-page-fields">
            <section v-show="minePageEditorTab === 'intro'" id="mine-panel-intro" data-mine-field="intro" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-intro" tabindex="0">
              <div><p class="eyebrow">MY PAGE</p><h3 id="mine-copy-above">我的</h3></div>
              <RichTextEditor v-model="minePageContent.title" label="主标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.intro" label="说明文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'observations'" id="mine-panel-observations" data-mine-field="observations" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-observations" tabindex="0">
              <div><p class="eyebrow">01 · MY OBSERVATIONS</p><h3 id="mine-copy-below">01.我的观察</h3></div>
              <RichTextEditor v-model="minePageContent.observationHeading" label="观察记录区标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.emptyTitle" label="空状态标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.emptyIntro" label="空状态说明" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.startButton" label="观察按钮文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'discussions'" id="mine-panel-discussions" data-mine-field="discussions" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-discussions" tabindex="0">
              <div><p class="eyebrow">DISCUSSIONS</p><h3 id="mine-copy-discussions">参与的讨论</h3></div>
              <RichTextEditor v-model="minePageContent.discussionHeading" label="模块标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.discussionCount" label="发言计数文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.discussionEmptyAction" label="空状态入口文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.discussionIntro" label="模块说明" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'practice'" id="mine-panel-practice" data-mine-field="practice" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-practice" tabindex="0">
              <div><p class="eyebrow">OFFLINE PRACTICE</p><h3 id="mine-copy-practice">线下实践</h3></div>
              <RichTextEditor v-model="minePageContent.practiceHeading" label="模块标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.practiceCount" label="参与次数文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.practiceEmptyTitle" label="空状态标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.practiceIntro" label="空状态说明" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'privacy'" id="mine-panel-privacy" data-mine-field="privacy" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-privacy" tabindex="0">
              <div><p class="eyebrow">PRIVACY</p><h3 id="mine-copy-privacy">选择与隐私</h3></div>
              <RichTextEditor v-model="minePageContent.privacyHeading" label="模块标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.privacyAction" label="入口文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            </div>
          </div>
          <p v-if="minePageContentConflict" class="error full" role="alert">我的页面设置已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
          <p v-if="minePageContentDirty && !minePageContentSaving" class="muted" role="status">有未保存的修改。</p>
          <p v-if="minePageContentError" class="error" role="alert">{{ minePageContentError }}</p>
          <p v-if="minePageContentMessage" class="status-message" role="status">{{ minePageContentMessage }}</p>
          <div class="form-actions"><button type="submit" :disabled="minePageContentSaving || minePageContentConflict">{{ minePageContentSaving ? '保存中…' : '保存我的页面设置' }}</button><button v-if="minePageContentConflict" type="button" class="quiet" :disabled="minePageContentSaving" @click="reloadMinePageContent">{{ minePageContentSaving ? '读取中…' : '放弃修改并载入最新版本' }}</button></div>
          </form>
        </div>
      </section>
      <section v-if="activeSection === 'observations'" id="observations" class="content-area">
          <div class="section-heading"><div><p class="eyebrow">OBSERVATIONS</p><h2>观察记录管理</h2></div></div>
          
          
          <p v-if="reencryptMessage" class="status-message" role="status">{{ reencryptMessage }}</p>
         <div class="filters" aria-label="观察记录筛选"><label>方式<select v-model="observationMethod" @change="refreshObservations"><option value="">全部方式</option><option value="reality">从现实处境开始</option><option value="season">从四时气韵开始</option></select></label><label>状态<select v-model="observationStatus" :disabled="observationStaleOnly" @change="refreshObservations"><option value="">全部</option><option value="draft">草稿</option><option value="saved">已保存</option></select></label><label>期刊<select v-model="observationIssueCode" @change="refreshObservations"><option value="">全部期刊</option><option v-for="issue in issues" :key="issue.code" :value="issue.code">{{ issue.label }}</option></select></label><label class="checkbox-filter"><input v-model="observationStaleOnly" type="checkbox" @change="toggleObservationStale" />只看超期草稿</label><button class="quiet observation-sync-button" :disabled="reencrypting" @click="reencryptObservations">{{ reencrypting ? '同步中…' : reencryptCursor ? '继续同步' : '同步历史' }}</button></div>
        <div class="observation-table">
          <div class="observation-head managed-observation-head"><span>方式</span><span>期刊</span><span>状态</span><span>用户</span><span>更新时间</span><span>内容</span></div>
          <div v-for="record in observations" :key="record.id" class="observation-row managed-observation-head"><span>{{ record.method === 'reality' ? '从现实处境开始' : '从四时气韵开始' }}</span><span>{{ record.issueLabel || issueLabel(record.issueCode ?? undefined) }}<small v-if="record.issueQuestion">{{ record.issueQuestion }}</small></span><span>{{ record.status === 'draft' ? '草稿' : record.status === 'saved' ? '已保存' : record.status }}</span><span class="mono">{{ record.nickname ? record.nickname : (record.userId.slice(0, 8) + '…') }}</span><span class="mono">{{ record.updatedAt }}</span><span><button class="quiet observation-view-button" @click="viewObservation(record)">查看内容</button></span></div>
          <p v-if="!observations.length" class="muted">暂时没有观察记录。</p>
          <div v-if="observationHasMore || observationMoreError" class="table-actions"><button class="quiet" :disabled="observationLoadingMore" @click="loadMoreObservations">{{ observationLoadingMore ? '加载中…' : observationMoreError || '加载更多记录' }}</button></div>
        </div>
        <Teleport to="body">
<div v-if="selectedObservationLoading || selectedObservationError || selectedObservation" class="observation-modal-backdrop" @click.self="selectedObservation = null; selectedObservationError = ''">
          <section class="observation-detail-panel" role="dialog" aria-modal="true" aria-labelledby="observation-modal-title" aria-live="polite" tabindex="-1" @keydown.esc="selectedObservation = null; selectedObservationError = ''">
            <div class="section-heading"><div><p class="eyebrow">PRIVATE OBSERVATION</p><h3 id="observation-modal-title">记录内容</h3></div><button type="button" class="quiet" aria-label="关闭记录内容" @click="selectedObservation = null; selectedObservationError = ''">关闭</button></div>
          <div class="panel-body">
            <p v-if="selectedObservationLoading" class="muted" role="status">正在读取并解密记录…</p>
            <p v-else-if="selectedObservationError" class="error" role="alert">{{ selectedObservationError }}</p>
            <template v-else-if="selectedObservation">
              <p class="muted observation-detail-meta">{{ selectedObservation.method === 'reality' ? '现实处境' : '四时气韵' }} · {{ selectedObservation.status === 'draft' ? '草稿' : '已保存' }} · 用户 {{ selectedObservation.nickname ? selectedObservation.nickname : (selectedObservation.userId.slice(0, 8) + '…') }}</p>
              <article v-for="answer in selectedObservationAnswers" :key="answer.key" class="observation-answer" :class="{ 'observation-answer--empty': answer.empty }"><h4>{{ answer.label }}</h4><p>{{ answer.value }}</p></article>
            </template>
          </div>
        </section>
        </div>
</Teleport>
      </section>
      <section v-if="activeSection === 'contributions'" id="discussion-contributions" class="content-area discussion-management">
        <div class="section-heading discussion-page-heading">
          <div><p class="eyebrow">TOGETHER / CONTENT</p><h2>一起谈谈内容</h2><p class="admin-page-description">审核主经历与回复留言，处理公开状态和精华展示；会员发布权限请前往「一起谈谈权限」。</p></div>
          <div class="section-tools discussion-page-actions"><button type="button" class="quiet" :disabled="discussionContributionLoading" @click="refreshDiscussionContributions()">{{ discussionContributionLoading ? '刷新中…' : '刷新内容' }}</button></div>
        </div>
          <p v-if="discussionContributionActionMessage" class="status-message" role="status">{{ discussionContributionActionMessage }}</p>
          <p v-if="discussionContributionError" class="error" role="alert">{{ discussionContributionError }}</p>
          <div class="discussion-summary-tabs" aria-label="发布状态概览">
            <button v-for="status in discussionPublicationStatuses" :key="status" type="button" :class="{ active: discussionContributionPublicationStatus === status }" @click="discussionContributionPublicationStatus = status; refreshDiscussionContributions()"><span>{{ discussionContributionPublicationLabel(status) }}</span><strong>{{ discussionContributionSummary[status] }}</strong></button>
            <button type="button" :class="{ active: discussionContributionPublicationStatus === '' }" @click="discussionContributionPublicationStatus = ''; refreshDiscussionContributions()"><span>全部</span><strong>{{ discussionContributionGrandTotal }}</strong></button>
          </div>
          <div class="filters" aria-label="讨论内容筛选">
            <label>发布状态<select v-model="discussionContributionPublicationStatus" @change="refreshDiscussionContributions"><option value="pending">待审核</option><option value="published">已公开</option><option value="hidden">已隐藏</option><option value="rejected">已拒绝</option><option value="">全部</option></select></label>
            <label>类型<select v-model="discussionContributionKind" @change="refreshDiscussionContributions"><option value="">全部</option><option value="experience">主经历</option><option value="reply">回复留言</option></select></label>
            <label>期刊<select v-model="discussionContributionIssueCode" @change="refreshDiscussionContributions"><option value="">全部期刊</option><option v-for="issue in issues" :key="issue.code" :value="issue.code">{{ issue.label }}</option></select></label>
          </div>
          <div class="discussion-contribution-table" aria-live="polite">
            <div class="discussion-contribution-head"><span>内容 / 作者</span><span>内容摘要</span><span>发布状态</span><span>更新时间</span><span>操作</span></div>
            <div v-for="record in discussionContributions" :key="record.id" class="discussion-contribution-row">
              <span><strong>{{ record.issueLabel || record.issueCode }}</strong><small>{{ record.threadId ? '回复留言' : '主经历' }} · {{ discussionContributionAuthor(record) }}</small></span>
              <span class="discussion-contribution-preview">{{ record.bodyPreview || '正文需要打开后查看' }}</span>
              <span class="discussion-publication-cell"><strong class="discussion-status-pill" :class="'is-' + record.publicationStatus">{{ discussionContributionPublicationLabel(record.publicationStatus) }}</strong><small v-if="record.featuredAt">精华 #{{ record.featuredOrder }}</small></span>
              <span>{{ displayDate(record.updatedAt) }}</span>
              <span class="discussion-contribution-row-actions">
                <button type="button" class="quiet observation-view-button" @click="viewDiscussionContribution(record)">查看</button>
                <template v-if="record.publicationStatus === 'pending'">
                  <button type="button" class="quiet" :disabled="discussionContributionSaving" @click="updateDiscussionContributionPublication(record, 'published')">发布</button>
                  <button type="button" class="quiet danger" :disabled="discussionContributionSaving" @click="updateDiscussionContributionPublication(record, 'rejected')">拒绝</button>
                </template>
                <button v-else-if="record.publicationStatus === 'published'" type="button" class="quiet" :disabled="discussionContributionSaving" @click="updateDiscussionContributionPublication(record, 'hidden')">隐藏</button>
                <button v-else type="button" class="quiet" :disabled="discussionContributionSaving" @click="updateDiscussionContributionPublication(record, 'pending')">恢复待审核</button>
              </span>
            </div>
            <p v-if="discussionContributionLoading && !discussionContributions.length" class="muted" role="status">正在读取讨论内容…</p>
            <p v-else-if="!discussionContributionLoading && !discussionContributions.length" class="muted">当前筛选下没有讨论内容。</p>
            <div v-if="discussionContributionHasMore || discussionContributionMoreError" class="table-actions"><button type="button" class="quiet" :disabled="discussionContributionLoadingMore" @click="discussionContributionMoreError ? refreshDiscussionContributions() : loadMoreDiscussionContributions()">{{ discussionContributionLoadingMore ? '加载中…' : discussionContributionMoreError || '加载更多内容' }}</button></div>
          </div>
          <Teleport to="body">
            <div v-if="selectedDiscussionContributionLoading || selectedDiscussionContributionError || selectedDiscussionContribution" class="observation-modal-backdrop" @click.self="selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">
              <section class="observation-detail-panel discussion-contribution-detail" role="dialog" aria-modal="true" aria-labelledby="discussion-contribution-title" aria-live="polite" tabindex="-1" @keydown.esc="selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">
                <div class="section-heading"><div><p class="eyebrow">DISCUSSION / CONTENT</p><h3 id="discussion-contribution-title">讨论内容</h3></div><button type="button" class="quiet" aria-label="关闭讨论内容" @click="selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">关闭</button></div>
                <div class="panel-body">
                  <p v-if="selectedDiscussionContributionLoading" class="muted" role="status">正在读取讨论内容…</p>
                  <p v-else-if="selectedDiscussionContributionError" class="error" role="alert">{{ selectedDiscussionContributionError }}</p>
                  <template v-else-if="selectedDiscussionContribution">
                    <p class="muted observation-detail-meta">{{ selectedDiscussionContribution.issueLabel }} · {{ selectedDiscussionContribution.threadId ? `回复留言 · ${selectedDiscussionContribution.threadAuthor || '原楼作者'}` : '主经历' }} · 作者 {{ discussionContributionAuthor(selectedDiscussionContribution) }} · {{ discussionContributionPublicationLabel(selectedDiscussionContribution.publicationStatus) }}<span v-if="selectedDiscussionContribution.featuredAt"> · 精华 #{{ selectedDiscussionContribution.featuredOrder }}</span></p>
                    <article class="discussion-contribution-body">{{ selectedDiscussionContribution.body }}</article>
                    <p v-if="discussionContributionActionMessage" class="status-message" role="status">{{ discussionContributionActionMessage }}</p>
                    <div class="discussion-moderation-block">
                      <div><h4>发布状态</h4><p>公开后小程序读者可看到；隐藏、拒绝或恢复待审核都会自动取消精华。</p></div>
                      <div class="form-actions discussion-contribution-actions">
                        <button type="button" :disabled="discussionContributionSaving || selectedDiscussionContribution.publicationStatus === 'published'" @click="updateDiscussionContributionPublication(selectedDiscussionContribution, 'published')">{{ discussionContributionSaving ? '保存中…' : '发布' }}</button>
                        <button type="button" class="quiet" :disabled="discussionContributionSaving || selectedDiscussionContribution.publicationStatus === 'hidden'" @click="updateDiscussionContributionPublication(selectedDiscussionContribution, 'hidden')">隐藏</button>
                        <button type="button" class="quiet danger" :disabled="discussionContributionSaving || selectedDiscussionContribution.publicationStatus === 'rejected'" @click="updateDiscussionContributionPublication(selectedDiscussionContribution, 'rejected')">拒绝</button>
                        <button type="button" class="quiet" :disabled="discussionContributionSaving || selectedDiscussionContribution.publicationStatus === 'pending'" @click="updateDiscussionContributionPublication(selectedDiscussionContribution, 'pending')">恢复待审核</button>
                      </div>
                    </div>
                    <div v-if="!selectedDiscussionContribution.threadId" class="discussion-moderation-block">
                      <div><h4>精华展示</h4><p>只有已公开的主经历可以设为精华；顺序数字越小越靠前。</p></div>
                      <template v-if="selectedDiscussionContribution.publicationStatus === 'published'">
                        <label class="discussion-featured-order">精华顺序<input v-model="discussionContributionFeaturedOrder" type="number" min="0" max="999" step="1" inputmode="numeric" /></label>
                        <div class="form-actions discussion-contribution-actions">
                          <button type="button" :disabled="discussionContributionSaving || Boolean(selectedDiscussionContribution.featuredAt)" @click="updateDiscussionContributionFeatured(selectedDiscussionContribution, true)">{{ selectedDiscussionContribution.featuredAt ? '已设为精华' : '设为精华' }}</button>
                          <button type="button" class="quiet" :disabled="discussionContributionSaving || !selectedDiscussionContribution.featuredAt" @click="updateDiscussionContributionFeatured(selectedDiscussionContribution, true)">更新顺序</button>
                          <button type="button" class="quiet" :disabled="discussionContributionSaving || !selectedDiscussionContribution.featuredAt" @click="updateDiscussionContributionFeatured(selectedDiscussionContribution, false)">取消精华</button>
                        </div>
                      </template>
                      <p v-else class="muted">先将内容发布并公开，才能设置精华。</p>
                    </div>
                    <div class="discussion-moderation-block discussion-restriction-entry">
                      <div><h4>停用一起谈谈权限</h4><p>停用后不能查看和参与一起谈谈；不会停用账号，也不影响登录、观察、实践和商城。</p></div>
                      <button type="button" class="quiet" @click="prefillDiscussionRestriction(selectedDiscussionContribution); selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">管理权限</button>
                    </div>
                  </template>
                </div>
              </section>
            </div>
          </Teleport>
      </section>

      <section v-if="activeSection === 'discussion-restrictions'" id="discussion-restrictions" class="content-area discussion-management discussion-restrictions-page">
        <div class="section-heading discussion-page-heading">
          <div><p class="eyebrow">TOGETHER / ACCESS</p><h2>一起谈谈权限</h2><p class="admin-page-description">单独管理会员查看和参与一起谈谈的权限，不影响账号登录、观察、实践和商城。</p></div>
          <div class="section-tools discussion-page-actions">
            <button type="button" class="quiet" :disabled="discussionRestrictionLoading" @click="refreshDiscussionRestrictions()">{{ discussionRestrictionLoading ? '刷新中…' : '刷新记录' }}</button>
            <button type="button" class="discussion-primary-action" @click="openNewDiscussionRestrictionDialog">停用权限</button>
          </div>
        </div>

        <div class="discussion-restriction-notice"><strong>仅停用一起谈谈权限</strong><span>停用后，该会员不能查看或参与一起谈谈；账号仍可正常登录，观察、实践和商城等功能不受影响。临时停用到期自动恢复，永久停用需手动恢复。</span></div>
        <p v-if="discussionRestrictionCreateMessage" class="status-message" role="status">{{ discussionRestrictionCreateMessage }}</p>
        <p v-if="discussionRestrictionActionMessage" class="status-message" role="status">{{ discussionRestrictionActionMessage }}</p>
        <p v-if="discussionRestrictionError" class="error" role="alert">{{ discussionRestrictionError }}</p>

        <div class="discussion-summary-tabs" aria-label="一起谈谈权限状态概览">
          <button v-for="status in discussionRestrictionStatuses" :key="status" type="button" :class="{ active: discussionRestrictionStatus === status }" @click="discussionRestrictionStatus = status; refreshDiscussionRestrictions()"><span>{{ discussionRestrictionStatusLabel(status) }}</span><strong>{{ discussionRestrictionSummary[status] }}</strong></button>
          <button type="button" :class="{ active: discussionRestrictionStatus === '' }" @click="discussionRestrictionStatus = ''; refreshDiscussionRestrictions()"><span>全部</span><strong>{{ discussionRestrictionGrandTotal }}</strong></button>
        </div>

        <div class="discussion-table-panel">
          <div class="discussion-table-toolbar">
            <div><strong>权限记录</strong><small>按状态筛选，及时恢复临时或永久停用的权限。</small></div>
            <div class="filters" aria-label="一起谈谈权限筛选"><label>权限状态<select v-model="discussionRestrictionStatus" @change="refreshDiscussionRestrictions"><option value="active">停用中</option><option value="scheduled">待停用</option><option value="expired">已到期</option><option value="revoked">已恢复</option><option value="">全部</option></select></label></div>
          </div>
          <div class="discussion-restriction-table" aria-live="polite">
            <div class="discussion-restriction-head"><span>用户</span><span>停用原因</span><span>停用期限</span><span>状态</span><span>操作人</span><span>操作</span></div>
            <div v-for="restriction in discussionRestrictions" :key="restriction.id" class="discussion-restriction-row">
              <span><strong>{{ restriction.nickname || '未设置昵称' }}</strong><small class="mono">{{ restriction.userId }}</small></span>
              <span>{{ restriction.reason }}</span>
              <span>{{ discussionRestrictionPeriod(restriction) }}</span>
              <span><strong class="discussion-status-pill" :class="'is-' + restriction.effectiveStatus">{{ discussionRestrictionStatusLabel(restriction.effectiveStatus) }}</strong></span>
              <span>{{ restriction.createdBy }}<small>{{ displayDate(restriction.createdAt) }}</small></span>
              <span><button v-if="restriction.effectiveStatus === 'active' || restriction.effectiveStatus === 'scheduled'" type="button" class="quiet" :disabled="discussionRestrictionSavingId === restriction.id" @click="revokeDiscussionRestriction(restriction)">{{ discussionRestrictionSavingId === restriction.id ? '恢复中…' : '恢复权限' }}</button><small v-else-if="restriction.revokedAt">恢复于 {{ displayDate(restriction.revokedAt) }}</small></span>
            </div>
            <p v-if="discussionRestrictionLoading && !discussionRestrictions.length" class="muted" role="status">正在读取一起谈谈权限记录…</p>
            <p v-else-if="!discussionRestrictionLoading && !discussionRestrictions.length" class="muted">当前筛选下没有一起谈谈权限记录。</p>
            <div v-if="discussionRestrictionHasMore || discussionRestrictionMoreError" class="table-actions"><button type="button" class="quiet" :disabled="discussionRestrictionLoadingMore" @click="discussionRestrictionMoreError ? refreshDiscussionRestrictions() : loadMoreDiscussionRestrictions()">{{ discussionRestrictionLoadingMore ? '加载中…' : discussionRestrictionMoreError || '加载更多记录' }}</button></div>
          </div>
        </div>

        <Teleport to="body">
          <div v-if="discussionRestrictionDialogOpen" class="observation-modal-backdrop" @click.self="closeDiscussionRestrictionDialog">
            <section class="observation-detail-panel discussion-restriction-dialog" role="dialog" aria-modal="true" aria-labelledby="discussion-restriction-dialog-title" aria-describedby="discussion-restriction-dialog-description" tabindex="-1" @keydown.esc.stop="closeDiscussionRestrictionDialog">
              <div class="section-heading">
                <div><p class="eyebrow">TOGETHER ACCESS</p><h3 id="discussion-restriction-dialog-title">停用一起谈谈权限</h3></div>
                <button type="button" class="quiet" :disabled="discussionRestrictionCreating" @click="closeDiscussionRestrictionDialog">关闭</button>
              </div>
              <div class="panel-body discussion-restriction-dialog-body">
                <p id="discussion-restriction-dialog-description" class="discussion-dialog-description">临时停用会在到期后自动恢复；永久停用需要管理员手动恢复。</p>
                <p v-if="discussionRestrictionPrefillNickname" class="discussion-restriction-prefill">正在为「{{ discussionRestrictionPrefillNickname }}」管理一起谈谈权限。</p>
                <form class="discussion-restriction-form" novalidate @input="discussionRestrictionCreateError = ''" @submit.prevent="createDiscussionRestriction">
                  <label class="discussion-restriction-user-field">用户 UUID<input id="discussion-restriction-user" v-model="discussionRestrictionForm.userId" type="text" autocomplete="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required /></label>
                  <label class="discussion-restriction-reason-field">停用原因<textarea id="discussion-restriction-reason" v-model="discussionRestrictionForm.reason" rows="3" minlength="2" maxlength="200" placeholder="例如：多次发布不当言论" required /></label>
                  <fieldset class="discussion-restriction-duration">
                    <legend>停用方式</legend>
                    <div class="discussion-restriction-modes">
                      <label><input v-model="discussionRestrictionMode" type="radio" value="temporary" />临时停用</label>
                      <label><input v-model="discussionRestrictionMode" type="radio" value="permanent" />永久停用</label>
                    </div>
                    <input v-if="discussionRestrictionMode === 'temporary'" id="discussion-restriction-ends-at" v-model="discussionRestrictionForm.endsAt" type="datetime-local" :min="discussionRestrictionEarliestEndsAt" aria-label="临时停用结束时间" required />
                    <small v-if="discussionRestrictionMode === 'temporary'">默认 24 小时后自动恢复，可按实际停用时长调整。</small>
                    <small v-else>不设置结束时间，需手动恢复权限。</small>
                  </fieldset>
                  <p v-if="discussionRestrictionCreateError" class="error discussion-restriction-dialog-error" role="alert">{{ discussionRestrictionCreateError }}</p>
                  <div class="form-actions discussion-restriction-dialog-actions">
                    <button type="button" class="quiet" :disabled="discussionRestrictionCreating" @click="closeDiscussionRestrictionDialog">取消</button>
                    <button type="submit" :disabled="discussionRestrictionCreating">{{ discussionRestrictionCreating ? '处理中…' : '确认停用' }}</button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </Teleport>
      </section>
      <section v-if="activeSection === 'discussion-reports'" id="discussion-reports" class="content-area">
        <div class="reports-toolbar"><small v-if="discussionReportSummary.pending" class="muted">待处理 {{ discussionReportSummary.pending }} 条</small><button type="button" class="quiet" :disabled="discussionReportLoading" @click="refreshDiscussionReports()">{{ discussionReportLoading ? '刷新中…' : '刷新举报' }}</button></div>
        <p class="muted">这里只处理用户提交的举报；互动内容审核在「一起谈谈内容」处理，会员权限在「一起谈谈权限」处理。</p>
        <p v-if="discussionReportActionMessage" class="status-message" role="status">{{ discussionReportActionMessage }}</p>
        <p v-if="discussionReportError" class="error" role="alert">{{ discussionReportError }}</p>
        <div class="filters" aria-label="内容举报筛选"><label>处理状态<select v-model="discussionReportStatus" @change="refreshDiscussionReports()"><option value="pending">待处理</option><option value="handled">已处理</option><option value="dismissed">不采纳</option><option value="">全部</option></select></label><label>期刊<select v-model="discussionReportIssueCode" @change="refreshDiscussionReports()"><option value="">全部期刊</option><option v-for="issue in issues" :key="issue.code" :value="issue.code">{{ issue.label }}</option></select></label></div>
        <div class="discussion-report-table" aria-live="polite">
          <div class="discussion-report-head"><span>期刊 / 被举报内容</span><span>原因</span><span>状态</span><span>提交时间</span><span>处理</span></div>
          <div v-for="report in discussionReports" :key="report.id" class="discussion-report-row">
            <span><strong>{{ report.issueLabel || report.issueCode }}</strong><small>{{ report.threadAuthor ? `作者 ${report.threadAuthor} · ` : '' }}{{ report.threadBody ? (report.threadBody.length > 60 ? `${report.threadBody.slice(0, 60)}…` : report.threadBody) : '内容快照缺失' }}</small><small v-if="report.detail" class="discussion-report-detail">补充：{{ report.detail }}</small></span>
            <span>{{ discussionReportReasonLabel(report.reason) }}</span>
            <span>{{ report.status === 'pending' ? '待处理' : report.status === 'handled' ? '已处理' : '不采纳' }}</span>
            <span>{{ displayDate(report.updatedAt) }}</span>
            <span class="discussion-report-actions">
              <button v-if="report.status !== 'handled'" type="button" class="quiet" :disabled="discussionReportSavingId === report.id" @click="updateDiscussionReportStatus(report, 'handled')">{{ discussionReportSavingId === report.id ? '处理中…' : '标记已处理' }}</button>
              <button v-if="report.status !== 'dismissed'" type="button" class="quiet danger" :disabled="discussionReportSavingId === report.id" @click="updateDiscussionReportStatus(report, 'dismissed')">不采纳</button>
              <button v-if="report.status !== 'pending'" type="button" class="quiet" :disabled="discussionReportSavingId === report.id" @click="updateDiscussionReportStatus(report, 'pending')">重新打开</button>
            </span>
          </div>
          <p v-if="discussionReportLoading && !discussionReports.length" class="muted" role="status">正在读取内容举报…</p>
          <p v-else-if="!discussionReportLoading && !discussionReports.length" class="muted">当前筛选下没有用户举报。</p>
          <div v-if="discussionReportHasMore" class="table-actions"><button type="button" class="quiet" :disabled="discussionReportLoading" @click="refreshDiscussionReports(true)">{{ discussionReportLoading ? '加载中…' : '加载更多举报' }}</button></div>
        </div>
      </section>
      <section v-if="activeSection === 'privacy'" id="privacy-requests" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRIVACY</p><h2>账户删除申请</h2></div><div class="section-tools"><button class="quiet" :disabled="privacyControlsBusy" @click="refreshPrivacy(true)">{{ privacyRefreshing ? '刷新中…' : '刷新申请' }}</button></div></div>
        <div class="filters" aria-label="账户删除申请筛选"><label>状态<select v-model="privacyStatus" :disabled="privacyControlsBusy" @change="refreshPrivacy()"><option value="">全部</option><option value="pending">待处理</option><option value="failed">失败</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label></div>
        <p v-if="privacyActionMessage" class="status-message" role="status">{{ privacyActionMessage }}</p>
        <p v-if="privacyActionError" class="error" role="alert">{{ privacyActionError }}</p>
        <div class="observation-table">
          <div class="observation-head privacy-head"><span>申请编号</span><span>用户</span><span>状态</span><span>计划执行 / 操作</span></div>
          <div v-for="request in privacyRequests" :key="request.id" class="observation-row privacy-head"><span class="mono">{{ request.id.slice(0, 8) }}…</span><span class="mono">{{ request.userId ? `${request.userId.slice(0, 8)}…` : '账号已删除' }}</span><span>{{ request.status === 'completed' ? '已完成' : request.status === 'cancelled' ? '已取消' : request.status === 'failed' ? '失败' : '待处理' }}</span><span><span>{{ request.scheduledFor }}</span><small v-if="request.status === 'pending' && request.attemptCount">已尝试 {{ request.attemptCount }} 次；下次 {{ request.nextAttemptAt }}</small><small v-else-if="request.status === 'failed'">已达到自动重试上限：{{ request.lastError || '未记录原因' }}</small><button v-if="request.status === 'pending' && new Date(request.scheduledFor) <= new Date() && (!request.nextAttemptAt || new Date(request.nextAttemptAt) <= new Date())" class="danger quiet" :disabled="privacyControlsBusy" @click="processPrivacy(request.id)">{{ processingPrivacyId === request.id ? '执行中…' : '执行删除' }}</button><button v-else-if="request.status === 'failed'" class="quiet" :disabled="privacyControlsBusy" @click="retryPrivacy(request.id)">{{ retryingPrivacyId === request.id ? '重新排队中…' : '重新排队' }}</button></span></div>
          <p v-if="!privacyRequests.length" class="muted">暂无账户删除申请。</p>
          <div v-if="privacyHasMore || privacyMoreError" class="table-actions"><button class="quiet" :disabled="privacyControlsBusy" @click="privacyMoreError ? refreshPrivacy() : loadMorePrivacy()">{{ privacyLoadingMore ? '加载中…' : privacyMoreError || '加载更多删除申请' }}</button></div>
        </div>
      </section>
      <section v-if="activeSection === 'audit'" id="audit-logs" class="content-area audit-page">
        <div class="section-heading audit-page-heading">
          <div>
            <p class="eyebrow">AUDIT LOG / 操作记录</p>
            <h2>操作记录</h2>
            <p class="audit-page-intro">这里记录谁在什么时候做了什么，方便回看重要操作。平时看中文摘要就够了，需要排查时再展开详情。</p>
          </div>
        </div>
        <div class="filters audit-filters" aria-label="操作记录筛选">
          <label>谁操作的<select v-model="auditActorType"><option value="">全部人员</option><option value="admin">管理员</option><option value="user">用户</option><option value="system">系统</option></select></label>
          <label class="audit-action-filter">做了什么<select v-model="auditAction"><option value="">全部操作</option><optgroup v-for="group in auditActionGroups" :key="group.category" :label="group.category"><option v-for="action in group.actions" :key="action.value" :value="action.value">{{ action.label }}</option></optgroup></select></label>
          <div class="audit-filter-actions"><button type="button" :disabled="auditLoadingMore" @click="refreshAudit">筛选</button><button type="button" class="quiet" :disabled="auditLoadingMore" @click="resetAuditFilters">重置</button></div>
        </div>
        <div class="audit-result-summary" role="status"><strong>共 {{ auditTotal }} 条操作记录</strong><span>页面会按发生时间从新到旧排列。</span></div>
        <div v-if="auditLogs.length" class="audit-log-list">
          <article v-for="entry in auditLogs" :key="entry.id" class="audit-log-item">
            <span class="audit-actor-mark" :class="`is-${entry.actorType}`" aria-hidden="true">{{ auditActorInitial(entry.actorType) }}</span>
            <div class="audit-log-main">
              <div class="audit-log-title-line">
                <h3>{{ auditActorLabel(entry.actorType) }}{{ auditActionLabel(entry.action) }}</h3>
                <span class="audit-category-label">{{ auditActionCategory(entry.action) }}</span>
              </div>
              <p class="audit-log-meta"><time :datetime="entry.createdAt" :title="displayDate(entry.createdAt)">{{ notificationTimeLabel(entry.createdAt) }}</time><span aria-hidden="true">·</span><span>涉及：{{ auditResourceLabel(entry.resourceType) }}</span></p>
              <button type="button" class="audit-detail-toggle" :aria-expanded="auditExpandedId === entry.id" :aria-controls="`audit-detail-${entry.id}`" @click="toggleAuditDetail(entry.id)">{{ auditExpandedId === entry.id ? '收起技术详情' : '查看技术详情' }}</button>
              <div v-if="auditExpandedId === entry.id" :id="`audit-detail-${entry.id}`" class="audit-log-details">
                <dl class="audit-detail-grid">
                  <dt>操作时间</dt><dd>{{ displayDate(entry.createdAt) }}</dd>
                  <dt>原始操作代码</dt><dd class="mono">{{ entry.action }}</dd>
                  <dt>资源类型</dt><dd class="mono">{{ entry.resourceType }}</dd>
                  <dt>资源 ID</dt><dd class="mono">{{ entry.resourceId || '无' }}</dd>
                  <dt>执行者 ID</dt><dd class="mono">{{ entry.actorId || '无' }}</dd>
                  <dt>附加信息</dt><dd><pre>{{ auditMetadataText(entry.metadata) }}</pre></dd>
                </dl>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="audit-empty-state">
          <strong>当前筛选条件下没有操作记录</strong>
          <span>可以换一个操作人员或操作类型再试。</span>
        </div>
        <div v-if="auditHasMore || auditMoreError" class="table-actions"><button class="quiet" :disabled="auditLoadingMore" @click="loadMoreAudit">{{ auditLoadingMore ? '加载中…' : auditMoreError || '加载更多操作记录' }}</button></div>
      </section>
      <section v-if="activeSection === 'members'" id="member-directory" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">MEMBER DIRECTORY</p><h2>会员列表</h2></div></div>
        <div class="member-permission-guide" role="note" aria-label="停用账号与一起谈谈权限的区别">
          <div><strong>停用账号</strong><span>阻止会员登录并使用全部功能，仅超级管理员可操作。</span></div>
          <div><strong>一起谈谈权限</strong><span>停用后不能查看和参与一起谈谈；不影响登录、观察、实践和商城。</span></div>
        </div>
        <div class="filters member-filters" aria-label="会员筛选"><label>昵称、ID 或手机号后四位<input v-model="memberQuery" maxlength="80" placeholder="搜索会员资料" @keyup.enter="refreshMembers()" /></label><label>注册自<DatePickerField v-model="memberFrom" aria-label="注册自" clearable /></label><label>注册至<DatePickerField v-model="memberTo" aria-label="注册至" clearable /></label><button class="quiet" :disabled="memberLoading" @click="refreshMembers()">{{ memberLoading ? '读取中…' : '筛选会员' }}</button></div>
        <p v-if="memberError" class="error" role="alert">{{ memberError }}</p>
        <p class="muted">当前条件 {{ memberTotal }} 位会员</p>
        <div class="observation-table">
          <div class="observation-head member-head"><span>会员资料</span><span>生日</span><span>收货地址</span><span>注册时间</span><span>手机号</span><span>观察记录</span><span>账号状态</span><span>操作</span></div>
          <div v-for="member in members" :key="member.id" class="observation-row member-head"><div class="member-summary"><img v-if="member.avatarUrl" class="member-avatar" :src="member.avatarUrl" :alt="member.nickname || '会员头像'" /><span v-else class="member-avatar-placeholder" aria-hidden="true">{{ member.nickname ? member.nickname.slice(0, 1) : 'M' }}</span><span class="member-summary-copy"><strong>{{ member.nickname || '未设置昵称' }}</strong></span></div><span class="member-birthday">{{ memberBirthday(member) }}</span><span class="member-address">{{ isSuperAdmin ? memberAddressRegion(member.address) : '仅超级管理员可见' }}</span><span>{{ displayDate(member.createdAt) }}</span><span class="member-phone">{{ member.phoneNumber || member.phoneMasked || '未绑定' }}</span><span>{{ member.observationCount }}</span><span>{{ member.status === 'active' ? '正常' : '已停用' }}</span><span class="member-actions"><button type="button" class="quiet" @click="showMember(member.id)">详情</button><button v-if="canAccessModule('contributions')" type="button" class="quiet" @click="openMemberDiscussionRestriction(member)">一起谈谈权限</button><button v-if="isSuperAdmin" type="button" class="quiet" @click="toggleMemberStatus(member)">{{ member.status === 'active' ? '停用账号' : '恢复账号' }}</button></span></div>
          <p v-if="!members.length && !memberLoading" class="muted">没有找到会员记录。</p>
          <div v-if="memberOffset < memberTotal" class="table-actions"><button class="quiet" :disabled="memberLoading" @click="refreshMembers(true)">加载更多会员</button></div>
        </div>
        <Teleport to="body">
<div v-if="memberDetail" class="observation-modal-backdrop" @click.self="memberDetail = null"><section class="observation-detail-panel" role="dialog" aria-modal="true" aria-labelledby="member-detail-title" @keydown.esc="memberDetail = null"><div class="section-heading"><div><p class="eyebrow">MEMBER ACCOUNT</p><h3 id="member-detail-title">会员详情</h3></div><button class="quiet" @click="memberDetail = null">关闭</button></div>
          <div class="panel-body"><div class="member-detail-profile"><img v-if="memberDetail.avatarUrl" class="member-avatar" :src="memberDetail.avatarUrl" :alt="memberDetail.nickname || '会员头像'" /><span v-else class="member-avatar-placeholder" aria-hidden="true">{{ memberDetail.nickname ? memberDetail.nickname.slice(0, 1) : 'M' }}</span><strong>{{ memberDetail.nickname || '未设置昵称' }}</strong></div><p class="mono">{{ memberDetail.id }}</p><p>注册时间：{{ displayDate(memberDetail.createdAt) }}</p><p>生日：{{ memberBirthday(memberDetail) }}</p><p>收货地址：{{ isSuperAdmin ? memberAddressLabel(memberDetail.address) : '仅超级管理员可见' }}</p><p>手机号：{{ memberDetail.phoneNumber || memberDetail.phoneMasked || '未绑定' }}</p><p>微信 OpenID：{{ memberDetail.openId }}</p><p>微信 UnionID：{{ memberDetail.maskedUnionId || '未提供' }}</p><p>观察记录：{{ memberDetail.observationCount }} 条（详情内容不在此页读取）</p><h4>账户隐私申请</h4><p v-if="!memberDetail.privacyRequests?.length" class="muted">暂无隐私申请。</p><p v-for="item in memberDetail.privacyRequests" :key="item.id">{{ item.status }} · {{ displayDate(item.requestedAt) }} · 计划 {{ displayDate(item.scheduledFor) }}</p><p v-if="!isSuperAdmin" class="muted">客服仅查看申请状态；处理与删除操作由超级管理员执行。</p>
          </div>
        </section></div>
</Teleport>
      </section>
      <section v-if="activeSection === 'life-card-views'" id="life-card-views" class="content-area">
  <div class="section-heading"><div><p class="eyebrow">LIFE CARD VIEWS</p><h2>生命牌查看</h2></div></div>
  <p v-if="lifeCardViewsError" class="error" role="alert">{{ lifeCardViewsError }}</p>
  <div class="life-card-view-filters">
    <label>开始日期<DatePickerField v-model="lifeCardViewFilter.from" aria-label="开始日期" clearable /></label>
    <label>结束日期<DatePickerField v-model="lifeCardViewFilter.to" aria-label="结束日期" clearable /></label>
    <label>用户<input v-model="lifeCardViewFilter.user" maxlength="64" placeholder="昵称或用户 ID" @keyup.enter="loadLifeCardViews()" /></label>
    <label>花色<select v-model="lifeCardViewFilter.suit"><option value="">全部</option><option v-for="suit in lifeCardSuits" :key="suit.key" :value="suit.key">{{ suit.label }}</option></select></label>
    <label>牌面<select v-model="lifeCardViewFilter.rank"><option value="">全部</option><option v-for="rank in lifeCardRanks" :key="rank" :value="rank">{{ rank }}</option></select></label>
    <div class="life-card-view-filter-actions"><button :disabled="lifeCardViewsLoading" @click="loadLifeCardViews()">{{ lifeCardViewsLoading ? '查询中…' : '查询' }}</button><button class="quiet" :disabled="lifeCardViewsLoading" @click="resetLifeCardViewFilter">重置</button></div>
  </div>
  <div class="observation-table life-card-view-table">
    <div class="observation-head life-card-view-head"><span>用户</span><span>生日</span><span>牌面</span><span>查看时间</span></div>
    <div v-for="view in lifeCardViews" :key="view.id" class="observation-row life-card-view-row">
      <span>{{ view.nickname || '未设置昵称' }}</span>
      <span>{{ view.month }} 月 {{ view.day }} 日</span>
      <span>{{ view.rank }}{{ lifeCardSuitSymbol(view.suit) }}</span>
      <span>{{ displayDate(view.viewedAt) }}</span>
    </div>
    <p v-if="!lifeCardViews.length && !lifeCardViewsLoading" class="muted life-card-view-empty">还没有查看记录。</p>
    <div v-if="lifeCardViewsMore" class="table-actions"><button class="quiet" :disabled="lifeCardViewsLoading" @click="loadLifeCardViews(true)">{{ lifeCardViewsLoading ? '读取中…' : '加载更多' }}</button></div>
  </div>
</section>
<section v-if="activeSection === 'life-cards'" id="life-card-copy" class="content-area">
  <div class="life-card-toolbar">
    <div class="mine-editor-tabs life-card-months" role="tablist" aria-label="选择月份">
      <button v-for="month in 12" :key="month" type="button" role="tab" class="mine-editor-tab" :class="{ active: lifeCardMonth === month }" :aria-selected="lifeCardMonth === month" @click="selectLifeCardMonth(month)">{{ month }} 月</button>
    </div>
    <div class="life-card-io">
      <button class="quiet" :disabled="lifeCardsLoading" @click="exportLifeCards">导出 CSV</button>
      <label class="life-card-import" :class="{ disabled: lifeCardImporting }">
        <input type="file" accept=".csv,text/csv" :disabled="lifeCardImporting" @change="importLifeCards" />
        <span>{{ lifeCardImporting ? '导入中…' : '导入 CSV' }}</span>
      </label>
    </div>
  </div>
  <p v-if="lifeCardsLoading" class="muted">正在读取文案…</p>
  <p v-if="lifeCardsError" class="error" role="alert">{{ lifeCardsError }}</p>
  <p v-if="lifeCardsMessage" class="status-message" role="status">{{ lifeCardsMessage }}</p>
  <div class="life-card-layout">
    <div class="life-card-list" role="list">
      <button v-for="card in lifeCardMonthDays" :key="card.day" type="button" class="life-card-list-item" :class="{ active: lifeCardDraft && lifeCardDraft.month === card.month && lifeCardDraft.day === card.day }" @click="editLifeCard(card)">
        <span class="life-card-day">{{ card.day }} 日</span>
        <span class="life-card-face">{{ card.rank }}{{ card.suit === 'spade' ? '♠' : card.suit === 'heart' ? '♥' : card.suit === 'club' ? '♣' : '♦' }}</span>
        <span class="life-card-title">{{ card.title }}</span>
      </button>
    </div>
    <div v-if="lifeCardDraft" class="settings-form life-card-form">
      <div class="life-card-form-head"><strong>{{ lifeCardDraft.month }} 月 {{ lifeCardDraft.day }} 日</strong><small>标题、说明与观察提示会直接显示在小程序「底色」步骤。</small></div>
      <div class="life-card-face-row">
        <label>花色<select v-model="lifeCardDraft.suit"><option v-for="suit in lifeCardSuits" :key="suit.key" :value="suit.key">{{ suit.label }}</option></select></label>
        <label>牌面<select v-model="lifeCardDraft.rank"><option v-for="rank in lifeCardRanks" :key="rank" :value="rank">{{ rank }}</option></select></label>
        <label>主题标签<input v-model="lifeCardDraft.theme" maxlength="40" /></label>
      </div>
      <label>标题<input v-model="lifeCardDraft.title" maxlength="60" /></label>
      <label>说明<textarea v-model="lifeCardDraft.summary" rows="3" maxlength="600"></textarea></label>
      <label>观察提示<textarea v-model="lifeCardDraft.prompt" rows="2" maxlength="300"></textarea></label>
      <label>传统线索 · 注<textarea v-model="lifeCardDraft.note" rows="3" maxlength="400"></textarea></label>
      <label>释义来源与使用说明<textarea v-model="lifeCardDraft.sourceNote" rows="6" maxlength="2000" placeholder="按段落书写，空行分段；小程序按段落展示。"></textarea></label>
      <div class="topbar-actions"><button :disabled="lifeCardsSaving" @click="saveLifeCard">{{ lifeCardsSaving ? '保存中…' : '保存这一天' }}</button></div>
    </div>
    <p v-else class="muted">选择左侧某一天开始编辑。</p>
  </div>
</section>
<section v-if="activeSection === 'settings'" id="system-settings" class="content-area">
  <div class="section-heading"><div><p class="eyebrow">SYSTEM / SUPPORT</p><h2>系统设置</h2><p class="section-description">维护全站公告、联系支持渠道、申诉联系方式，以及首页与「日常之物」的品牌图弹窗。</p></div></div>
  <p v-if="settingsError" class="error" role="alert">{{ settingsError }}</p>
  <p v-if="settingsMessage" class="status-message" role="status">{{ settingsMessage }}</p>
  <div class="settings-form settings-form--single">
    <label>维护公告<textarea v-model="systemSettings.maintenance_notice" rows="3" maxlength="500" :disabled="settingsLoading || !isSuperAdmin" placeholder="可留空" /></label>
    <label>联系支持<textarea v-model="systemSettings.support_contact" rows="2" maxlength="200" :disabled="settingsLoading || !isSuperAdmin" placeholder="可填写客服渠道或邮箱" /></label>
    <label>一起谈谈申诉联系方式<textarea v-model="systemSettings.discussion_appeal_contact" rows="2" maxlength="200" :disabled="settingsLoading || !isSuperAdmin" placeholder="可填写申诉邮箱、微信号或其他渠道；留空时自动使用联系支持渠道" /></label>

    <section class="brand-popup-settings" aria-labelledby="brand-popup-settings-title">
      <div class="brand-popup-settings-heading">
        <div>
          <p class="eyebrow">LAUNCH EXPERIENCE</p>
          <h3 id="brand-popup-settings-title">品牌图弹窗</h3>
          <p>打开小程序默认首页或进入「日常之物」时，以全屏品牌图呈现。图片会居中裁切并铺满整个屏幕。</p>
        </div>
      </div>

      <label class="brand-popup-master-row">
        <span>
          <strong>开启品牌图弹窗</strong>
          <small>{{ systemSettings.brand_popup_image ? '开启后按下方频次展示' : '请先上传品牌图片' }}</small>
        </span>
        <span class="settings-switch-control">
          <span>{{ systemSettings.brand_popup_enabled ? '已开启' : '已关闭' }}</span>
          <input v-model="systemSettings.brand_popup_enabled" type="checkbox" aria-label="开启品牌图弹窗" :disabled="settingsLoading || !isSuperAdmin || !systemSettings.brand_popup_image || brandPopupUploading" />
        </span>
      </label>

      <div class="brand-popup-settings-grid">
        <div class="brand-popup-media">
          <div class="brand-popup-preview-frame">
            <img v-if="brandPopupPreviewUrl" :src="brandPopupPreviewUrl" alt="启动品牌图预览" />
            <div v-else class="brand-popup-preview-empty"><span>尚未上传品牌图</span><small>建议使用 9:16 竖版图片，重要文字请放在画面中央</small></div>
          </div>
          <input ref="brandPopupFileInput" class="brand-popup-file-input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading" @change="selectBrandPopupImage" />
          <div class="brand-popup-media-actions">
            <button type="button" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading" @click="chooseBrandPopupImage">{{ brandPopupUploading ? '上传中…' : brandPopupPreviewUrl ? '更换图片' : '上传品牌图' }}</button>
            <button v-if="systemSettings.brand_popup_image" type="button" class="quiet" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading" @click="removeBrandPopupImage">移除</button>
          </div>
          <small>支持 JPG、PNG、WebP；图片会铺满屏幕，超出屏幕比例的部分会居中裁切。图片仅在保存后生效。</small>
        </div>

        <div class="brand-popup-fields">
          <label>展示时长
            <span class="brand-popup-number-field"><input v-model.number="systemSettings.brand_popup_duration" type="number" min="1" max="15" step="1" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading" /><span>秒</span></span>
            <small>可设置 1–15 秒，到时自动关闭。</small>
          </label>
          <label>展示频次
            <select v-model="systemSettings.brand_popup_frequency" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading">
              <option value="every_launch">每次启动</option>
              <option value="daily">每天一次</option>
              <option value="once">仅展示一次</option>
            </select>
            <small>首页与「日常之物」分别独立计算展示频次。</small>
          </label>
          <label class="brand-popup-alt-field">图片说明
            <input v-model="systemSettings.brand_popup_alt" maxlength="120" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading" placeholder="用于无障碍朗读，可留空" />
            <small>{{ systemSettings.brand_popup_alt.length }}/120 字</small>
          </label>
          <label class="setting-toggle brand-popup-closable-toggle">
            <span><strong>允许手动关闭</strong><small>关闭后，品牌图仅会在倒计时结束时消失。</small></span>
            <input v-model="systemSettings.brand_popup_closable" type="checkbox" :disabled="settingsLoading || !isSuperAdmin || brandPopupUploading" />
          </label>
        </div>
      </div>
      <p class="brand-popup-settings-note">品牌图会在打开默认首页或进入「日常之物」时展示；两处分别计算频次。关闭开关或未上传图片时不会弹出。</p>
    </section>

    <div v-if="isSuperAdmin" class="topbar-actions">
      <button :disabled="settingsSaving || settingsLoading || brandPopupUploading || JSON.stringify(systemSettings) === JSON.stringify(systemSettingsOriginal)" @click="saveSystemSettings">{{ settingsSaving ? '保存中…' : '保存系统设置' }}</button>
      <button type="button" class="quiet" :disabled="settingsSaving || brandPopupUploading" @click="resetSystemSettings">撤销修改</button>
    </div>
    <p v-else class="muted">当前账号仅可查看设置。</p>
  </div>
</section>

<section v-if="activeSection === 'store-settings'" id="store-settings-page" class="content-area">
  <div class="section-heading"><div><p class="eyebrow">COMMERCE / STORE ACCESS</p><h2>商城开放</h2><p class="section-description">独立控制商城是否对外营业；该开关不会改变「实践目录 → 日常之物」的入口状态。</p></div></div>
  <p v-if="settingsError" class="error" role="alert">{{ settingsError }}</p>
  <p v-if="settingsMessage" class="status-message" role="status">{{ settingsMessage }}</p>
  <div class="settings-form settings-form--single">
    <section class="settings-switch-card" aria-labelledby="store-settings-title">
      <div class="settings-switch-card-copy">
        <h3 id="store-settings-title">商城开放</h3>
        <p>商城总闸。此开关只控制商城是否开放；「实践目录 → 日常之物」入口关闭时，同样会展示未开放页面。</p>
      </div>
      <label class="settings-switch-control">
        <span>{{ systemSettings.store_enabled ? '已开启' : '已关闭' }}</span>
        <input v-model="systemSettings.store_enabled" type="checkbox" aria-label="商城开放" :disabled="settingsLoading || !isSuperAdmin" />
      </label>
    </section>
    <section class="store-access-rule" aria-labelledby="store-access-rule-title">
      <div>
        <p class="eyebrow">ACCESS RULE</p>
        <h3 id="store-access-rule-title">两处同时开启，用户才能看到商品</h3>
        <p>「系统管理 → 商城开放」控制商城总闸；「实践目录 → 日常之物」控制目录入口。任意一处关闭，小程序都会展示未开放页面。</p>
      </div>
      <button type="button" class="quiet" @click="openDailyObjectsEntrySettings">前往实践目录</button>
    </section>
    <div v-if="isSuperAdmin" class="topbar-actions">
      <button :disabled="settingsSaving || settingsLoading || JSON.stringify(systemSettings) === JSON.stringify(systemSettingsOriginal)" @click="saveSystemSettings">{{ settingsSaving ? '保存中…' : '保存商城设置' }}</button>
      <button type="button" class="quiet" :disabled="settingsSaving" @click="resetSystemSettings">撤销修改</button>
    </div>
    <p v-else class="muted">当前账号仅可查看设置。</p>
  </div>
</section>

      <ModuleStateMachine
        v-if="activeSection === 'status-machine'"
        ref="moduleStateMachine"
        :active="activeSection === 'status-machine'"
        :api-base="apiBase"
        :token="token"
        :can-transition="isSuperAdmin"
        :request="apiFetch"
        :response-message="responseMessage"
        @unauthorized="logout('后台登录已过期，请重新登录。')"
      />
      <section v-if="activeSection === 'employees' && isSuperAdmin" id="employee-access" class="content-area employee-page">
        <div class="employee-hero">
          <div>
            <p class="eyebrow">STAFF &amp; PERMISSIONS</p>
            <p class="employee-hero-copy">管理工作台账号、角色范围和企业微信扫码登录绑定。</p>
          </div>
          <button type="button" @click="openCreateEmployee">创建员工账号</button>
        </div>

        <p v-if="employeeError" class="error" role="alert">{{ employeeError }}</p>
        <p v-if="employeeMessage" class="status-message" role="status">{{ employeeMessage }}</p>

        <div class="employee-stats" aria-label="员工账号概览">
          <article class="employee-stat"><span>员工总数</span><strong>{{ employeeStats.total }}</strong><small>工作台账号</small></article>
          <article class="employee-stat"><span>已启用</span><strong>{{ employeeStats.active }}</strong><small>可正常登录</small></article>
          <article class="employee-stat"><span>已绑定企微</span><strong>{{ employeeStats.wecomBound }}</strong><small>支持扫码登录</small></article>
          <article class="employee-stat"><span>已停用</span><strong>{{ employeeStats.disabled }}</strong><small>登录立即失效</small></article>
        </div>

        <div class="employee-role-guide" aria-label="角色权限说明">
          <article v-for="guide in employeeRoleGuides" :key="guide.role" class="employee-role-card">
            <div class="employee-role-card-head">
              <span class="role-badge" :class="`role-${guide.role}`">{{ guide.label }}</span>
              <small>{{ guide.scope }}</small>
            </div>
            <p>{{ guide.detail }}</p>
          </article>
        </div>

        <div class="employee-toolbar">
          <label class="employee-search-field">
            <span>搜索员工</span>
            <input v-model="employeeSearch" type="search" placeholder="姓名 / 账号 / 企微 UserID" />
          </label>
          <label>
            <span>状态</span>
            <select v-model="employeeStatusFilter">
              <option value="all">全部状态</option>
              <option value="active">已启用</option>
              <option value="disabled">已停用</option>
            </select>
          </label>
          <label>
            <span>角色</span>
            <select v-model="employeeRoleFilter">
              <option value="all">全部角色</option>
              <option value="super_admin">超级管理员</option>
              <option value="content_editor">内容编辑</option>
              <option value="support_readonly">客服只读</option>
            </select>
          </label>
          <button v-if="employeeFiltersActive" type="button" class="quiet employee-clear-filters" @click="clearEmployeeFilters">清除筛选</button>
        </div>

        <p v-if="builtInAdminHint" class="employee-env-hint">{{ builtInAdminHint }}</p>

        <div class="employee-table" :aria-busy="employeeLoading">
          <div class="employee-row employee-table-head"><span>员工</span><span>角色</span><span>状态</span><span>操作</span></div>
          <div v-for="employee in filteredEmployees" :key="employee.id" class="employee-row">
            <div class="employee-person">
              <span class="employee-avatar" aria-hidden="true">
                <img v-if="employee.avatarUrl" :src="employee.avatarUrl" alt="" />
                <span v-else>M</span>
              </span>
              <span class="employee-person-copy"><strong>{{ employee.displayName }}</strong><small class="mono">{{ employee.username }}</small></span>
            </div>
            <div class="employee-role-cell">
              <span class="role-badge" :class="`role-${employee.role}`">{{ adminRoleLabels[employee.role] }}</span>
              <small class="employee-module-summary">{{ employeeModuleSummary(employee) }}</small>
            </div>
            <div class="employee-status-cell">
              <span class="employee-state-pill" :class="employee.status">{{ employee.status === 'active' ? '启用' : '已停用' }}</span>
            </div>
            <div class="employee-actions">
              <button type="button" class="quiet" @click="openModuleGrant(employee)">授权模块</button>
              <button type="button" class="quiet" @click="openEmployeeEditor(employee)">编辑</button>
            </div>
          </div>
          <p v-if="employeeLoading" class="employee-empty">正在读取员工账号…</p>
          <p v-else-if="!employees.length" class="employee-empty">暂无员工账号，点击右上角「创建员工账号」开始添加。</p>
          <p v-else-if="!filteredEmployees.length" class="employee-empty">没有符合当前筛选条件的员工。<button type="button" class="employee-inline-link" @click="clearEmployeeFilters">清除筛选</button></p>
        </div>

        <p class="employee-footnote">头像、角色、账号状态、企业微信绑定、最近登录和密码状态统一在「编辑」中维护；可进入的后台模块用「授权模块」单独调整。超级管理员账号受保护，不能停用、降级或重置密码。</p>

        <Teleport to="body">
          <div v-if="createEmployeeOpen" class="observation-modal-backdrop" @click.self="createEmployeeOpen = false">
            <section class="observation-detail-panel employee-dialog" role="dialog" aria-modal="true" aria-labelledby="create-employee-title" @keydown.esc="createEmployeeOpen = false">
              <div class="section-heading">
                <div><p class="eyebrow">NEW STAFF ACCOUNT</p><h3 id="create-employee-title">创建员工账号</h3></div>
                <button type="button" class="quiet" aria-label="关闭创建员工账号" @click="createEmployeeOpen = false">关闭</button>
              </div>
              <form class="employee-form employee-form-grid" @submit.prevent="createEmployee">
                <label>登录账号<input v-model="employeeForm.username" required minlength="3" maxlength="64" autocomplete="off" placeholder="3-64 位字母、数字、_ . -" /></label>
                <label>员工姓名<input v-model="employeeForm.displayName" required maxlength="80" /></label>
                <label>初始密码（至少 12 位）<input v-model="employeeForm.password" type="password" required minlength="12" maxlength="256" autocomplete="new-password" /></label>
                <label>角色<select v-model="employeeForm.role"><option value="content_editor">内容编辑 · 内容与审核</option><option value="support_readonly">客服只读 · 仅查看会员</option><option value="super_admin">超级管理员 · 全部权限</option></select></label>
                <label class="employee-form-full">企业微信 UserID（选填）<input v-model="employeeForm.wecomUserId" maxlength="128" autocomplete="off" placeholder="绑定后员工可直接扫码登录" /></label>
                <p class="employee-form-hint employee-form-full">企微 UserID 可在员工首次扫码的未绑定提示中查看；留空表示暂不绑定。</p>
                <p class="employee-form-hint employee-form-full">新账号先按所选角色获得默认模块授权（内容编辑 5 个、客服只读 2 个），创建后可在列表的「授权模块」中单独增减；超级管理员固定拥有全部模块，不参与单独授权。</p>
                <p v-if="employeeFormError" class="error employee-form-full" role="alert">{{ employeeFormError }}</p>
                <div class="employee-dialog-actions employee-form-full">
                  <button type="submit" :disabled="employeeSaving">{{ employeeSaving ? '创建中…' : '确认创建' }}</button>
                  <button type="button" class="quiet" :disabled="employeeSaving" @click="createEmployeeOpen = false">取消</button>
                </div>
              </form>
            </section>
          </div>
        </Teleport>

        <Teleport to="body">
          <div v-if="employeeEditorOpen" class="observation-modal-backdrop" @click.self="closeEmployeeEditor">
            <section class="observation-detail-panel employee-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-employee-title" @keydown.esc="closeEmployeeEditor">
              <div class="section-heading">
                <div><p class="eyebrow">EDIT STAFF PROFILE</p><h3 id="edit-employee-title">编辑员工资料</h3></div>
                <button type="button" class="quiet" aria-label="关闭编辑员工资料" @click="closeEmployeeEditor">关闭</button>
              </div>
              <form class="employee-form employee-form-grid" @submit.prevent="saveEmployeeEdit">
                <div class="employee-avatar-editor employee-form-full">
                  <span class="employee-avatar employee-avatar-large" aria-hidden="true">
                    <img v-if="employeeAvatarPreview" :src="employeeAvatarPreview" alt="" />
                    <span v-else>M</span>
                  </span>
                  <div class="employee-avatar-editor-copy">
                    <strong>员工头像</strong>
                    <p>未设置头像时显示默认 M。支持 JPEG、PNG、WebP，最大 2 MB，保存资料时生效。</p>
                    <div class="employee-avatar-editor-actions">
                      <label class="quiet employee-file-button">
                        {{ employeeAvatarPreview ? '更换头像' : '选择头像' }}
                        <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="employeeEditSaving" @change="selectEmployeeAvatar" />
                      </label>
                      <button v-if="employeeAvatarPreview" type="button" class="quiet" :disabled="employeeEditSaving" @click="resetEmployeeAvatar">恢复默认</button>
                    </div>
                    <p v-if="employeeAvatarError" class="error" role="alert">{{ employeeAvatarError }}</p>
                  </div>
                </div>
                <label>员工姓名<input v-model="employeeEditForm.displayName" required maxlength="80" /></label>
                <label>登录账号<input :value="editingEmployee?.username || ''" disabled /></label>
                <label>角色
                  <select v-model="employeeEditForm.role" @change="onEmployeeRoleChange">
                    <option value="super_admin">超级管理员 · 全部权限</option>
                    <option value="content_editor">内容编辑 · 内容与审核</option>
                    <option value="support_readonly">客服只读 · 仅查看会员</option>
                  </select>
                </label>
                <label>账号状态
                  <select v-model="employeeEditForm.status">
                    <option value="active">启用</option>
                    <option value="disabled">已停用</option>
                  </select>
                </label>
                <label class="employee-form-full">企业微信 UserID<input v-model="employeeEditForm.wecomUserId" maxlength="128" autocomplete="off" placeholder="留空可解除绑定" /></label>
                <fieldset class="employee-module-fieldset employee-form-full">
                  <legend>模块授权</legend>
                  <p class="employee-form-hint">勾选该员工可以进入的后台模块。新建时先按角色给出默认授权（超级管理员为全部模块），之后每个角色都可以单独增减；发布、删除媒体、停用会员与员工管理仍只允许超级管理员。也可以直接用列表里的「授权模块」修改。</p>
                  <div class="employee-module-grid">
                    <label v-for="module in adminModules" :key="module.id" class="employee-module-option" :class="{ checked: isEmployeeModuleChecked(module.id) }">
                      <input
                        type="checkbox"
                        :checked="isEmployeeModuleChecked(module.id)"
                        :disabled="employeeEditSaving"
                        @change="toggleEmployeeModule(module.id, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="employee-module-label">{{ module.label }}</span>
                      <small>{{ module.description }}</small>
                    </label>
                  </div>
                  <div class="employee-module-actions">
                    <span class="employee-module-count">已授权 {{ employeeModuleCount }} 个模块{{ employeeEditForm.modulePermissions ? '（自定义）' : '（角色默认）' }}</span>
                    <button type="button" class="quiet" :disabled="employeeEditSaving || employeeEditForm.modulePermissions === null" @click="restoreEmployeeRoleModules">恢复角色默认</button>
                  </div>
                </fieldset>
                <p class="employee-form-hint employee-form-full">绑定后该员工可直接使用企业微信扫码登录；留空并保存会解除当前绑定。</p>
                <div class="employee-edit-meta employee-form-full">
                  <span>最近登录：{{ editingEmployee?.lastLoginAt ? displayDate(editingEmployee.lastLoginAt) : '尚未登录' }}</span>
                  <span>密码状态：{{ editingEmployee?.passwordChangeRequired ? '待首次修改密码' : '正常' }}</span>
                </div>
                <p v-if="employeeEditError" class="error employee-form-full" role="alert">{{ employeeEditError }}</p>
                <div class="employee-dialog-actions employee-form-full">
                  <button v-if="editingEmployee" type="button" class="quiet employee-reset-password" :disabled="employeeEditSaving" @click="resetEditingEmployeePassword">重置密码</button>
                  <button type="submit" :disabled="employeeEditSaving">{{ employeeEditSaving ? '保存中…' : '保存资料' }}</button>
                  <button type="button" class="quiet" :disabled="employeeEditSaving" @click="closeEmployeeEditor">取消</button>
                </div>
              </form>
            </section>
          </div>
        </Teleport>

        <Teleport to="body">
          <div v-if="moduleGrantOpen" class="observation-modal-backdrop" @click.self="closeModuleGrant">
            <section class="observation-detail-panel employee-dialog employee-grant-dialog" role="dialog" aria-modal="true" aria-labelledby="employee-grant-title" @keydown.esc="closeModuleGrant">
              <div class="section-heading">
                <div><p class="eyebrow">MODULE ACCESS</p><h3 id="employee-grant-title">授权模块 · {{ moduleGrantEmployee?.displayName }}</h3></div>
                <button type="button" class="quiet" aria-label="关闭模块授权" @click="closeModuleGrant">关闭</button>
              </div>
              <div class="employee-form employee-form-grid">
                <p class="employee-form-hint employee-form-full">
                  {{ moduleGrantEmployee ? adminRoleLabels[moduleGrantEmployee.role] : '' }} · 角色默认 {{ moduleGrantRoleDefaults.length }} 个模块；保存后立即生效，员工无需重新登录。
                </p>
                <fieldset class="employee-module-fieldset employee-form-full">
                  <legend>可访问模块</legend>
                  <p class="employee-form-hint">勾选该员工可以进入的后台模块；全部取消表示不能进入任何后台模块。发布、删除媒体、停用会员与员工管理始终只允许超级管理员。</p>
                  <div class="employee-module-grid">
                    <label v-for="module in adminModules" :key="module.id" class="employee-module-option" :class="{ checked: isModuleGrantChecked(module.id) }">
                      <input
                        type="checkbox"
                        :checked="isModuleGrantChecked(module.id)"
                        :disabled="moduleGrantSaving"
                        @change="toggleModuleGrant(module.id, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="employee-module-label">{{ module.label }}</span>
                      <small>{{ module.description }}</small>
                    </label>
                  </div>
                  <div class="employee-module-actions">
                    <span class="employee-module-count">已授权 {{ moduleGrantCount }} 个模块{{ moduleGrantOverride ? '（自定义）' : '（角色默认）' }}</span>
                    <button type="button" class="quiet" :disabled="moduleGrantSaving || moduleGrantOverride === null" @click="restoreModuleGrantDefaults">恢复角色默认</button>
                  </div>
                </fieldset>
                <p v-if="moduleGrantError" class="error employee-form-full" role="alert">{{ moduleGrantError }}</p>
                <div class="employee-dialog-actions employee-form-full">
                  <button type="button" :disabled="moduleGrantSaving" @click="saveModuleGrant">{{ moduleGrantSaving ? '保存中…' : '保存授权' }}</button>
                  <button type="button" class="quiet" :disabled="moduleGrantSaving" @click="closeModuleGrant">取消</button>
                </div>
              </div>
            </section>
          </div>
        </Teleport>
      </section>
        </div>
      </div>
    </template>
    </main>
    <Teleport to="body">
      <ImageCropDialog
        v-if="pendingImageCrop"
        :key="pendingImageCrop.id"
        :file="pendingImageCrop.file"
        :title="pendingImageCrop.title"
        @cancel="cancelImageCrop"
        @confirm="confirmImageCrop"
      />
    </Teleport>
    <Teleport to="body">
      <div v-if="issueValidationDialogOpen && issueValidationMessage" class="admin-error-backdrop issue-validation-backdrop" @click.self="closeIssueValidationDialog">
        <section class="admin-error-dialog issue-validation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="issue-validation-title" aria-describedby="issue-validation-copy" @keydown.esc.stop.prevent="closeIssueValidationDialog">
          <p class="eyebrow">必填信息</p>
          <h3 id="issue-validation-title">请完善必填信息</h3>
          <p id="issue-validation-copy" class="admin-error-copy">{{ issueValidationMessage }}</p>
          <div class="admin-error-actions">
            <button type="button" @click="closeIssueValidationDialog">知道了</button>
          </div>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="pendingIssueAction" class="admin-error-backdrop issue-lifecycle-backdrop" @click.self="closeIssueLifecycleAction">
        <section class="admin-error-dialog issue-lifecycle-dialog" role="alertdialog" aria-modal="true" aria-labelledby="issue-lifecycle-title" aria-describedby="issue-lifecycle-copy" @keydown.esc.stop.prevent="closeIssueLifecycleAction">
          <p class="eyebrow">JOURNAL LIFECYCLE</p>
          <h3 id="issue-lifecycle-title">{{ pendingIssueAction.action === 'archive' ? '归档这一期？' : pendingIssueAction.action === 'restore' ? '恢复为草稿？' : '永久删除这一期？' }}</h3>
          <p id="issue-lifecycle-copy" class="admin-error-copy">{{ pendingIssueAction.issue.code }} · {{ pendingIssueAction.issue.label }} · {{ journalIssueStatusLabel(pendingIssueAction.issue.status) }}</p>
          <div class="issue-lifecycle-summary"><span>线下草稿 v{{ pendingIssueAction.issue.editVersion }}</span><span>已发布 v{{ pendingIssueAction.issue.publishedVersion }}</span></div>
          <p v-if="pendingIssueAction.action === 'archive'" class="issue-lifecycle-note">归档后，这一期会从当前线上期刊中下线；首页、档案入口及相关公开内容会同步刷新。</p>
          <p v-else-if="pendingIssueAction.action === 'restore'" class="issue-lifecycle-note">恢复后，这一期会回到草稿列表，便于继续编辑；不会自动重新上线，需要再次确认发布。</p>
          <p v-else class="issue-lifecycle-note is-danger">删除会同时移除这一期的发布快照，无法恢复。线上首页及往期档案会立即同步。</p>
          <p v-if="editingIssueId === pendingIssueAction.issue.id && issueDraftDirty" class="issue-lifecycle-warning">当前有未保存修改。{{ pendingIssueAction.action === 'delete' ? '删除后这些内容会一并丢弃。' : '状态变更后会保留当前编辑内容，仍需单独保存草稿。' }}</p>
          <p v-if="issueActionError" class="error issue-lifecycle-error" role="alert">{{ issueActionError }}</p>
          <div class="admin-error-actions">
            <button type="button" class="quiet" :disabled="issueActionBusy" @click="closeIssueLifecycleAction">取消</button>
            <button type="button" :class="{ danger: pendingIssueAction.action === 'delete' }" :disabled="issueActionBusy" @click="confirmIssueLifecycleAction">{{ issueActionBusy ? '处理中…' : issueLifecycleActionLabel(pendingIssueAction.action) }}</button>
          </div>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="adminErrorDialog" class="admin-error-backdrop" @click.self="closeAdminError">
        <section class="admin-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-error-title" @keydown.esc="closeAdminError">
          <p class="eyebrow">操作提示</p>
          <h3 id="admin-error-title">操作未完成</h3>
          <p class="admin-error-copy">{{ adminErrorDialog }}</p>
          <div class="admin-error-actions">
            <button ref="adminErrorButton" type="button" @click="closeAdminError">知道了</button>
          </div>
        </section>
      </div>
    </Teleport>
    <footer v-if="!loggedIn" class="filing-footer" aria-label="网站备案信息">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">蜀ICP备2026044906号-1</a>
    </footer>
  </div>
</template>
