<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LegalDocumentManager from './components/LegalDocumentManager.vue';
import RichTextEditor from './components/RichTextEditor.vue';
import PracticeLineEditor from './components/PracticeLineEditor.vue';
import { createDefaultDiscussionContent } from './discussion-content';
import { isAdminLoginResult, isAuditPage, isIssueDashboardConsistent, isManagedIssueList, isManagedMediaKey, isManagedObservationDetail, isManagedObservationPage, isMediaAudioPage, isMediaDeleteResult, isMediaOrphanPage, isMediaUploadTarget, isMediaViewTarget, isMigrationStatus, isObservationLifecycle, isPrivacyProcessResult, isPrivacyRequestPage, isPublicHome, isReencryptResult, isRetryResult } from './api-shapes';
import type { AuditEntry, IssueLifecycle, ManagedAudioTrack, ManagedIssue, ManagedIssueModule, ManagedObservation, ManagedObservationDetail, MediaOrphan, MigrationStatus, ObservationLifecycle, PrivacyLifecycle, PrivacyRequest, PublicHome } from './api-shapes';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://192.168.1.32:61021/api';
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
type HealthResult = { status: string; timestamp: string; dependencies?: { database?: string; objectStorage?: string; redis?: string } };
const health = ref<HealthResult | null>(null);
const migrationStatus = ref<MigrationStatus | null>(null);
const home = ref<PublicHome | null>(null);
const issues = ref<ManagedIssue[]>([]);
const issueLifecycle = ref<IssueLifecycle | null>(null);
type PracticeEntry = {
  key: string;
  title: string;
  description: string;
  enabled: boolean;
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
type SharedPracticeCopyKey = 'topbarTitle' | 'metaLeft' | 'metaRight' | 'heroTitle' | 'heroIntro' | 'onlineNumber' | 'onlineContext' | 'onlineIssueLabel' | 'onlineIssueTheme' | 'onlineQuestion' | 'onlineCopy' | 'onlineAction' | 'offlineNumber' | 'offlineContext' | 'offlineTitle' | 'offlineCopy' | 'noticeLabel' | 'noticeCode' | 'rule1Number' | 'rule1Title' | 'rule1Copy' | 'rule2Number' | 'rule2Title' | 'rule2Copy' | 'rule3Number' | 'rule3Title' | 'rule3Copy' | 'rule4Number' | 'rule4Title' | 'rule4Copy' | 'nextAction';
type PracticeContent = { editVersion: number; draft?: boolean; title: string; titleRichText: string; titleFontSize: number; titleColor: string; intro: string; introRichText: string; introFontSize: number; introColor: string; metaLeftRichText: string; metaLeftFontSize: number; metaLeftColor: string; metaRightRichText: string; metaRightFontSize: number; metaRightColor: string; observationCopy: Record<ObservationCopyKey, ObservationCopyItem>; sharedPracticeCopy: Record<SharedPracticeCopyKey, ObservationCopyItem>; entries: PracticeEntry[] };
const practiceContent = ref<PracticeContent | null>(null);
type PrivacyCopyItem = { richText: string; fontSize: number; color: string };
type AboutPageContent = { editVersion: number; brandIntro: string; contentSources: string; contactInfo: string };
type PublishedRevision = { version: number; publishedAt: string; publishedBy: string | null; content: Record<string, unknown> | null };
const privacyDocumentManager = ref<InstanceType<typeof LegalDocumentManager> | null>(null);
const agreementDocumentManager = ref<InstanceType<typeof LegalDocumentManager> | null>(null);
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
type DailyObjectsContent = { editVersion: number; draft?: boolean; brandName: string; brandSubtitle: string; bagLabel: string; bagCount: string; eyebrow: string; title: string; intro: string; previewNote: string; supportLabel: string; products: DailyObjectsProduct[] };
const dailyObjectsContent = ref<DailyObjectsContent | null>(null);
const dailyObjectsDirty = ref(false);
const dailyObjectsSaving = ref(false);
const dailyObjectsConflict = ref(false);
const dailyObjectsMessage = ref('');
const dailyObjectsError = ref('');
const dailyObjectUploadingId = ref('');
const dailyObjectPreviewUrls = ref<Record<string, string>>({});
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
const expandedPracticeEntries = ref<Record<string, boolean>>({});
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
function createDefaultIssueModules(): ManagedIssueModule[] {
  return [
    { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: '本期策展', month: '' },
    { id: 'cover-story', type: 'coverStory', order: 1, enabled: true, imageObjectKey: '', altText: '', captionLeft: '人物纪实·时雨', captionRight: '本期封面', eyebrow: '本期主题', title: '', titleFontSize: 72, titleColor: '#59483d', body: '', bodyFontSize: 30, bodyColor: '#40362f', byline: '策展与编辑 · MYRIAD SHE' },
    { id: 'quote', type: 'quote', order: 2, enabled: true, text: '我后来才知道，放下不等于认输。', attribution: '' },
    { id: 'story', type: 'story', order: 3, enabled: true, eyebrow: '人物纪实·时雨', title: '', body: '', imageObjectKey: '', altText: '', captionLeft: '纪实剪辑·时雨', captionRight: '恢复并不是回到从前，而是慢慢学会全新的方式生活。' },
    { id: 'story-action', type: 'storyAction', order: 4, enabled: true, title: '进入本期人物', body: '', targetId: 'story' },
    { id: 'image', type: 'image', order: 5, enabled: false, imageObjectKey: '', altText: '', caption: '' },
    { id: 'audio', type: 'audio', order: 6, enabled: false, title: '', duration: '', audioObjectKey: '', quote: '', subtitle: '', transcript: '', tracks: [createIssueAudioTrack(1)] },
    { id: 'question', type: 'question', order: 7, enabled: true, eyebrow: '从她的经验，回到你的此刻', title: '', body: '' },
    { id: 'observation-action', type: 'observationAction', order: 8, enabled: true, title: '留给自己观察', body: '从现实处境开始，记录保持私密' },
    { id: 'shared-practice-action', type: 'sharedPracticeAction', order: 9, enabled: true, title: '一起谈谈', body: '围绕本期问题，听见不同的生活经验' },
    { id: 'contents', type: 'contents', order: 10, enabled: true, title: '本期目录', entry1Label: '人物纪实', entry1Summary: '', entry2Label: '微声音', entry2Summary: '第一个普通早晨', entry3Label: '此刻观察', entry3Summary: '从本期问题继续', entry4Label: '本期讨论', entry4Summary: '一起听见不同的经历' },
    { id: 'archive', type: 'archive', order: 11, enabled: true, title: '策展档案', entryLabel: 'ISSUE 01 · 往期精彩示意', entryTitle: '留住没有答案的时刻' },
    { id: 'brand-footer', type: 'brandFooter', order: 12, enabled: true, title: '我有我的时节', body: '记录真实的女性经验，也为看见之后的生活留下一条可行的路。' },
  ];
}
function createIssueAudioTrack(number: number, source: Partial<ManagedAudioTrack> = {}): ManagedAudioTrack {
  return {
    id: source.id || `voice-${String(number).padStart(2, '0')}`,
    title: source.title || `微声音 ${String(number).padStart(2, '0')}`,
    duration: source.duration || '',
    audioObjectKey: source.audioObjectKey || '',
    quote: source.quote || '',
    subtitle: source.subtitle || '',
    transcript: source.transcript || '',
  };
}
function normalizeIssueAudioModule(module: ManagedIssueModule): ManagedIssueModule {
  const tracks = Array.isArray(module.tracks)
    ? module.tracks.slice(0, 3).map((track, index) => createIssueAudioTrack(index + 1, track))
    : [createIssueAudioTrack(1, {
      id: 'voice-01', title: String(module.title || ''), duration: String(module.duration || ''),
      audioObjectKey: String(module.audioObjectKey || ''), quote: String(module.quote || ''),
      subtitle: String(module.subtitle || ''), transcript: String(module.transcript || ''),
    })];
  return { ...module, tracks };
}
function issueAudioTrackPayload(track: ManagedAudioTrack) {
  return {
    id: track.id,
    title: track.title || '',
    duration: track.duration || '',
    audioObjectKey: track.audioObjectKey || '',
    quote: track.quote || '',
    subtitle: track.subtitle || '',
    transcript: track.transcript || '',
  };
}
function issueDraftContentPayload(content: ManagedIssue['draftContent']): ManagedIssue['draftContent'] {
  return {
    ...content,
    sections: content.sections.map((module) => module.type === 'audio' && module.tracks
      ? { ...module, tracks: module.tracks.map(issueAudioTrackPayload) }
      : module),
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
      eyebrow: opener.eyebrow || '本期主题', title: opener.title || '', titleFontSize: opener.titleFontSize || 72, titleColor: opener.titleColor || '#59483d', body: opener.body || '', bodyFontSize: opener.bodyFontSize || 30, bodyColor: opener.bodyColor || '#40362f', byline: cover.byline || '策展与编辑 · MYRIAD SHE',
    };
    normalizedModules = modules.filter((module) => module !== cover && module !== opener).concat(combined).sort((left, right) => left.order - right.order).map((module, order) => ({ ...module, order }));
  }
  return normalizedModules.map((rawModule) => {
    const module = rawModule.type === 'audio' ? normalizeIssueAudioModule(rawModule) : rawModule;
    return module.type === 'question'
    ? { ...module, eyebrow: module.eyebrow || '从她的经验，回到你的此刻' }
    : module.type === 'audio' ? { ...module, quote: module.quote || '', subtitle: module.subtitle || '' } : module;
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
const issueForm = ref({ code: '', label: '', month: '', theme: '', question: '', status: 'draft', microVoiceTitle: '', microVoiceDuration: '', coverObjectKey: '', microVoiceObjectKey: '', homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionRight: '本期封面', draftContent: { sections: createDefaultIssueModules(), discussion: createDefaultDiscussionContent() } });
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
const issueHistory = ref<Array<{ version: number; publishedAt: string; publishedBy: string | null; snapshot: unknown }>>([]);
const issueModulePreviewUrls = ref<Record<string, string>>({});
const selectedIssueModuleId = ref('cover-story');

/* ---------- 共同实践文案：按期 + 列表化 ---------- */
type CopyItem = { richText: string; fontSize: number; color: string };
const practiceCopyIssueCode = ref('');
const practiceCopySource = ref<'issue' | 'global'>('global');
const practiceCopyLoading = ref(false);
const practiceCopySaving = ref(false);
const practiceCopyError = ref('');
const practiceCopyMessage = ref('');
const practiceCopyParagraphs = ref<CopyItem[]>([]);
const practiceCopyRules = ref<Array<{ number: CopyItem; title: CopyItem; copy: CopyItem }>>([]);

const newCopyItem = (text: string, fontSize: number, color: string): CopyItem => ({ richText: text, fontSize, color });

async function loadPracticeCopy() {
  const code = practiceCopyIssueCode.value.trim();
  if (!code) { practiceCopyError.value = '请先选择期刊'; return; }
  practiceCopyLoading.value = true;
  practiceCopyError.value = '';
  practiceCopyMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/practice-copy/manage?issueCode=${encodeURIComponent(code)}`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取该期文案'));
    const result = await response.json();
    practiceCopySource.value = result.source === 'issue' ? 'issue' : 'global';
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
        copy: {
          onlineParagraphs: practiceCopyParagraphs.value,
          rules: practiceCopyRules.value,
        },
      }),
    });
    if (!response.ok) throw new Error(await responseMessage(response, '保存失败'));
    practiceCopySource.value = 'issue';
    practiceCopyMessage.value = '已保存该期文案';
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
type DiscussionContributionStatus = 'pending' | 'handled' | 'dismissed';
type ManagedDiscussionContribution = { id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null; status: DiscussionContributionStatus; createdAt: string; updatedAt: string };
type ManagedDiscussionContributionDetail = ManagedDiscussionContribution & { body: string };
const discussionContributions = ref<ManagedDiscussionContribution[]>([]);
const discussionContributionStatus = ref<DiscussionContributionStatus | ''>('pending');
const discussionContributionIssueCode = ref('');
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
const discussionContributionPageSize = 50;
let discussionContributionGeneration = 0;
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
type Member = { id: string; status: 'active' | 'suspended'; createdAt: string; updatedAt: string; observationCount: number; nickname: string | null; avatarUrl: string | null; phoneMasked: string | null; phoneNumber?: string | null };
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
const systemSettings = ref({ store_enabled: false, maintenance_notice: '', support_contact: '' });
const systemSettingsOriginal = ref({ ...systemSettings.value });

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
    lifeCardDraft.value = lifeCards.value.find((card) => card.month === lifeCardMonth.value) ?? null;
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
  lifeCardDraft.value = lifeCards.value.find((card) => card.month === month) ?? null;
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
type Employee = { id: string; username: string; displayName: string; role: 'super_admin' | 'content_editor' | 'support_readonly'; status: 'active' | 'disabled'; createdAt: string; updatedAt?: string; lastLoginAt?: string | null };
const employees = ref<Employee[]>([]);
const employeeForm = ref({ username: '', displayName: '', password: '', role: 'content_editor' as 'content_editor' | 'support_readonly' });
const employeeError = ref('');
const employeeMessage = ref('');
const employeeLoading = ref(false);
const employeeSaving = ref(false);
const createEmployeeOpen = ref(false);
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
const adminIdentity = computed(() => {
  const payload = adminTokenPayload.value;
  const raw = String(payload.displayName || payload.username || payload.sub || '').replace(/^admin:/, '');
  const name = raw || '管理员';
  return { name, initial: name.slice(0, 1).toUpperCase(), roleLabel: adminRoleLabels[adminRole.value] || '管理员' };
});
const accountMenuOpen = ref(false);
const passwordDialogOpen = ref(false);
const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const passwordSaving = ref(false);
const passwordError = ref('');
const passwordMessage = ref('');

function closeAccountMenu() {
  accountMenuOpen.value = false;
}

function openPasswordDialog() {
  accountMenuOpen.value = false;
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
const observationStatus = ref('');
const observationMethod = ref('');
const observationIssueCode = ref('');
const observationStaleOnly = ref(false);
const observationStatusBeforeStale = ref<string | null>(null);
const dashboardLoading = ref(false);
const currentPageRefreshing = ref(false);
type DashboardSection = 'overview' | 'practice' | 'content' | 'observations' | 'contributions' | 'privacy' | 'audit' | 'members' | 'settings' | 'employees' | 'life-cards' | 'life-card-views';
type JournalSection = 'journal-list' | 'journal-home' | 'journal-story' | 'journal-audio' | 'journal-discussion' | 'journal-archive';
type PageSection = 'mine' | 'privacy-policy' | 'user-agreement' | 'privacy-page' | 'about-history';
type PracticeSection = 'practice' | 'directory' | 'observation' | 'shared-practice' | 'daily-objects';
type ContentSection = JournalSection | PageSection | PracticeSection | 'media';
const dashboardSectionKeys = new Set<DashboardSection>(['overview', 'practice', 'content', 'observations', 'contributions', 'privacy', 'audit', 'members', 'settings', 'employees', 'life-cards', 'life-card-views']);
const contentSectionKeys = new Set<ContentSection>(['practice', 'directory', 'observation', 'shared-practice', 'daily-objects', 'privacy-page', 'about-history', 'privacy-policy', 'user-agreement', 'media', 'mine', 'journal-list', 'journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive']);
const journalSections: JournalSection[] = ['journal-list', 'journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive'];
const pageSections: PageSection[] = ['mine', 'privacy-policy', 'user-agreement', 'privacy-page', 'about-history'];
const practiceSections: PracticeSection[] = ['practice', 'directory', 'observation', 'shared-practice', 'daily-objects'];
const journalModuleSections = ['journal-home', 'journal-story', 'journal-audio', 'journal-discussion', 'journal-archive'] as const;
function isJournalSection(section: ContentSection | string): section is JournalSection { return (journalSections as string[]).includes(section); }
function isPageSection(section: ContentSection | string): section is PageSection { return (pageSections as string[]).includes(section); }
function isPracticeSection(section: ContentSection | string): section is PracticeSection { return (practiceSections as string[]).includes(section); }
function readDashboardLocation() {
  try {
    const raw = JSON.parse(localStorage.getItem('myriad_she_admin_location') || '{}') as Record<string, unknown>;
    let section = dashboardSectionKeys.has(raw.section as DashboardSection) ? raw.section as DashboardSection : 'overview';
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
const sidebarCollapsed = ref(false);
// 回到顶部：滚动超过一屏后出现，避免长表格页无处可回去。
const showBackToTop = ref(false);

function handleWorkspaceScroll() {
  showBackToTop.value = window.scrollY > 480;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const practiceNavigationExpanded = ref(initialDashboardLocation.section === 'practice');
const journalNavigationExpanded = ref(initialDashboardLocation.section === 'content' && (isJournalSection(initialDashboardLocation.contentSection) || initialDashboardLocation.contentSection === 'media'));
const pageNavigationExpanded = ref(initialDashboardLocation.section === 'content' && isPageSection(initialDashboardLocation.contentSection));
function openJournalNavigation() {
  const onJournal = activeSection.value === 'content' && (isJournalSection(activeContentSection.value) || activeContentSection.value === 'media');
  const shouldCollapse = !sidebarCollapsed.value && onJournal && journalNavigationExpanded.value;
  sidebarCollapsed.value = false;
  activeSection.value = 'content';
  journalNavigationExpanded.value = !shouldCollapse;
  pageNavigationExpanded.value = false;
  if (!shouldCollapse && !onJournal) activeContentSection.value = 'journal-list';
}
async function openJournalSubsection(section: JournalSection | 'media') {
  activeSection.value = 'content';
  activeContentSection.value = section;
  journalNavigationExpanded.value = true;
  pageNavigationExpanded.value = false;
  issueSaveMessage.value = '';
  if (!editingIssueId.value && (journalSections as string[]).includes(section) && section !== 'journal-list') {
    const preferred = issues.value.find((issue) => issue.status === 'published') || issues.value[0];
    if (preferred) await editIssue(preferred);
  }
  ensureJournalModuleSelection();
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
  if (!shouldCollapse && !onPage) activeContentSection.value = 'mine';
}
function openPracticeNavigation() {
  const shouldCollapse = !sidebarCollapsed.value
    && activeSection.value === 'practice'
    && practiceNavigationExpanded.value;
  sidebarCollapsed.value = false;
  activeSection.value = 'practice';
  practiceNavigationExpanded.value = !shouldCollapse;
  journalNavigationExpanded.value = false;
  pageNavigationExpanded.value = false;
  if (!shouldCollapse && !isPracticeSection(activeContentSection.value)) {
    activeContentSection.value = 'practice';
  }
}
watch([activeSection, activeContentSection], ([section, contentSection]) => {
  localStorage.setItem('myriad_she_admin_location', JSON.stringify({ section, contentSection }));
});
watch(activeSection, (section) => {
  if (section === 'contributions' && loggedIn.value) void refreshDiscussionContributions();
});
const currentView = computed(() => {
  if (activeSection.value === 'practice') {
    if (activeContentSection.value === 'directory') return { eyebrow: 'PRACTICE / DIRECTORY', title: '实践目录设置' };
    if (activeContentSection.value === 'observation') return { eyebrow: 'PRACTICE / CONTENT / OBSERVATION', title: '此刻观察' };
    if (activeContentSection.value === 'shared-practice') return { eyebrow: 'PRACTICE / CONTENT / SHARED PRACTICE', title: '共同实践目录' };
    if (activeContentSection.value === 'daily-objects') return { eyebrow: 'PRACTICE / DAILY OBJECTS', title: '日常之物' };
    if (activeContentSection.value === 'privacy-page') return { eyebrow: 'PRIVACY / ABOUT', title: '关于 MYRIAD SHE' };
    if (activeContentSection.value === 'about-history') return { eyebrow: 'PRIVACY / ABOUT / HISTORY', title: '关于发布历史' };
    if (activeContentSection.value === 'privacy-policy') return { eyebrow: 'MINE / PRIVACY / POLICY', title: '隐私政策' };
    return { eyebrow: 'PRACTICE / PAGE COPY', title: '实践页面' };
  }
  if (activeSection.value === 'content') {
    const contentViews: Record<ContentSection, { eyebrow: string; title: string }> = {
      practice: { eyebrow: 'PRACTICE / PAGE COPY', title: '实践页面' },
      directory: { eyebrow: 'PRACTICE / DIRECTORY', title: '实践目录设置' },
      observation: { eyebrow: 'PRACTICE / CONTENT / OBSERVATION', title: '此刻观察' },
      'shared-practice': { eyebrow: 'PRACTICE / CONTENT / SHARED PRACTICE', title: '共同实践目录' },
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
    };
    return contentViews[activeContentSection.value];
  }
  const views: Record<Exclude<DashboardSection, 'content' | 'practice'>, { eyebrow: string; title: string }> = {
    overview: { eyebrow: 'SYSTEM / OVERVIEW', title: '健康与迁移' },
    observations: { eyebrow: 'OBSERVATIONS / MANAGEMENT', title: '观察记录管理' },
    contributions: { eyebrow: 'DISCUSSION / MODERATION', title: '用户经历审核' },
    privacy: { eyebrow: 'PRIVACY / REQUESTS', title: '隐私申请' },
    audit: { eyebrow: 'SECURITY / AUDIT LOG', title: '审计日志' },
    members: { eyebrow: 'MEMBERS / DIRECTORY', title: '会员列表' },
    settings: { eyebrow: 'SYSTEM / SETTINGS', title: '系统设置' },
    employees: { eyebrow: 'SYSTEM / EMPLOYEES', title: '员工与权限' },
    'life-cards': { eyebrow: 'CONTENT / LIFE CARDS', title: '生命牌文案' },
    'life-card-views': { eyebrow: 'CONTENT / LIFE CARD VIEWS', title: '生命牌查看' },
  };
  return views[activeSection.value];
});
const processingPrivacyId = ref('');
const retryingPrivacyId = ref('');
const privacyControlsBusy = computed(() => Boolean(dashboardLoading.value || privacyRefreshing.value || privacyLoadingMore.value || processingPrivacyId.value || retryingPrivacyId.value));
const reencrypting = ref(false);
const reencryptCursor = ref<{ updatedAt: string; id: string } | null>(null);
const reencryptMessage = ref('');
const coverFile = ref<File | null>(null);
const voiceFile = ref<File | null>(null);
const originalMediaKeys = ref({ cover: '', voice: [] as string[] });
const mediaPreviewUrls = ref({ cover: '', voice: '' });
const mediaPreviewLoading = ref<'cover' | 'voice' | ''>('');
const mediaPreviewError = ref('');
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
const journalQuestionTitle = computed(() => String(journalQuestionModule.value?.title || issueForm.value.question || '').trim());
const journalPastIssues = computed(() => [...issues.value]
  .filter((issue) => (issue.status === 'published' || issue.status === 'archived') && issue.id !== editingIssueId.value)
  .sort((left, right) => (right.publishedVersion || 0) - (left.publishedVersion || 0) || right.month.localeCompare(left.month)));
const journalSectionDescription = computed(() => {
  switch (activeContentSection.value) {
    case 'journal-home': return '刊期信息、封面主题、首页栏目顺序与整期手机预览。';
    case 'journal-story': return '人物纪实摘要与人物故事详情页；保存后同时更新首页对应栏目。';
    case 'journal-audio': return '本期最多三段微声音；没有上传音频的栏目不会在首页显示播放器。';
    case 'journal-discussion': return '讨论页固定文案、示例经历与写作页预览，随本期整体发布。';
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
  issueSaveMessage.value = '';
}
function seedIssueModulesFromForm() {
  if (editingIssueId.value) return;
  const sections = issueForm.value.draftContent.sections;
  const cover = sections.find((module) => module.type === 'coverStory' || module.type === 'cover');
  if (cover && !String(cover.title || '').trim() && issueForm.value.theme.trim()) cover.title = issueForm.value.theme.trim();
  const question = sections.find((module) => module.type === 'question');
  if (question && !String(question.title || '').trim() && issueForm.value.question.trim()) question.title = issueForm.value.question.trim();
}
watch(activeContentSection, () => {
  ensureJournalModuleSelection();
});

function displayDate(value?: string | null) {
  if (!value) return '无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function displayFileSize(value?: number) {
  if (!Number.isFinite(value) || value === undefined || value < 0) return '大小未知';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function withRequestId(message: string, response: Response) {
  const requestId = response.headers.get('x-request-id')?.trim();
  return requestId ? `${message}（请求编号：${requestId}）` : message;
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: string | string[] };
    if (Array.isArray(body.message)) return withRequestId(body.message.join('；'), response);
    if (typeof body.message === 'string' && body.message) return withRequestId(body.message, response);
  } catch {
    // Keep the caller's stable fallback when the response is not JSON.
  }
  return withRequestId(fallback, response);
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

function normalizeHealthResult(raw: unknown): HealthResult {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const nested = root.message && typeof root.message === 'object' ? root.message as Record<string, unknown> : {};
  const source = typeof root.status === 'string' ? root : nested;
  const dependencies = source.dependencies && typeof source.dependencies === 'object'
    ? source.dependencies as Record<string, unknown>
    : {};
  return {
    status: typeof source.status === 'string' ? source.status : 'error',
    timestamp: typeof source.timestamp === 'string' ? source.timestamp : new Date().toISOString(),
    dependencies: {
      database: typeof dependencies.database === 'string' ? dependencies.database : undefined,
      objectStorage: typeof dependencies.objectStorage === 'string' ? dependencies.objectStorage : undefined,
      redis: typeof dependencies.redis === 'string' ? dependencies.redis : undefined,
    },
  };
}

function isPracticeContent(raw: unknown): raw is PracticeContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  const boundedText = (candidate: unknown, maximum: number, minimum = 0) => typeof candidate === 'string' && candidate.length >= minimum && candidate.length <= maximum;
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
    || !value.observationCopy || typeof value.observationCopy !== 'object' || Array.isArray(value.observationCopy)
    || !observationCopyGroups.flatMap((group) => group.fields).every((field) => Object.hasOwn(value.observationCopy as object, field.key))
    || !Object.values(value.observationCopy as Record<string, unknown>).every((item) => item && typeof item === 'object' && !Array.isArray(item)
      && boundedText((item as Record<string, unknown>).richText, 2000, 1)
      && typeof (item as Record<string, unknown>).fontSize === 'number' && Number.isSafeInteger((item as Record<string, unknown>).fontSize) && Number((item as Record<string, unknown>).fontSize) >= 10 && Number((item as Record<string, unknown>).fontSize) <= 48
      && typeof (item as Record<string, unknown>).color === 'string' && /^#[0-9a-f]{6}$/i.test(String((item as Record<string, unknown>).color)))
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
  if (!value.sharedPracticeCopy || typeof value.sharedPracticeCopy !== 'object' || Array.isArray(value.sharedPracticeCopy)) {
    return '实践页面配置格式无效：API 尚未返回共同实践文案，请确认 API 已更新并刷新页面。';
  }
  const missing = sharedPracticeCopyGroups.flatMap((group) => group.fields).map((field) => field.key)
    .filter((key) => !Object.hasOwn(value.sharedPracticeCopy as object, key));
  if (missing.length) return `实践页面配置格式无效：共同实践文案缺少 ${missing.join('、')}，请刷新后重试。`;
    const shared = value.sharedPracticeCopy as Record<string, unknown>;
    const invalid = sharedPracticeCopyGroups.flatMap((group) => group.fields).map((field) => field.key).find((key) => {
      const item = shared[key] as Record<string, unknown> | undefined;
      return !item || typeof item.richText !== 'string' || !item.richText.length || item.richText.length > 2000
        || typeof item.fontSize !== 'number' || !Number.isSafeInteger(item.fontSize) || item.fontSize < 10 || item.fontSize > 48
        || typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color);
    });
    if (invalid) return `实践页面配置格式无效：共同实践文案“${invalid}”的文字、字号或颜色无效，请在后台调整后重新读取。`;
    return '实践页面配置格式无效：实践目录或观察文案字段无效，请刷新页面重新读取。';
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

function normalizeObservationCopyForEditor(value: string) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div)\s*>/gi, '\n').replace(/<[^>]*>/g, '');
  return textarea.value.trim();
}

function updateObservationCopyText(key: ObservationCopyKey, event: Event) {
  if (!practiceContent.value || practiceContentSaving.value || practiceContentConflict.value) return;
  const input = event.target as HTMLTextAreaElement;
  const escapedText = input.value.replace(/\r\n?/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  practiceContent.value.observationCopy[key].richText = escapedText.replace(/\n/g, '<br/>');
  markPracticeContentDirty();
}

function markPracticeContentDirty() {
  if (!practiceContentSaving.value) {
    practiceContentDirty.value = true;
    practiceContentMessage.value = '';
    practiceContentError.value = '';
  }
}

function isPracticeEntryExpanded(key: string) {
  return expandedPracticeEntries.value[key] === true;
}

function togglePracticeEntry(key: string) {
  expandedPracticeEntries.value = { ...expandedPracticeEntries.value, [key]: !isPracticeEntryExpanded(key) };
}

function togglePracticeEntryEnabled(entry: PracticeEntry) {
  if (!practiceContent.value || practiceContentSaving.value || practiceContentConflict.value) return;
  entry.enabled = !entry.enabled;
  markPracticeContentDirty();
}

function addPracticeEntry() {
  if (!practiceContent.value || practiceContentSaving.value || practiceContentConflict.value) return;
  if (practiceContent.value.entries.length >= 100) {
    practiceContentError.value = '最多可设置 100 个目录。';
    return;
  }
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const entry: PracticeEntry = {
    key: `directory-${uuid}`,
    contextRichText: '新的实践情境', contextFontSize: 12, contextColor: '#8b6b58',
    title: '新实践目录', titleRichText: '新实践目录', titleFontSize: 16, titleColor: '#40362f',
    description: '请填写目录说明', descriptionRichText: '请填写目录说明', descriptionFontSize: 13, descriptionColor: '#40362f',
    enabled: false,
  };
  practiceContent.value.entries.push(entry);
  expandedPracticeEntries.value = { ...expandedPracticeEntries.value, [entry.key]: true };
  practiceContentError.value = '';
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

async function refreshAudit() {
  const session = sessionGeneration;
  const generation = ++auditRequestGeneration;
  auditLoadingMore.value = false;
  auditMoreError.value = '';
  try {
    await loadAudit(generation, session);
  } catch (caught) {
    if (generation !== auditRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    auditMoreError.value = caught instanceof Error ? caught.message : '无法读取操作审计';
  }
}

async function loadAudit(generation = auditRequestGeneration, expectedSession = sessionGeneration) {
  const response = await apiFetch(`${apiBase}/admin/audit-logs?${auditQuery(0)}`, { headers: { Authorization: `Bearer ${token.value}` } });
  if (handleAdminUnauthorized(response, expectedSession)) return;
  if (!response.ok) throw new Error(await responseMessage(response, '无法读取操作审计'));
  const result = await response.json();
  if (!isAuditPage(result)) throw new Error('操作审计列表格式无效');
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
  const file = (event.target as HTMLInputElement).files?.[0] || null;
  if (kind === 'cover') coverFile.value = file;
  else voiceFile.value = file;
  mediaPreviewUrls.value = { ...mediaPreviewUrls.value, [kind]: '' };
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
    const reason = window.prompt(`请填写${status === 'suspended' ? '停用' : '恢复'}会员的原因（必填，最多 500 字）`);
    if (reason === null) return;
    if (!reason.trim()) { memberError.value = '操作原因不能为空。'; return; }
    const response = await apiFetch(`${apiBase}/admin/users/${encodeURIComponent(member.id)}/status`, { method: 'PATCH', headers: adminHeaders(true), body: JSON.stringify({ status, reason: reason.trim() }) });
    if (!response.ok) throw new Error(await responseMessage(response, '会员状态更新失败'));
    await refreshMembers();
  } catch (caught) { memberError.value = caught instanceof Error ? caught.message : '会员状态更新失败'; }
}

async function loadSystemSettings() {
  settingsLoading.value = true;
  settingsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/system-settings`, { headers: adminHeaders() });
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取系统设置'));
    const result = await response.json();
    const next = {
      store_enabled: result.store_enabled?.value === true,
      maintenance_notice: typeof result.maintenance_notice?.value === 'string' ? result.maintenance_notice.value : '',
      support_contact: typeof result.support_contact?.value === 'string' ? result.support_contact.value : '',
    };
    systemSettings.value = next;
    systemSettingsOriginal.value = { ...next };
  } catch (caught) { settingsError.value = caught instanceof Error ? caught.message : '无法读取系统设置'; }
  finally { settingsLoading.value = false; }
}

async function saveSystemSettings() {
  settingsSaving.value = true;
  settingsMessage.value = '';
  settingsError.value = '';
  try {
    if (!window.confirm('确认保存系统设置？变更会立即生效并记录到审计日志。')) return;
    const response = await apiFetch(`${apiBase}/admin/system-settings`, { method: 'PATCH', headers: adminHeaders(true), body: JSON.stringify(systemSettings.value) });
    if (!response.ok) throw new Error(await responseMessage(response, '系统设置保存失败'));
    systemSettingsOriginal.value = { ...systemSettings.value };
    settingsMessage.value = '设置已保存，并已记录操作审计。';
  } catch (caught) { settingsError.value = caught instanceof Error ? caught.message : '系统设置保存失败'; }
  finally { settingsSaving.value = false; }
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

async function createEmployee() {
  employeeSaving.value = true;
  employeeError.value = '';
  employeeMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/employees`, { method: 'POST', headers: adminHeaders(true), body: JSON.stringify(employeeForm.value) });
    if (!response.ok) throw new Error(await responseMessage(response, '员工账号创建失败'));
    employeeForm.value = { username: '', displayName: '', password: '', role: 'content_editor' };
    employeeMessage.value = '员工账号已创建。';
    createEmployeeOpen.value = false;
    await loadEmployees();
  } catch (caught) { employeeError.value = caught instanceof Error ? caught.message : '员工账号创建失败'; }
  finally { employeeSaving.value = false; }
}

async function updateEmployee(employee: Employee, changes: { role?: Employee['role']; status?: Employee['status']; password?: string }) {
  employeeError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/employees/${encodeURIComponent(employee.id)}`, { method: 'PATCH', headers: adminHeaders(true), body: JSON.stringify(changes) });
    if (!response.ok) throw new Error(await responseMessage(response, '员工设置更新失败'));
    employeeMessage.value = '员工权限已更新。';
    await loadEmployees();
  } catch (caught) { employeeError.value = caught instanceof Error ? caught.message : '员工设置更新失败'; }
}

async function resetEmployeePassword(employee: Employee) {
  const password = window.prompt(`为 ${employee.username} 设置新密码（至少 12 位）。员工下次登录时必须修改。`);
  if (password === null) return;
  if (password.length < 12) { employeeError.value = '新密码至少需要 12 位。'; return; }
  await updateEmployee(employee, { password });
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
      throw new Error(withRequestId('管理后台登录服务返回无效数据', response));
    }
    token.value = result.accessToken;
    localStorage.setItem('myriad_she_admin_token', token.value);
    sessionGeneration += 1;
    password.value = '';
    scheduleSessionExpiry(Number(result.expiresIn));
    if (adminPasswordChangeRequired.value) {
      passwordRotationError.value = '';
    } else if (adminRole.value === 'support_readonly') {
      activeSection.value = 'members';
      await refreshMembers();
    } else if (adminRole.value === 'content_editor') {
      activeSection.value = 'practice';
      activeContentSection.value = 'practice';
      await loadContentEditorDashboard();
    } else await loadDashboard();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '登录失败';
  } finally {
    loading.value = false;
  }
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
    passwordRotation.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    if (adminRole.value === 'support_readonly') { activeSection.value = 'members'; await refreshMembers(); }
    else if (adminRole.value === 'content_editor') { activeSection.value = 'practice'; activeContentSection.value = 'practice'; await loadContentEditorDashboard(); }
    else await loadDashboard();
  } catch (caught) {
    passwordRotationError.value = caught instanceof Error ? caught.message : '密码修改失败。';
  } finally { passwordRotationSaving.value = false; }
}

async function loadDashboard() {
  if (adminRole.value === 'content_editor') return loadContentEditorDashboard();
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
  const authHeaders = { Authorization: `Bearer ${token.value}` };
  const observationParams = observationQuery(0);
  try {
    const [healthResponse, homeResponse, issuesResponse, issueSummaryResponse, practiceResponse, minePageResponse, privacyPageResponse, observationsResponse, lifecycleResponse, privacyResponse, auditResponse, migrationResponse] = await Promise.all([
      apiFetch(`${apiBase}/health`),
      apiFetch(`${apiBase}/content/home`),
      apiFetch(`${apiBase}/content/issues`, { headers: authHeaders }),
      apiFetch(`${apiBase}/content/issues/summary`, { headers: authHeaders }),
      apiFetch(`${apiBase}/content/practice/manage`, { headers: authHeaders }),
      apiFetch(`${apiBase}/content/mine/manage`, { headers: authHeaders }),
      apiFetch(`${apiBase}/content/about/manage`, { headers: authHeaders }),
      apiFetch(`${apiBase}/admin/observations?${observationParams}`, { headers: authHeaders }),
      apiFetch(`${apiBase}/admin/observations/lifecycle`, { headers: authHeaders }),
      apiFetch(`${apiBase}/admin/privacy-requests?${privacyQuery(0)}`, { headers: authHeaders }),
      apiFetch(`${apiBase}/admin/audit-logs?${auditQuery(0)}`, { headers: authHeaders }),
      apiFetch(`${apiBase}/admin/system/migrations`, { headers: authHeaders }),
    ]);
    const healthResult = normalizeHealthResult(await healthResponse.json().catch(() => null));
    if (dashboardGeneration === dashboardRequestGeneration && session === sessionGeneration && loggedIn.value) health.value = healthResult;
    if ([issuesResponse, issueSummaryResponse, practiceResponse, minePageResponse, privacyPageResponse, observationsResponse, lifecycleResponse, privacyResponse, auditResponse, migrationResponse].some((response) => response.status === 401)) {
      if (session === sessionGeneration && loggedIn.value) logout('后台登录已过期，请重新登录。');
      return;
    }
    assertSession(session);
    const failedResponse = [homeResponse, issuesResponse, issueSummaryResponse, practiceResponse, minePageResponse, privacyPageResponse, observationsResponse, lifecycleResponse, privacyResponse, auditResponse, migrationResponse].find((response) => !response.ok);
    if (failedResponse) throw new Error(await responseMessage(failedResponse, '无法读取 API 数据'));
    const [homeResult, issuesResult, issueSummaryResult, practiceResult, minePageResult, privacyPageResult, observationResult, lifecycleResult, privacyResult, auditResult, migrationResult] = await Promise.all([
      homeResponse.json(), issuesResponse.json(), issueSummaryResponse.json(), practiceResponse.json(), minePageResponse.json(), privacyPageResponse.json(), observationsResponse.json(), lifecycleResponse.json(), privacyResponse.json(), auditResponse.json(), migrationResponse.json(),
    ]);
    if (!isPublicHome(homeResult)) throw new Error('首页内容格式无效');
    if (!isManagedIssueList(issuesResult)) throw new Error('期刊列表格式无效');
    if (!isIssueDashboardConsistent(issueSummaryResult, issuesResult, homeResult)) throw new Error('期刊列表、生命周期摘要与首页发布内容不一致，请刷新后核实');
    if (!isPracticeContent(practiceResult)) throw new Error(practiceContentFormatError(practiceResult));
    if (!isMinePageContent(minePageResult)) throw new Error('我的页面配置格式无效');
    if (!isPrivacyPageContent(privacyPageResult)) throw new Error('关于 MYRIAD SHE 内容格式无效');
    if (!isManagedObservationPage(observationResult)) throw new Error('观察记录列表格式无效');
    if (!isObservationLifecycle(lifecycleResult)) throw new Error('观察生命周期格式无效');
    if (!isPrivacyRequestPage(privacyResult)) throw new Error('删除申请列表格式无效');
    if (!isAuditPage(auditResult)) throw new Error('操作审计列表格式无效');
    if (!isMigrationStatus(migrationResult)) throw new Error('数据库迁移状态格式无效');
    if (dashboardGeneration !== dashboardRequestGeneration) return;
    home.value = homeResult;
    migrationStatus.value = migrationResult;
    issues.value = issuesResult;
    issueLifecycle.value = issueSummaryResult;
    void ensureJournalIssueSelection();
    if (practiceGeneration === practiceContentRequestGeneration && !practiceContentSaving.value && !practiceContentDirty.value) {
      practiceContent.value = practiceResult;
      practiceContentDirty.value = false;
    }
    if (minePageGeneration === minePageContentRequestGeneration && !minePageContentSaving.value && !minePageContentDirty.value) {
      minePageContent.value = minePageResult;
      minePageContentDirty.value = false;
    }
    if (privacyPageGeneration === privacyPageContentRequestGeneration && !privacyPageSaving.value && !privacyPageDirty.value) {
      privacyPageContent.value = privacyPageResult;
      privacyPagePublishedVersion.value = Number((privacyPageResult as AboutPageContent & { publishedVersion?: number }).publishedVersion) || 1;
      privacyPagePublishedAt.value = String((privacyPageResult as AboutPageContent & { publishedAt?: string }).publishedAt ?? '');
      privacyPageDirty.value = false;
    }
    if (observationGeneration === observationRequestGeneration) {
      observations.value = observationResult.items;
      observationTotal.value = observationResult.total;
      observationOffset.value = observationResult.offset + observationResult.items.length;
      observationHasMore.value = observationOffset.value < observationResult.total;
      observationMoreError.value = '';
      observationLifecycle.value = lifecycleResult;
    }
    if (privacyGeneration === privacyRequestGeneration) {
      privacyRequests.value = privacyResult.items;
      privacyTotal.value = privacyResult.total;
      privacyLifecycle.value = privacyResult.summary;
      privacyOffset.value = privacyResult.offset + privacyResult.items.length;
      privacyHasMore.value = privacyOffset.value < privacyResult.total;
      privacyMoreError.value = '';
    }
    if (auditGeneration === auditRequestGeneration) {
      auditLogs.value = auditResult.rows;
      auditTotal.value = auditResult.total;
      auditOffset.value = auditResult.offset + auditResult.rows.length;
      auditHasMore.value = auditOffset.value < auditResult.total;
      auditMoreError.value = '';
    }
    if (activeSection.value === 'content' && activeContentSection.value === 'about-history' && privacyPageRevisions.value.length === 0) {
      await loadPrivacyRevisions('about-page');
    }
  } catch (caught) {
    if (dashboardGeneration === dashboardRequestGeneration && session === sessionGeneration && loggedIn.value) {
      error.value = caught instanceof Error ? caught.message : '无法读取 API 数据';
    }
    throw caught;
  } finally {
    if (dashboardGeneration === dashboardRequestGeneration && session === sessionGeneration) dashboardLoading.value = false;
  }
}

async function loadContentEditorDashboard() {
  const session = sessionGeneration;
  const generation = ++dashboardRequestGeneration;
  dashboardLoading.value = true;
  const headers = { Authorization: `Bearer ${token.value}` };
  try {
    const [homeResponse, issuesResponse, issueSummaryResponse, practiceResponse] = await Promise.all([
      apiFetch(`${apiBase}/content/home`),
      apiFetch(`${apiBase}/content/issues`, { headers }),
      apiFetch(`${apiBase}/content/issues/summary`, { headers }),
      apiFetch(`${apiBase}/content/practice/manage`, { headers }),
    ]);
    const responses = [issuesResponse, issueSummaryResponse, practiceResponse];
    if (responses.some((response) => response.status === 401)) { logout('后台登录已过期，请重新登录。'); return; }
    const failed = [homeResponse, ...responses].find((response) => !response.ok);
    if (failed) throw new Error(await responseMessage(failed, '无法读取内容配置'));
    const [homeResult, issueResult, summaryResult, practiceResult] = await Promise.all([
      homeResponse.json(), issuesResponse.json(), issueSummaryResponse.json(), practiceResponse.json(),
    ]);
    if (!isPublicHome(homeResult) || !isManagedIssueList(issueResult)
      || !isIssueDashboardConsistent(summaryResult, issueResult, homeResult)) throw new Error('实践内容列表与首页状态不一致，请刷新后重试');
    if (!isPracticeContent(practiceResult)) throw new Error('内容配置格式无效');
    if (generation !== dashboardRequestGeneration || session !== sessionGeneration) return;
    home.value = homeResult;
    issues.value = issueResult;
    issueLifecycle.value = summaryResult;
    practiceContent.value = practiceResult;
    await loadDailyObjectsContent();
  } catch (caught) {
    if (generation === dashboardRequestGeneration && session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '无法读取内容配置';
    throw caught;
  } finally {
    if (generation === dashboardRequestGeneration && session === sessionGeneration) dashboardLoading.value = false;
  }
}

async function refreshCurrentPage() {
  if (currentPageRefreshing.value || dashboardLoading.value) return;
  const location = { section: activeSection.value, contentSection: activeContentSection.value };
  if (location.section === 'settings'
    && JSON.stringify(systemSettings.value) !== JSON.stringify(systemSettingsOriginal.value)
    && !window.confirm('刷新会放弃尚未保存的系统设置修改，是否继续？')) return;
  if (adminRole.value === 'content_editor'
    && ['practice', 'observation', 'shared-practice'].includes(location.contentSection)
    && practiceContentDirty.value
    && !window.confirm('刷新会放弃尚未保存的实践文案修改，是否继续？')) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  currentPageRefreshing.value = true;
  try {
    if (location.section === 'overview' || location.section === 'practice') {
      await loadDashboard();
    } else if (location.section === 'content') {
      switch (location.contentSection) {
        case 'mine': await reloadMinePageContent(); break;
        case 'media': await loadOrphanMedia(true); break;
        case 'daily-objects': await loadDailyObjectsContent(); break;
        case 'privacy-page': await reloadPrivacyPageContent(); break;
        case 'about-history': await loadPrivacyRevisions('about-page'); break;
        case 'privacy-policy': await privacyDocumentManager.value?.reload(); break;
        case 'user-agreement': await agreementDocumentManager.value?.reload(); break;
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
    } else if (location.section === 'settings') {
      await loadSystemSettings();
    } else if (location.section === 'employees') {
      await loadEmployees();
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

async function savePracticeContent() {
  const content = practiceContent.value;
  if (!content || practiceContentSaving.value || practiceContentConflict.value) return;
  practiceContentSaving.value = true;
  const session = sessionGeneration;
  practiceContentRequestGeneration += 1;
  practiceContentError.value = '';
  practiceContentMessage.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/practice/manage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify(content),
    });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (response.status === 409) {
      const conflict = await response.clone().json().catch(() => null);
      if (conflict?.code === 'practice_content_changed') practiceContentConflict.value = true;
    }
    if (!response.ok) throw new Error(await responseMessage(response, '实践内容保存失败'));
    const updated = await response.json();
    if (!isPracticeContent(updated)) throw new Error('服务器返回的实践页面配置无法确认');
    practiceContent.value = updated;
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
    const published = await response.json();
    if (!isPracticeContent(published)) throw new Error('服务器返回的实践页面版本无法确认');
    practiceContent.value = published;
    practiceContentDirty.value = false; practiceContentConflict.value = false;
    practiceContentMessage.value = '实践页面已发布到小程序。';
  } catch (caught) { if (session === sessionGeneration && loggedIn.value) practiceContentError.value = caught instanceof Error ? caught.message : '发布失败，请重试。'; }
  finally { if (session === sessionGeneration) practiceContentSaving.value = false; }
}

async function reloadPracticeContent() {
  if (practiceContentSaving.value) return;
  if (practiceContentDirty.value && !window.confirm('放弃当前实践页面的未保存修改，并载入云端最新版本？')) return;
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
    const updated = await response.json();
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
  return Number.isSafeInteger(content.editVersion) && Number(content.editVersion) > 0
    && ['brandName', 'brandSubtitle', 'bagLabel', 'bagCount', 'eyebrow', 'title', 'intro', 'previewNote', 'supportLabel'].every((key) => typeof content[key] === 'string')
    && Array.isArray(content.products) && content.products.length > 0 && content.products.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const product = item as Record<string, unknown>;
      return ['id', 'name', 'english', 'image', 'price', 'priceLabel', 'description', 'optionDetails', 'dailyUseDetails', 'deliveryDetails'].every((key) => typeof product[key] === 'string') && typeof product.enabled === 'boolean';
    });
}

function openDailyObjectsEditor() {
  activeContentSection.value = 'daily-objects';
  if (!dailyObjectsContent.value || !dailyObjectsDirty.value) void loadDailyObjectsContent();
}

function openDailyObjectsEntrySettings() {
  activeSection.value = 'practice';
  activeContentSection.value = 'directory';
  if (!practiceContent.value) void loadDashboard();
}

async function loadDailyObjectsContent() {
  const session = sessionGeneration;
  dailyObjectsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/daily-objects/manage`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(response, session)) return;
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取日常之物设置'));
    const content = await response.json();
    if (!isDailyObjectsContent(content)) throw new Error('日常之物配置格式无效');
    const previewEntries = await Promise.all(content.products.map(async (product) => {
      if (!product.image.startsWith('content/image/')) return [product.id, product.image] as const;
      try {
        const params = new URLSearchParams({ objectKey: product.image });
        const previewResponse = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
        if (handleAdminUnauthorized(previewResponse, session)) return [product.id, ''] as const;
        if (!previewResponse.ok) return [product.id, ''] as const;
        const target = await previewResponse.json();
        return [product.id, isMediaViewTarget(target) ? target.url : ''] as const;
      } catch { return [product.id, ''] as const; }
    }));
    if (session !== sessionGeneration) return;
    if (session === sessionGeneration && !dailyObjectsDirty.value) {
      dailyObjectsContent.value = content;
      dailyObjectPreviewUrls.value = Object.fromEntries(previewEntries);
      dailyObjectsConflict.value = false;
    }
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) dailyObjectsError.value = caught instanceof Error ? caught.message : '无法读取日常之物设置';
  }
}

async function uploadDailyObjectImage(event: Event, productId: string) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !dailyObjectsContent.value || dailyObjectUploadingId.value) return;
  const product = dailyObjectsContent.value.products.find((item) => item.id === productId);
  if (!product) return;
  if (!file.type.startsWith('image/')) { dailyObjectsError.value = '请选择图片文件。'; return; }
  const session = sessionGeneration;
  dailyObjectUploadingId.value = productId;
  dailyObjectsError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/content/media/upload-url`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, kind: 'image' }),
    });
    if (handleAdminUnauthorized(response, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!response.ok) throw new Error(await responseMessage(response, '无法创建商品图片上传地址'));
    const target = await response.json();
    if (!isMediaUploadTarget(target)) throw new Error('服务器未返回有效的图片上传地址');
    const uploadResponse = await apiFetch(target.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file }, mediaUploadTimeoutMs);
    assertSession(session);
    if (!uploadResponse.ok) throw new Error(await responseMessage(uploadResponse, '商品图片上传失败'));
    const params = new URLSearchParams({ objectKey: target.objectKey });
    const previewResponse = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (handleAdminUnauthorized(previewResponse, session)) throw new Error('后台登录已过期，请重新登录。');
    assertSession(session);
    if (!previewResponse.ok) throw new Error(await responseMessage(previewResponse, '图片已上传，但无法生成预览'));
    const preview = await previewResponse.json();
    if (!isMediaViewTarget(preview)) throw new Error('服务器未返回有效的图片预览地址');
    product.image = target.objectKey;
    dailyObjectPreviewUrls.value = { ...dailyObjectPreviewUrls.value, [productId]: preview.url };
    markDailyObjectsDirty();
    dailyObjectsMessage.value = '图片已上传，保存日常之物后生效。';
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) dailyObjectsError.value = caught instanceof Error ? caught.message : '商品图片上传失败。';
  } finally {
    if (session === sessionGeneration) dailyObjectUploadingId.value = '';
  }
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

async function saveDailyObjectsContent() {
  const content = dailyObjectsContent.value;
  if (!content || dailyObjectsSaving.value || dailyObjectsConflict.value) return;
  dailyObjectsSaving.value = true;
  dailyObjectsError.value = '';
  dailyObjectsMessage.value = '';
  const session = sessionGeneration;
  try {
    const response = await apiFetch(`${apiBase}/content/daily-objects/manage`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` }, body: JSON.stringify(content) });
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

function isDiscussionContributionPage(value: unknown): value is { items: ManagedDiscussionContribution[]; total: number; limit: number; offset: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  return Number.isSafeInteger(page.total) && Number.isSafeInteger(page.limit) && Number.isSafeInteger(page.offset)
    && Array.isArray(page.items) && page.items.every((item) => Boolean(item && typeof item === 'object' && !Array.isArray(item)
      && typeof (item as Record<string, unknown>).id === 'string'
      && Number.isSafeInteger((item as Record<string, unknown>).revision)
      && typeof (item as Record<string, unknown>).issueCode === 'string'
      && typeof (item as Record<string, unknown>).issueLabel === 'string'
      && typeof (item as Record<string, unknown>).threadId === 'string'
      && ((item as Record<string, unknown>).threadAuthor === null || typeof (item as Record<string, unknown>).threadAuthor === 'string')
      && ['pending', 'handled', 'dismissed'].includes(String((item as Record<string, unknown>).status))
      && typeof (item as Record<string, unknown>).createdAt === 'string'
      && typeof (item as Record<string, unknown>).updatedAt === 'string'));
}

function discussionContributionQuery(offset = 0) {
  return new URLSearchParams({
    limit: String(discussionContributionPageSize),
    offset: String(offset),
    ...(discussionContributionStatus.value ? { status: discussionContributionStatus.value } : {}),
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
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取用户经历'));
    const result = await response.json();
    if (!isDiscussionContributionPage(result)) throw new Error('用户经历列表格式无效');
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributions.value = result.items;
    discussionContributionTotal.value = result.total;
    discussionContributionOffset.value = result.offset + result.items.length;
    discussionContributionHasMore.value = discussionContributionOffset.value < result.total;
  } catch (caught) {
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributionError.value = caught instanceof Error ? caught.message : '无法读取用户经历';
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
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多经历'));
    const result = await response.json();
    if (!isDiscussionContributionPage(result)) throw new Error('用户经历列表格式无效');
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributions.value = [...discussionContributions.value, ...result.items];
    discussionContributionTotal.value = result.total;
    discussionContributionOffset.value = result.offset + result.items.length;
    discussionContributionHasMore.value = discussionContributionOffset.value < result.total;
  } catch (caught) {
    if (generation !== discussionContributionGeneration || session !== sessionGeneration || !loggedIn.value) return;
    discussionContributionMoreError.value = caught instanceof Error ? caught.message : '无法加载更多经历';
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
    if (!response.ok) throw new Error(await responseMessage(response, '无法读取经历内容'));
    const result = await response.json() as ManagedDiscussionContributionDetail | null;
    if (!result || typeof result.body !== 'string'
      || !['pending', 'handled', 'dismissed'].includes(result.status)) throw new Error('经历详情格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedDiscussionContribution.value = result;
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedDiscussionContributionError.value = caught instanceof Error ? caught.message : '无法读取经历内容';
  } finally {
    if (session === sessionGeneration) selectedDiscussionContributionLoading.value = false;
  }
}

async function updateDiscussionContributionStatus(status: DiscussionContributionStatus) {
  const record = selectedDiscussionContribution.value;
  if (!record || discussionContributionSaving.value || record.status === status) return;
  const session = sessionGeneration;
  discussionContributionSaving.value = true;
  discussionContributionActionMessage.value = '';
  selectedDiscussionContributionError.value = '';
  try {
    const response = await apiFetch(`${apiBase}/admin/discussion-contributions/${encodeURIComponent(record.id)}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ status, revision: record.revision }),
    });
    if (handleAdminUnauthorized(response, session)) return;
    if (!response.ok) throw new Error(await responseMessage(response, '无法更新处理状态'));
    const result = await response.json() as ManagedDiscussionContribution;
    if (!result || result.id !== record.id || !['pending', 'handled', 'dismissed'].includes(result.status)) throw new Error('处理结果格式无效');
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedDiscussionContribution.value = { ...record, ...result };
    discussionContributionActionMessage.value = status === 'handled' ? '已标记为已处理。' : status === 'dismissed' ? '已标记为不采纳。' : '已重新打开。';
    await refreshDiscussionContributions();
  } catch (caught) {
    if (session !== sessionGeneration || !loggedIn.value) return;
    selectedDiscussionContributionError.value = caught instanceof Error ? caught.message : '无法更新处理状态';
  } finally {
    if (session === sessionGeneration) discussionContributionSaving.value = false;
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
    if (!response.ok) throw new Error(await responseMessage(response, '无法加载更多审计记录'));
    const result = await response.json();
    if (!isAuditPage(result)) throw new Error('操作审计列表格式无效');
    if (generation !== auditRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    auditLogs.value = [...auditLogs.value, ...result.rows];
    auditTotal.value = result.total;
    auditOffset.value = result.offset + result.rows.length;
    auditHasMore.value = auditOffset.value < result.total;
  } catch (caught) {
    if (generation !== auditRequestGeneration || session !== sessionGeneration || !loggedIn.value) return;
    auditMoreError.value = caught instanceof Error ? caught.message : '无法加载更多审计记录';
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
  issueForm.value = { code: '', label: '', month: '', theme: '', question: '', status: 'draft', microVoiceTitle: '', microVoiceDuration: '', coverObjectKey: '', microVoiceObjectKey: '', homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionRight: '本期封面', draftContent: { sections: createDefaultIssueModules(), discussion: createDefaultDiscussionContent() } };
  selectedIssueModuleId.value = 'cover-story';
  originalIssueForm.value = cloneIssueForm(issueForm.value);
  issueConflict.value = false;
  issueConflictResolved.value = '';
  issueSaveMessage.value = '';
  issueHistory.value = [];
  originalMediaKeys.value = { cover: '', voice: [] };
  coverFile.value = null;
  voiceFile.value = null;
  mediaPreviewUrls.value = { cover: '', voice: '' };
  mediaPreviewLoading.value = '';
  mediaPreviewError.value = '';
}

function syncIssueFieldsToModules() {
  const modules = issueForm.value.draftContent.sections;
  const coverStory = modules.find((item) => item.type === 'coverStory');
  const cover = coverStory || modules.find((item) => item.type === 'cover');
  const opener = coverStory || modules.find((item) => item.type === 'opener');
  const audio = modules.find((item) => item.type === 'audio');
  const question = modules.find((item) => item.type === 'question');
  const meta = modules.find((item) => item.type === 'issueMeta');
  if (meta) { meta.eyebrow = issueForm.value.label; meta.month = issueForm.value.month; }
  if (cover) {
    issueForm.value.coverObjectKey = String(cover.imageObjectKey || '');
    issueForm.value.homeCoverCaptionLeft = String(cover.captionLeft || '');
    issueForm.value.homeCoverCaptionRight = String(cover.captionRight || '');
  }
  if (opener) {
    const nextTheme = String(opener.title || '').trim();
    if (nextTheme) issueForm.value.theme = nextTheme;
    issueForm.value.homeMetaRichText = String(opener.body || '');
  }
  if (audio) {
    const firstTrack = audio.tracks?.[0];
    audio.audioObjectKey = String(firstTrack?.audioObjectKey || '');
    audio.title = String(firstTrack?.title || '');
    audio.duration = String(firstTrack?.duration || '');
    audio.quote = String(firstTrack?.quote || '');
    audio.subtitle = String(firstTrack?.subtitle || '');
    audio.transcript = String(firstTrack?.transcript || '');
    issueForm.value.microVoiceObjectKey = String(firstTrack?.audioObjectKey || '');
    issueForm.value.microVoiceTitle = String(firstTrack?.title || '');
    issueForm.value.microVoiceDuration = String(firstTrack?.duration || '');
    audio.enabled = Boolean(audio.tracks?.some((track) => track.audioObjectKey));
  }
  if (question) {
    const nextQuestion = String(question.title || '').trim();
    if (nextQuestion) issueForm.value.question = nextQuestion;
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
  if (module.type === 'audio') return `${module.tracks?.length || (module.audioObjectKey ? 1 : 0)} 段声音`;
  const summary = module.title || module.body || module.text || module.caption || module.eyebrow || '';
  return typeof summary === 'string' ? summary : '';
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

function setIssueModuleText(module: ManagedIssueModule, field: string, event: Event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    module[field] = field.endsWith('FontSize') ? Number(target.value) : target.value;
  }
}

async function previewIssueModules() {
  const session = sessionGeneration;
  const previews: Record<string, string> = {};
  for (const module of issueForm.value.draftContent.sections) {
    const media = module.type === 'audio'
      ? (module.tracks || []).map((track) => ({ key: track.audioObjectKey || '', previewKey: issueAudioTrackPreviewKey(module.id, track.id) }))
      : [{ key: module.imageObjectKey || '', previewKey: module.id }];
    for (const item of media) {
      if (typeof item.key !== 'string' || !item.key) continue;
      const params = new URLSearchParams({ objectKey: item.key });
      const response = await apiFetch(`${apiBase}/content/media/preview-url?${params}`, { headers: { Authorization: `Bearer ${token.value}` } });
      if (handleAdminUnauthorized(response, session)) return;
      assertSession(session);
      if (!response.ok) continue;
      const result = await response.json();
      if (isMediaViewTarget(result)) previews[item.previewKey] = result.url;
    }
  }
  issueModulePreviewUrls.value = previews;
}

function issueAudioTrackPreviewKey(moduleId: string, trackId: string) { return `${moduleId}:${trackId}`; }
function issueAudioTracks(module: ManagedIssueModule) { return module.tracks || []; }
function issueDraftMediaKeys(modules: ManagedIssueModule[]) {
  return [...new Set(modules.flatMap((module) => [
    typeof module.imageObjectKey === 'string' ? module.imageObjectKey : '',
    typeof module.audioObjectKey === 'string' ? module.audioObjectKey : '',
    ...(module.tracks || []).map((track) => track.audioObjectKey || ''),
  ].filter(Boolean)))];
}

function setIssueAudioTrackText(track: ManagedAudioTrack, field: keyof ManagedAudioTrack, event: Event) {
  const target = event.target;
  if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && field !== 'id') {
    track[field] = target.value;
  }
}

function addIssueAudioTrack(module: ManagedIssueModule) {
  if (!Array.isArray(module.tracks)) module.tracks = [];
  if (module.tracks.length >= 3) return;
  const id = `voice-${Date.now().toString(36)}`;
  module.tracks.push(createIssueAudioTrack(module.tracks.length + 1, { id }));
}

function removeIssueAudioTrack(module: ManagedIssueModule, index: number) {
  if (!module.tracks || index < 0 || index >= module.tracks.length) return;
  const track = module.tracks[index];
  if ((track.audioObjectKey || track.quote || track.subtitle || track.transcript) && !window.confirm('移除此声音条目？已上传的文件会在保存草稿后按引用情况处理。')) return;
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
  else if (type === 'audio') Object.assign(textModule, { title: '', duration: '', audioObjectKey: '', quote: '', subtitle: '', transcript: '', tracks: [createIssueAudioTrack(1)] });
  else if (type === 'archive') Object.assign(textModule, { title: '策展档案', body: '', entryLabel: '', entryTitle: '' });
  else Object.assign(textModule, { title: '', body: '' });
  sections.push(textModule);
  selectedIssueModuleId.value = id;
}

async function publishIssue() {
  if (!editingIssueId.value || uploading.value || issueConflict.value) return;
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
    issueForm.value.status = 'published';
    originalIssueStatus.value = 'published';
    editingIssueEditVersion.value += 1;
    originalIssueForm.value = cloneIssueForm(issueForm.value);
    await loadDashboard();
  } catch (caught) {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '发布期刊失败';
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
    throw new Error(withRequestId(typeof conflict?.message === 'string' ? conflict.message : '媒体回收状态冲突，请重新扫描核实', response));
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
  const candidates = uploadedMediaKeys.value.filter((objectKey) => !objectKey.startsWith('content/audio/')).map((objectKey): MediaCleanupCandidate => {
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
  editingIssueEditVersion.value = issue.editVersion;
  originalIssueStatus.value = issue.status;
  issueForm.value = { code: issue.code, label: issue.label, month: issue.month, theme: issue.theme, question: issue.question, status: issue.status, microVoiceTitle: issue.microVoiceTitle || '', microVoiceDuration: issue.microVoiceDuration || '', coverObjectKey: issue.coverObjectKey || '', microVoiceObjectKey: issue.microVoiceObjectKey || '', homeMetaRichText: issue.homeMetaRichText, homeMetaFontSize: issue.homeMetaFontSize, homeMetaColor: issue.homeMetaColor, homeCoverCaptionLeft: issue.homeCoverCaptionLeft, homeCoverCaptionRight: issue.homeCoverCaptionRight, draftContent: { sections: combineCoverAndOpener(issue.draftContent?.sections || createDefaultIssueModules()), discussion: issue.draftContent?.discussion || createDefaultDiscussionContent() } };
  selectedIssueModuleId.value = issueForm.value.draftContent.sections.find((module) => module.type === 'coverStory')?.id || issueForm.value.draftContent.sections[0]?.id || '';
  originalIssueForm.value = cloneIssueForm(issueForm.value);
  issueConflict.value = false;
  issueConflictResolved.value = '';
  issueSaveMessage.value = '';
  originalMediaKeys.value = {
    cover: issue.coverObjectKey || '',
    voice: [...new Set([issue.microVoiceObjectKey || '', ...issueDraftMediaKeys(issueForm.value.draftContent.sections).filter((key) => key.startsWith('content/audio/'))].filter(Boolean))],
  };
  coverFile.value = null;
  voiceFile.value = null;
  mediaPreviewUrls.value = { cover: '', voice: '' };
  mediaPreviewError.value = '';
  ensureJournalModuleSelection();
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

async function uploadMedia(file: File, kind: 'image' | 'audio', expectedSession = sessionGeneration) {
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

async function selectIssueModuleFile(module: ManagedIssueModule, event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
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
    track.audioObjectKey = await uploadMedia(file, 'audio', session);
    syncIssueFieldsToModules();
    const params = new URLSearchParams({ objectKey: track.audioObjectKey });
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

async function saveIssue() {
  if (uploading.value || issueConflict.value) return;
  uploading.value = true;
  const session = sessionGeneration;
  error.value = '';
  issueConflictResolved.value = '';
  let saved = false;
  try {
    seedIssueModulesFromForm();
    syncIssueFieldsToModules();
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
    const savedKeys = issueDraftMediaKeys(issueForm.value.draftContent.sections);
    const unsavedUploadedKeys = uploadedMediaKeys.value.filter((key) => !savedKeys.includes(key));
    const obsoleteKeys = [...new Set([...unsavedUploadedKeys, originalMediaKeys.value.cover].filter((key) => key && !savedKeys.includes(key)))];
    const candidates = obsoleteKeys.map((objectKey): MediaCleanupCandidate => {
      const cleanupToken = mediaCleanupTokens.value[objectKey];
      return cleanupToken ? { objectKey, purpose: 'temporary', cleanupToken } : { objectKey, purpose: 'orphan' };
    });
    uploadedMediaKeys.value = unsavedUploadedKeys;
    persistCleanupKeys();
    originalMediaKeys.value = {
      cover: issueForm.value.coverObjectKey || '',
      voice: [...new Set([issueForm.value.microVoiceObjectKey || '', ...savedKeys.filter((key) => key.startsWith('content/audio/'))].filter(Boolean))],
    };
    originalIssueForm.value = cloneIssueForm(issueForm.value);
    originalIssueStatus.value = issueForm.value.status;
    issueConflict.value = false;
    issueConflictResolved.value = '';
    issueSaveMessage.value = '草稿已保存。期号、首页、人物、声音、讨论与往期入口共用这份草稿，发布时整期一起生效。';
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
      else error.value = caught instanceof Error ? caught.message : '保存期刊失败';
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
      month: latest.month,
      theme: latest.theme,
      question: latest.question,
      status: latest.status,
      microVoiceTitle: latest.microVoiceTitle || '',
      microVoiceDuration: latest.microVoiceDuration || '',
      coverObjectKey: latest.coverObjectKey || '',
      microVoiceObjectKey: latest.microVoiceObjectKey || '',
      homeMetaRichText: latest.homeMetaRichText,
      homeMetaFontSize: latest.homeMetaFontSize,
      homeMetaColor: latest.homeMetaColor,
      homeCoverCaptionLeft: latest.homeCoverCaptionLeft,
      homeCoverCaptionRight: latest.homeCoverCaptionRight,
      draftContent: latest.draftContent,
    };
    issueForm.value = {
      code: local.code !== original.code ? local.code : latestForm.code,
      label: local.label !== original.label ? local.label : latestForm.label,
      month: local.month !== original.month ? local.month : latestForm.month,
      theme: local.theme !== original.theme ? local.theme : latestForm.theme,
      question: local.question !== original.question ? local.question : latestForm.question,
      status: local.status !== original.status ? local.status : latestForm.status,
      microVoiceTitle: local.microVoiceTitle !== original.microVoiceTitle ? local.microVoiceTitle : latestForm.microVoiceTitle,
      microVoiceDuration: local.microVoiceDuration !== original.microVoiceDuration ? local.microVoiceDuration : latestForm.microVoiceDuration,
      coverObjectKey: local.coverObjectKey !== original.coverObjectKey ? local.coverObjectKey : latestForm.coverObjectKey,
      microVoiceObjectKey: local.microVoiceObjectKey !== original.microVoiceObjectKey ? local.microVoiceObjectKey : latestForm.microVoiceObjectKey,
      homeMetaRichText: local.homeMetaRichText !== original.homeMetaRichText ? local.homeMetaRichText : latestForm.homeMetaRichText,
      homeMetaFontSize: local.homeMetaFontSize !== original.homeMetaFontSize ? local.homeMetaFontSize : latestForm.homeMetaFontSize,
      homeMetaColor: local.homeMetaColor !== original.homeMetaColor ? local.homeMetaColor : latestForm.homeMetaColor,
      homeCoverCaptionLeft: local.homeCoverCaptionLeft !== original.homeCoverCaptionLeft ? local.homeCoverCaptionLeft : latestForm.homeCoverCaptionLeft,
      homeCoverCaptionRight: local.homeCoverCaptionRight !== original.homeCoverCaptionRight ? local.homeCoverCaptionRight : latestForm.homeCoverCaptionRight,
      draftContent: JSON.stringify(local.draftContent) !== JSON.stringify(original.draftContent) ? local.draftContent : latestForm.draftContent,
    };
    originalIssueForm.value = cloneIssueForm(latestForm);
    originalIssueStatus.value = latest.status;
    editingIssueEditVersion.value = latest.editVersion;
    originalMediaKeys.value = {
      cover: latest.coverObjectKey || '',
      voice: [...new Set([latest.microVoiceObjectKey || '', ...issueDraftMediaKeys(latestForm.draftContent.sections).filter((key) => key.startsWith('content/audio/'))].filter(Boolean))],
    };
    mediaPreviewUrls.value = { cover: '', voice: '' };
    mediaPreviewError.value = '';
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
  privacyRequestGeneration += 1;
  auditRequestGeneration += 1;
  orphanMediaRequestGeneration += 1;
  audioLibraryRequestGeneration += 1;
  token.value = '';
  username.value = '';
  password.value = '';
  loading.value = false;
  sessionExpiresAt.value = 0;
  health.value = null;
  migrationStatus.value = null;
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
  selectedDiscussionContribution.value = null;
  selectedDiscussionContributionError.value = '';
  discussionContributionError.value = '';
  discussionContributionActionMessage.value = '';
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
  handleWorkspaceScroll();
  if (!token.value || !sessionExpiresAt.value || sessionExpiresAt.value > Date.now() + maxAdminSessionSeconds * 1000) {
    localStorage.removeItem('myriad_she_admin_token');
    localStorage.removeItem('myriad_she_admin_expires_at');
    token.value = '';
    sessionExpiresAt.value = 0;
  }
  if (!loggedIn.value) return;
  if (!sessionExpiresAt.value || sessionExpiresAt.value <= Date.now()) {
    logout('后台登录已过期，请重新登录。');
    return;
  }
  scheduleSessionExpiry((sessionExpiresAt.value - Date.now()) / 1000);
  if (isSuperAdmin.value && activeSection.value === 'life-cards' && !lifeCards.value.length) void loadLifeCards();
  if (isSuperAdmin.value && activeSection.value === 'life-card-views' && !lifeCardViews.value.length) void loadLifeCardViews();
  const session = sessionGeneration;
  const initialLoad = adminPasswordChangeRequired.value
    ? Promise.resolve()
    : adminRole.value === 'support_readonly'
    ? (activeSection.value = 'members', refreshMembers())
    : Promise.all([
      loadDashboard(),
      ...(isSuperAdmin.value && activeSection.value === 'members' ? [refreshMembers()] : []),
    ]);
  initialLoad.catch((caught) => {
    if (session === sessionGeneration && loggedIn.value) error.value = caught instanceof Error ? caught.message : '加载失败';
  });
  if (activeSection.value === 'contributions' && adminRole.value !== 'support_readonly' && !adminPasswordChangeRequired.value) void refreshDiscussionContributions();
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleWorkspaceScroll);
});
</script>

<template>
  <div class="app-frame">
    <a class="skip-link" href="#dashboard-content">跳到主要内容</a>
    <main id="dashboard-content" class="shell" :class="{ 'dashboard-shell': loggedIn }" :aria-busy="dashboardLoading">
    <section v-if="!loggedIn" class="login-panel">
      <p class="eyebrow">MYRIAD SHE / MANAGEMENT</p>
      <h1>内容与观察管理</h1>
      <p class="muted">维护实践内容、观察记录与账户隐私申请。</p>
      <form @submit.prevent="login">
        <label>账号<input v-model="username" autocomplete="username" required /></label>
        <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
        <button :disabled="loading" type="submit">{{ loading ? '登录中…' : '登录后台' }}</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
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
        <aside class="dashboard-sidebar" aria-label="后台分区导航">
          <div class="dashboard-brand">
            <div class="dashboard-brand-copy"><strong>MYRIAD SHE</strong></div>
          </div>
          <nav class="dashboard-nav" aria-label="后台分区">
            <div class="dashboard-nav-tabs">
              <p v-if="isSuperAdmin" class="dashboard-nav-label">总览</p>
              <button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'overview' }" :aria-label="sidebarCollapsed ? '健康与迁移' : undefined" :title="sidebarCollapsed ? '健康与迁移' : undefined" :aria-current="activeSection === 'overview' ? 'page' : undefined" aria-controls="overview-panel" @click="activeSection = 'overview'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 13.2a8.2 8.2 0 1 1 16.4 0v5.1H3.8zM12 12l3.5-3.2M7.2 16.5h.1m4.7 0h.1m4.7 0h.1" /></svg><span>健康与迁移</span></button>
              <p v-if="adminRole !== 'support_readonly'" class="dashboard-nav-label">内容</p>
              <div v-if="adminRole !== 'support_readonly'" class="dashboard-nav-group practice-nav-group" :class="{ expanded: activeSection === 'practice' && practiceNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: activeSection === 'practice' }" :aria-label="sidebarCollapsed ? '实践' : undefined" :title="sidebarCollapsed ? '实践' : undefined" :aria-current="activeSection === 'practice' ? 'page' : undefined" :aria-expanded="activeSection === 'practice' && practiceNavigationExpanded && !sidebarCollapsed" aria-controls="practice-navigation" @click.stop="openPracticeNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 4.5c-7.7.2-12.8 2.3-13.8 7.1-.8 3.4 1.8 6.3 5 6.3 5.1 0 7.8-5.5 8.8-13.4ZM5 20c2.4-4.4 5.2-7.1 9.2-9.6" /></svg><span>实践</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav"><nav v-if="activeSection === 'practice' && practiceNavigationExpanded && !sidebarCollapsed" id="practice-navigation" class="dashboard-subnav" aria-label="实践子菜单">
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'practice' }" :aria-current="activeContentSection === 'practice' ? 'page' : undefined" @click="activeContentSection = 'practice'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6zM9 8h6m-6 4h6m-6 4h3" /></svg><span>实践页面</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'directory' }" :aria-current="activeContentSection === 'directory' ? 'page' : undefined" @click="activeContentSection = 'directory'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2M4.5 6.5l1.6 1.2m11.8-1.2-1.6 1.2" /></svg><span>实践目录设置</span></button>
                  <div class="dashboard-subnav-group" :class="{ expanded: ['observation', 'shared-practice', 'daily-objects'].includes(activeContentSection) }"><span class="dashboard-subnav-heading">内容管理</span><button class="dashboard-subtab dashboard-subtab-nested" :class="{ active: activeContentSection === 'observation' }" :aria-current="activeContentSection === 'observation' ? 'page' : undefined" @click="activeContentSection = 'observation'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v4.7l3.2 2" /></svg><span>此刻观察</span></button><button class="dashboard-subtab dashboard-subtab-nested" :class="{ active: activeContentSection === 'shared-practice' }" :aria-current="activeContentSection === 'shared-practice' ? 'page' : undefined" @click="activeContentSection = 'shared-practice'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM7 9h10M7 12h7M7 15h4" /></svg><span>共同实践目录</span></button><button class="dashboard-subtab dashboard-subtab-nested" :class="{ active: activeContentSection === 'daily-objects' }" :aria-current="activeContentSection === 'daily-objects' ? 'page' : undefined" @click="openDailyObjectsEditor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1 12H4L5 8Zm4 0V6a3 3 0 0 1 6 0v2" /></svg><span>日常之物</span></button></div>
                </nav></Transition>
              </div>
              <div v-if="adminRole !== 'support_readonly'" class="dashboard-nav-group journal-nav-group" :class="{ expanded: activeSection === 'content' && (isJournalSection(activeContentSection) || activeContentSection === 'media') && journalNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: activeSection === 'content' && (isJournalSection(activeContentSection) || activeContentSection === 'media') }" :aria-label="sidebarCollapsed ? '期刊' : undefined" :title="sidebarCollapsed ? '期刊' : undefined" :aria-current="activeSection === 'content' && (isJournalSection(activeContentSection) || activeContentSection === 'media') ? 'page' : undefined" :aria-expanded="activeSection === 'content' && journalNavigationExpanded && !sidebarCollapsed" aria-controls="journal-navigation" @click.stop="openJournalNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg><span>期刊</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav"><nav v-if="activeSection === 'content' && journalNavigationExpanded && !sidebarCollapsed" id="journal-navigation" class="dashboard-subnav" aria-label="期刊子菜单">
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-list' }" :aria-current="activeContentSection === 'journal-list' ? 'page' : undefined" @click="openJournalSubsection('journal-list')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg><span>期刊列表</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-home' }" :aria-current="activeContentSection === 'journal-home' ? 'page' : undefined" @click="openJournalSubsection('journal-home')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v13H4zM4 10h16M9 14h6" /></svg><span>首页策展</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-story' }" :aria-current="activeContentSection === 'journal-story' ? 'page' : undefined" @click="openJournalSubsection('journal-story')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.2" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg><span>人物故事</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-audio' }" :aria-current="activeContentSection === 'journal-audio' ? 'page' : undefined" @click="openJournalSubsection('journal-audio')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg><span>微声音</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-discussion' }" :aria-current="activeContentSection === 'journal-discussion' ? 'page' : undefined" @click="openJournalSubsection('journal-discussion')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 9h8M8 12.5h5" /></svg><span>本期讨论</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'journal-archive' }" :aria-current="activeContentSection === 'journal-archive' ? 'page' : undefined" @click="openJournalSubsection('journal-archive')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v13H5zM8 4h8M8 11h8M8 15h5" /></svg><span>往期策展</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'media' }" :aria-current="activeContentSection === 'media' ? 'page' : undefined" @click="openJournalSubsection('media'); loadAudioLibrary(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="9" r="1.6"/><path d="m5 17 4.5-4.5 3 3 2.5-2.5 4 4" /></svg><span>媒体库</span></button>
                </nav></Transition>
              </div>
              <div class="dashboard-nav-group" :class="{ expanded: activeSection === 'content' && isPageSection(activeContentSection) && pageNavigationExpanded && !sidebarCollapsed }">
                <button type="button" class="dashboard-tab" :class="{ active: activeSection === 'content' && isPageSection(activeContentSection) }" :aria-label="sidebarCollapsed ? '页面与协议' : undefined" :title="sidebarCollapsed ? '页面与协议' : undefined" :aria-current="activeSection === 'content' && isPageSection(activeContentSection) ? 'page' : undefined" :aria-expanded="activeSection === 'content' && pageNavigationExpanded && !sidebarCollapsed" aria-controls="page-navigation" @click.stop="openPageNavigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 8h6m-6 3.5h6m-6 3.5h4" /></svg><span>页面与协议</span><svg class="nav-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                <Transition name="subnav"><nav v-if="activeSection === 'content' && pageNavigationExpanded && !sidebarCollapsed" id="page-navigation" class="dashboard-subnav" aria-label="页面与协议子菜单">
                  <button v-if="isSuperAdmin" class="dashboard-subtab" :class="{ active: activeContentSection === 'mine' }" :aria-current="activeContentSection === 'mine' ? 'page' : undefined" @click="activeContentSection = 'mine'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0M4 4h16v16H4z" /></svg><span>我的页面设置</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'privacy-page' }" :aria-current="activeContentSection === 'privacy-page' ? 'page' : undefined" @click="activeContentSection = 'privacy-page'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.5-7 9-4.1-1.5-7-4.6-7-9V6z" /></svg><span>关于 MYRIAD SHE</span></button>
                  <button class="dashboard-subtab" :class="{ active: activeContentSection === 'about-history' }" :aria-current="activeContentSection === 'about-history' ? 'page' : undefined" @click="activeContentSection = 'about-history'; loadPrivacyRevisions('about-page')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2" /></svg><span>关于发布历史</span></button>
                  <button v-if="adminRole !== 'support_readonly'" class="dashboard-subtab" :class="{ active: activeContentSection === 'user-agreement' }" :aria-current="activeContentSection === 'user-agreement' ? 'page' : undefined" @click="activeContentSection = 'user-agreement'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 8h6m-6 3.5h6m-6 3.5h4" /></svg><span>用户协议</span></button>
                  <button v-if="adminRole !== 'support_readonly'" class="dashboard-subtab" :class="{ active: activeContentSection === 'privacy-policy' }" :aria-current="activeContentSection === 'privacy-policy' ? 'page' : undefined" @click="activeContentSection = 'privacy-policy'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 8h6m-6 3.5h6m-6 3.5h4" /></svg><span>隐私政策</span></button>
                </nav></Transition>
              </div>
              <p v-if="isSuperAdmin || adminRole === 'content_editor'" class="dashboard-nav-label">运营</p>
              <button v-if="isSuperAdmin || adminRole === 'content_editor'" type="button" class="dashboard-tab" :class="{ active: activeSection === 'contributions' }" :aria-label="sidebarCollapsed ? '用户经历审核' : undefined" :title="sidebarCollapsed ? '用户经历审核' : undefined" :aria-current="activeSection === 'contributions' ? 'page' : undefined" aria-controls="discussion-contributions" @click="activeSection = 'contributions'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v12H9l-5 3v-15Z"/><path d="M8 9h8m-8 4h6" /></svg><span>用户经历审核</span></button>
              <button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'observations' }" :aria-label="sidebarCollapsed ? '观察记录管理' : undefined" :title="sidebarCollapsed ? '观察记录管理' : undefined" :aria-current="activeSection === 'observations' ? 'page' : undefined" aria-controls="observations" @click="activeSection = 'observations'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 7v5l3.2 2" /></svg><span>观察记录管理</span></button>
              <button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'privacy' }" :aria-label="sidebarCollapsed ? '隐私申请' : undefined" :title="sidebarCollapsed ? '隐私申请' : undefined" :aria-current="activeSection === 'privacy' ? 'page' : undefined" aria-controls="privacy-requests" @click="activeSection = 'privacy'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 19 6v5.5c0 4.4-2.9 7.5-7 9-4.1-1.5-7-4.6-7-9V6zM9.2 11.8l1.9 1.9 3.9-4" /></svg><span>隐私申请</span></button>
              <button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'audit' }" :aria-label="sidebarCollapsed ? '审计日志' : undefined" :title="sidebarCollapsed ? '审计日志' : undefined" :aria-current="activeSection === 'audit' ? 'page' : undefined" aria-controls="audit-logs" @click="activeSection = 'audit'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6m-6 4h6m-6 4h3m4 1 1.5 1.5L21 15" /></svg><span>审计日志</span></button>
              <p v-if="isSuperAdmin || adminRole === 'support_readonly'" class="dashboard-nav-label">系统</p>
              <button v-if="isSuperAdmin || adminRole === 'support_readonly'" type="button" class="dashboard-tab" :class="{ active: activeSection === 'members' }" :aria-current="activeSection === 'members' ? 'page' : undefined" aria-controls="member-directory" @click="activeSection = 'members'; refreshMembers()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8m1.2 2.3a5.5 5.5 0 0 1 3.3 5.1" /></svg><span>会员列表</span></button>
              <button v-if="isSuperAdmin || adminRole === 'support_readonly'" type="button" class="dashboard-tab" :class="{ active: activeSection === 'settings' }" :aria-current="activeSection === 'settings' ? 'page' : undefined" aria-controls="system-settings" @click="activeSection = 'settings'; loadSystemSettings()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15 21 17.5 19.5 20l-2.7-.6a7 7 0 0 1-1.2.7l-.8 2.4h-3l-.8-2.4-1.2-.7L7.1 20l-1.5-2.5L7 15a7 7 0 0 1 0-1.4l-1.4-2.5 1.5-2.5 2.7.6a7 7 0 0 1 1.2-.7l.8-2.4h3l.8 2.4 1.2.7 2.7-.6 1.5 2.5-1.4 2.5a7 7 0 0 1 0 1.4Z" /></svg><span>系统设置</span></button><button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'life-cards' }" :aria-current="activeSection === 'life-cards' ? 'page' : undefined" aria-controls="life-card-copy" @click="activeSection = 'life-cards'; loadLifeCards()"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="12" height="17" rx="1.5"/><path d="M18.5 6.5H20v14H8v-1.5M8 8h4M8 12h4"/></svg><span>生命牌文案</span></button><button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'life-card-views' }" :aria-current="activeSection === 'life-card-views' ? 'page' : undefined" aria-controls="life-card-views" @click="activeSection = 'life-card-views'; loadLifeCardViews()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3.2-6.5 8.5-6.5S20.5 12 20.5 12s-3.2 6.5-8.5 6.5S3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg><span>生命牌查看</span></button>
              <button v-if="isSuperAdmin" type="button" class="dashboard-tab" :class="{ active: activeSection === 'employees' }" :aria-current="activeSection === 'employees' ? 'page' : undefined" aria-controls="employee-access" @click="activeSection = 'employees'; loadEmployees()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8m1.2 2.3a5.5 5.5 0 0 1 3.3 5.1" /></svg><span>员工与权限</span></button>
            </div>
          </nav>
        </aside>
        <div class="dashboard-workspace">
          <header class="topbar">
            <div class="topbar-title" :key="currentView.title"><p class="eyebrow">MYRIAD SHE / {{ currentView.eyebrow }}</p><h1>{{ currentView.title }}</h1></div>
            <div class="topbar-actions">
              
              <div class="account-menu">
  <button type="button" class="account-avatar-button" :aria-expanded="accountMenuOpen" aria-haspopup="menu" :aria-label="`账号菜单，${adminIdentity.name}`" @click="accountMenuOpen = !accountMenuOpen">{{ adminIdentity.initial }}</button>
  <div v-if="accountMenuOpen" class="account-menu-backdrop" @click="closeAccountMenu"></div>
  <div v-if="accountMenuOpen" class="account-menu-panel" role="menu">
    <div class="account-menu-head"><strong>{{ adminIdentity.name }}</strong><small>{{ adminIdentity.roleLabel }}</small></div>
    <button type="button" class="account-menu-item" role="menuitem" @click="openPasswordDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z"/></svg><span>修改密码</span></button>
    <button type="button" class="account-menu-item" role="menuitem" @click="logoutFromButton"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5H6.8A1.3 1.3 0 0 0 5.5 5.8v12.4a1.3 1.3 0 0 0 1.3 1.3h7.7M13.5 12H20m0 0-2.8-2.8M20 12l-2.8 2.8"/></svg><span>退出登录</span></button>
  </div>
</div>
<p v-if="passwordMessage" class="topbar-status" role="status">{{ passwordMessage }}</p>
            </div>
          </header>
        <Teleport to="body">
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
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <p v-if="dashboardLoading" class="loading-note" role="status" aria-live="polite">正在同步云端数据…</p>
      <section v-if="activeSection === 'overview'" id="overview-panel" class="grid">
        <article class="panel health-panel"><p class="eyebrow">API STATUS</p><strong>{{ health?.status === 'ok' ? '运行正常' : health?.status === 'degraded' ? '依赖异常' : '检查中' }}</strong><div class="health-dependencies"><span :class="health?.dependencies?.database === 'ok' ? 'healthy' : 'unhealthy'">数据库 {{ health?.dependencies?.database === 'ok' ? '正常' : health?.dependencies?.database === 'error' ? '异常' : '待检查' }}</span><span :class="health?.dependencies?.objectStorage === 'ok' ? 'healthy' : 'unhealthy'">对象存储 {{ health?.dependencies?.objectStorage === 'ok' ? '正常' : health?.dependencies?.objectStorage === 'error' ? '异常' : '待检查' }}</span><span :class="health?.dependencies?.redis === 'ok' ? 'healthy' : 'unhealthy'">缓存 {{ health?.dependencies?.redis === 'ok' ? '正常' : health?.dependencies?.redis === 'error' ? '异常' : '待检查' }}</span></div><small>{{ health?.timestamp }}</small></article>
        <article class="panel"><p class="eyebrow">SCHEMA STATUS</p><strong>{{ migrationStatus?.consistent ? '迁移账本一致' : '需要核对迁移' }}</strong><small>已应用 {{ migrationStatus?.appliedCount ?? 0 }} / 可用 {{ migrationStatus?.availableCount ?? 0 }}</small><small v-if="migrationStatus?.pending.length">待执行：{{ migrationStatus.pending.join('、') }}</small><small v-else-if="migrationStatus?.missing.length || migrationStatus?.modified.length">发现缺失或被修改的迁移文件</small><small v-else-if="migrationStatus?.latestApplied">最新：{{ migrationStatus.latestApplied.name }} · {{ displayDate(migrationStatus.latestApplied.appliedAt) }}</small></article>
      </section>
      <section v-if="activeSection === 'content' && activeContentSection === 'journal-list'" id="journal-list" class="content-area">
        <div class="journal-page-head">
          <div class="journal-page-head-copy"><p class="eyebrow">JOURNAL WORKSPACE</p><small>{{ journalSectionDescription }}</small></div>
          <button type="button" @click="startNewIssue">＋ 新建期刊</button>
        </div>
        <div class="journal-list-layout">
          <aside class="panel issue-list-panel">
            <div class="section-heading"><h3>全部期次</h3><small>{{ issues.length }} 期</small></div>
            <button v-for="item in issues" :key="item.id" type="button" class="issue-list-item" :class="{ active: editingIssueId === item.id }" @click="editIssue(item)"><strong>{{ item.label }} · {{ item.theme }}</strong><small>{{ item.month }} · {{ journalIssueStatusLabel(item.status) }} · v{{ item.publishedVersion }}</small></button>
            <p v-if="!issues.length" class="muted">还没有期刊。先新建一份草稿。</p>
            <details class="issue-live-home"><summary>当前线上首页 <span>v{{ home?.publishedVersion || 0 }}</span></summary>
              <div v-if="home?.issue" class="issue-live-home-body"><strong>{{ home.issue.label }} · {{ home.issue.theme }}</strong><small>{{ home.issue.month }} · {{ home.issue.code }}</small>
                <ol><li v-for="(module, index) in (home.modules || []).filter((item) => item.enabled)" :key="module.id"><span>{{ String(index + 1).padStart(2, '0') }}</span><div><strong>{{ issueModuleLabel(module) }}</strong><small>{{ issueModuleSummary(module) || '无摘要' }}</small></div></li></ol>
              </div><p v-else class="muted">当前没有已发布期刊。</p>
            </details>
          </aside>
          <div class="journal-list-main">
            <form v-if="!editingIssueId" class="panel issue-editor-form journal-create-form" @submit.prevent="saveIssue">
              <div class="section-heading"><div><p class="eyebrow">NEW ISSUE</p><h3>新建期刊草稿</h3></div><small>只在后台保存，不会立即上线</small></div>
              <div class="form-grid"><label>期刊编号<input v-model="issueForm.code" required minlength="2" maxlength="64" placeholder="例如：issue-03" /></label><label>期刊标签<input v-model="issueForm.label" required minlength="2" maxlength="80" placeholder="例如：第三期" /></label><label>刊期月份<input v-model="issueForm.month" required minlength="2" maxlength="40" placeholder="例如：2026 年 11 月" /></label></div>
              <div class="form-grid issue-create-basics"><label>本期主题<input v-model="issueForm.theme" required minlength="2" maxlength="200" placeholder="例如：手指一根一根松开" /></label><label>本期问题<input v-model="issueForm.question" required minlength="2" maxlength="500" placeholder="留给本期观察的问题" /></label></div>
              <p class="field-help">创建后进入「首页策展」继续补充封面、人物、声音与讨论。这里填写的主题与问题会成为封面标题和「本期问题」栏目的初始值；这些模块共用同一份草稿。</p>
              <div class="form-actions"><button type="submit" :disabled="uploading">{{ uploading ? '创建中…' : '创建草稿并继续' }}</button><button type="button" class="quiet" @click="startNewIssue">清空</button></div>
            </form>
            <template v-else>
              <section class="panel journal-overview">
                <div class="section-heading"><div><p class="eyebrow">CURRENT ISSUE</p><h3>{{ issueForm.label }} · {{ issueForm.month }}</h3></div><span class="journal-status-pill" :class="'is-' + issueForm.status">{{ journalIssueStatusLabel(issueForm.status) }}</span></div>
                <div class="journal-overview-meta">
                  <div><small>期刊编号</small><strong>{{ issueForm.code }}</strong></div>
                  <div><small>本期主题</small><strong>{{ journalCoverTitle || '尚未填写封面标题' }}</strong></div>
                  <div><small>本期问题</small><strong>{{ journalQuestionTitle || '尚未填写问题栏目' }}</strong></div>
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
        <div class="journal-page-head">
          <div class="journal-page-head-copy"><p class="eyebrow">{{ currentView.eyebrow }}</p><small>{{ journalSectionDescription }}</small></div>
          <button type="button" class="quiet" @click="goToJournalSection('journal-list')">返回期刊列表</button>
        </div>
        <form class="panel issue-editor-form journal-module-form" @submit.prevent="saveIssue">
          <div class="journal-context">
            <div class="journal-context-copy">
              <p class="eyebrow">CURRENT ISSUE</p>
              <strong>{{ issueForm.label || '未选择期刊' }}<span v-if="issueForm.month" class="journal-context-month">{{ issueForm.month }}</span></strong>
              <div class="journal-context-meta">
                <span class="journal-status-pill" :class="'is-' + issueForm.status">{{ journalIssueStatusLabel(issueForm.status) }}</span>
                <small>{{ issueForm.code || '未设置期号' }}</small>
                <small>·</small>
                <small>草稿 v{{ editingIssueEditVersion || 1 }}</small>
              </div>
            </div>
            <label class="journal-context-select">切换期刊<select :value="editingIssueId" @change="selectJournalIssue"><option value="" disabled>请选择期刊</option><option v-for="item in issues" :key="item.id" :value="item.id">{{ item.label }} · {{ item.month }} · {{ journalIssueStatusLabel(item.status) }}</option></select></label>
          </div>
          <div v-if="!editingIssueId" class="journal-empty-state"><strong>还没有选择期刊</strong><p>从上方选择一份期刊，或先到「期刊列表」新建草稿，再回来编辑这个模块。</p><button type="button" @click="goToJournalSection('journal-list')">去期刊列表</button></div>
          <template v-else>
            <section v-if="activeContentSection === 'journal-home'" class="journal-meta-panel">
              <div class="section-heading"><div><p class="eyebrow">ISSUE META</p><h3>刊期信息</h3></div><small>首页顶部显示</small></div>
              <div class="form-grid"><label>期刊编号<input v-model="issueForm.code" required minlength="2" maxlength="64" /></label><label>期刊标签<input v-model="issueForm.label" required minlength="2" maxlength="80" /></label><label>刊期月份<input v-model="issueForm.month" required minlength="2" maxlength="40" /></label></div>
              <div class="journal-derived-grid">
                <div><small>本期主题 · 取自封面标题</small><strong>{{ journalCoverTitle || '尚未填写' }}</strong><button type="button" class="quiet" :disabled="!journalCoverModule" @click="selectJournalModule(journalCoverModule)">去修改封面</button></div>
                <div><small>本期问题 · 取自主页问题栏目</small><strong>{{ journalQuestionTitle || '尚未填写' }}</strong><button type="button" class="quiet" :disabled="!journalQuestionModule" @click="selectJournalModule(journalQuestionModule)">去修改问题</button></div>
              </div>
              <p class="field-help">主题与问题只保留一个来源：封面标题和「本期问题」栏目。这里只读展示，避免同一句话在两处维护后不一致。</p>
            </section>
            <div v-if="activeContentSection !== 'journal-discussion'" class="journal-module-toolbar-wrap">
              <div class="issue-module-toolbar"><h3>{{ journalModuleWorkspaceTitle }}</h3><select v-if="journalAddableModuleTypes.length" aria-label="新增栏目类型" @change="(event) => { const target = event.target as HTMLSelectElement; if (target.value) { addIssueModule(target.value as ManagedIssueModule['type']); target.value = ''; } }"><option value="">＋ 新增栏目</option><option v-for="type in journalAddableModuleTypes" :key="type" :value="type">{{ issueModuleTypeLabel(type) }}</option></select></div>
              <p class="field-help">选择一个栏目进行编辑；启用、排序与删除只改这份草稿。保存会写入整期，发布也会整期一起生效。</p>
              <nav class="issue-module-picker" aria-label="选择要编辑的栏目"><button v-for="(module, index) in issueForm.draftContent.sections" v-show="isIssueModuleVisibleInJournalSection(module)" :key="module.id" type="button" :class="{ active: selectedIssueModuleId === module.id }" :aria-pressed="selectedIssueModuleId === module.id" @click="selectedIssueModuleId = module.id"><small>{{ String(index + 1).padStart(2, '0') }}</small><span>{{ issueModuleLabel(module) }}</span><em :class="{ 'is-hidden': !module.enabled }">{{ module.enabled ? '显示' : '隐藏' }}</em></button></nav>
              <p v-if="!issueForm.draftContent.sections.some(isIssueModuleVisibleInJournalSection)" class="field-help">这个模块还没有栏目。到「首页策展」新增对应栏目后再回来编辑。</p>
            </div>
            <details v-if="activeContentSection === 'journal-discussion'" class="issue-module-details discussion-editor-details" open>
              <summary>本期讨论页文案与示例对话</summary>
              <p class="field-help">示例经历与编辑追问只用于排版演示。用户主动保存的正文会进入审核队列并加密存储；本编辑器只维护固定文案与示例，不会自动发布用户内容。</p>
              <div class="discussion-copy-grid">
                <label>栏目序号<input v-model="issueForm.draftContent.discussion.copy.number" required maxlength="20" /></label>
                <label>栏目眉题<input v-model="issueForm.draftContent.discussion.copy.kicker" required maxlength="200" /></label>
                <label class="discussion-field-wide">期刊提示<input v-model="issueForm.draftContent.discussion.copy.issueLine" required maxlength="200" /></label>
                <label class="discussion-field-wide">主标题<textarea v-model="issueForm.draftContent.discussion.copy.title" required rows="2" maxlength="2000" /></label>
                <label class="discussion-field-wide">开场提问<textarea v-model="issueForm.draftContent.discussion.copy.intro" required rows="2" maxlength="2000" /></label>
                <label>第一段<textarea v-model="issueForm.draftContent.discussion.copy.paragraph1" required rows="3" maxlength="2000" /></label>
                <label>第二段<textarea v-model="issueForm.draftContent.discussion.copy.paragraph2" required rows="3" maxlength="2000" /></label>
                <label class="discussion-field-wide">第三段<textarea v-model="issueForm.draftContent.discussion.copy.paragraph3" required rows="2" maxlength="2000" /></label>
                <label>写入按钮<input v-model="issueForm.draftContent.discussion.copy.writeAction" required maxlength="2000" /></label>
                <label>讨论区标题<input v-model="issueForm.draftContent.discussion.copy.voicesTitle" required maxlength="2000" /></label>
                <label>示例标记<input v-model="issueForm.draftContent.discussion.copy.exampleBadge" required maxlength="2000" /></label>
                <label class="discussion-field-wide">示例说明<textarea v-model="issueForm.draftContent.discussion.copy.exampleNotice" required rows="2" maxlength="2000" /></label>
                <label>私密观察眉题<input v-model="issueForm.draftContent.discussion.copy.selfEyebrow" required maxlength="2000" /></label>
                <label>私密观察标题<textarea v-model="issueForm.draftContent.discussion.copy.selfTitle" required rows="2" maxlength="2000" /></label>
                <label class="discussion-field-wide">私密观察说明<textarea v-model="issueForm.draftContent.discussion.copy.selfBody" required rows="2" maxlength="2000" /></label>
                <label>私密观察按钮<input v-model="issueForm.draftContent.discussion.copy.selfAction" required maxlength="2000" /></label>
                <label class="discussion-field-wide">写作页标题<input v-model="issueForm.draftContent.discussion.copy.composeTitle" required maxlength="2000" /></label>
                <label class="discussion-field-wide">写作页主标题<textarea v-model="issueForm.draftContent.discussion.copy.composeHeading" required rows="2" maxlength="2000" /></label>
                <label>写作字段名称<input v-model="issueForm.draftContent.discussion.copy.composeFieldLabel" required maxlength="2000" /></label>
                <label class="discussion-field-wide">输入提示<textarea v-model="issueForm.draftContent.discussion.copy.composePlaceholder" required rows="2" maxlength="2000" /></label>
                <label>预览操作文字<input v-model="issueForm.draftContent.discussion.copy.composePreviewAction" required maxlength="2000" /></label>
                <label>保存操作文字<input v-model="issueForm.draftContent.discussion.copy.composeSaveAction" required maxlength="2000" /></label>
                <label>放弃操作文字<input v-model="issueForm.draftContent.discussion.copy.composeDiscardAction" required maxlength="2000" /></label>
              </div>
              <div class="discussion-thread-toolbar"><h4>读者经历与回应</h4><button type="button" class="quiet" :disabled="issueForm.draftContent.discussion.threads.length >= 20" @click="addDiscussionThread">＋ 添加示例经历</button></div>
              <article v-for="(thread, threadIndex) in issueForm.draftContent.discussion.threads" :key="thread.id" class="discussion-thread-editor">
                <header><strong>{{ String(threadIndex + 1).padStart(2, '0') }} · 示例经历</strong><button type="button" class="quiet" :disabled="threadIndex === 0" aria-label="上移示例经历" @click="moveDiscussionThread(threadIndex, -1)">↑</button><button type="button" class="quiet" :disabled="threadIndex === issueForm.draftContent.discussion.threads.length - 1" aria-label="下移示例经历" @click="moveDiscussionThread(threadIndex, 1)">↓</button><button type="button" class="quiet danger" @click="removeDiscussionThread(threadIndex)">删除经历</button></header>
                <label>示例称呼<input v-model="thread.author" required maxlength="40" /></label>
                <label>经历正文<textarea v-model="thread.body" required rows="4" maxlength="4000" /></label>
                <div class="discussion-thread-toolbar"><strong>编辑回应</strong><button type="button" class="quiet" :disabled="thread.replies.length >= 20" @click="addDiscussionReply(threadIndex)">＋ 添加回应</button></div>
                <div v-for="(reply, replyIndex) in thread.replies" :key="reply.id" class="discussion-reply-editor">
                  <div class="discussion-reply-toolbar"><label>回应署名<input v-model="reply.author" required maxlength="40" /></label><button type="button" class="quiet" :disabled="replyIndex === 0" aria-label="上移回应" @click="moveDiscussionReply(threadIndex, replyIndex, -1)">↑</button><button type="button" class="quiet" :disabled="replyIndex === thread.replies.length - 1" aria-label="下移回应" @click="moveDiscussionReply(threadIndex, replyIndex, 1)">↓</button><button type="button" class="quiet danger" @click="removeDiscussionReply(threadIndex, replyIndex)">删除回应</button></div>
                  <label>回应正文<textarea v-model="reply.body" required rows="3" maxlength="4000" /></label>
                </div>
              </article>
              <details class="issue-preview-disclosure discussion-live-preview">
                <summary><span>手机页面预览</span><span>内容随下方草稿修改</span></summary>
                <div class="discussion-phone-preview">
                  <header><span>‹</span><strong>本期讨论</strong><span>···</span></header>
                  <div class="discussion-phone-body">
                    <small>{{ issueForm.draftContent.discussion.copy.number }}　{{ issueForm.draftContent.discussion.copy.kicker }}</small>
                    <p class="discussion-phone-issue">{{ issueForm.draftContent.discussion.copy.issueLine }}</p>
                    <h3>{{ issueForm.draftContent.discussion.copy.title }}</h3><p>{{ issueForm.draftContent.discussion.copy.intro }}</p>
                    <p>{{ issueForm.draftContent.discussion.copy.paragraph1 }}</p><p>{{ issueForm.draftContent.discussion.copy.paragraph2 }}</p><p>{{ issueForm.draftContent.discussion.copy.paragraph3 }}</p>
                    <div class="discussion-phone-link">{{ issueForm.draftContent.discussion.copy.writeAction }} <span>↗</span></div>
                    <section v-for="thread in issueForm.draftContent.discussion.threads" :key="thread.id"><small>{{ thread.author }}　示例</small><p>{{ thread.body }}</p><article v-for="reply in thread.replies" :key="reply.id"><small>{{ reply.author }} · 示例</small><p>{{ reply.body }}</p></article></section>
                    <section><small>{{ issueForm.draftContent.discussion.copy.selfEyebrow }}</small><h3>{{ issueForm.draftContent.discussion.copy.selfTitle }}</h3><p>{{ issueForm.draftContent.discussion.copy.selfBody }}</p></section>
                  </div>
                </div>
              </details>
              <details class="issue-preview-disclosure discussion-live-preview">
                <summary><span>写作页面手机预览</span><span>草稿文案预览，不会发布</span></summary>
                <div class="discussion-phone-preview discussion-compose-phone-preview">
                  <header><span>‹</span><strong>{{ issueForm.draftContent.discussion.copy.composeTitle }}</strong><span>···</span></header>
                  <div class="discussion-phone-body">
                    <small>{{ issueForm.draftContent.discussion.copy.number }}　{{ issueForm.draftContent.discussion.copy.composeTitle }}</small>
                    <h3>{{ issueForm.draftContent.discussion.copy.composeHeading }}</h3>
                    <p>{{ issueForm.draftContent.discussion.copy.intro }}</p>
                    <div class="discussion-compose-preview-label">{{ issueForm.draftContent.discussion.copy.composeFieldLabel }}</div>
                    <div class="discussion-compose-preview-input">{{ issueForm.draftContent.discussion.copy.composePlaceholder }}</div>
                    <div class="discussion-compose-preview-count">0 / 2000</div>
                    <div class="discussion-phone-link">{{ issueForm.draftContent.discussion.copy.composePreviewAction }} <span>→</span></div>
                    <div class="discussion-compose-preview-actions"><span>{{ issueForm.draftContent.discussion.copy.composeSaveAction }}</span><span>{{ issueForm.draftContent.discussion.copy.composeDiscardAction }}</span></div>
                  </div>
                </div>
              </details>
            </details>
            <div v-if="activeContentSection !== 'journal-discussion'" class="issue-module-list"><article v-for="(module, index) in issueForm.draftContent.sections" v-show="selectedIssueModuleId === module.id && isIssueModuleVisibleInJournalSection(module)" :key="module.id" class="issue-module-card">
              <header><span>{{ String(index + 1).padStart(2, '0') }} · {{ issueModuleLabel(module) }}</span><label class="issue-module-toggle"><input v-model="module.enabled" type="checkbox" />启用</label><button type="button" class="quiet" :disabled="index === 0" aria-label="上移栏目" @click="moveIssueModule(index, -1)">↑</button><button type="button" class="quiet" :disabled="index === issueForm.draftContent.sections.length - 1" aria-label="下移栏目" @click="moveIssueModule(index, 1)">↓</button><button v-if="!['issueMeta','coverStory','cover','opener','question','observationAction','sharedPracticeAction'].includes(module.type)" type="button" class="quiet danger" aria-label="删除栏目" @click="removeIssueModule(index)">删除</button></header>
              <div v-if="module.type === 'coverStory' || module.type === 'cover' || module.type === 'story' || module.type === 'image'" class="form-grid"><label v-if="module.type === 'coverStory' || module.type === 'cover' || module.type === 'story' || module.type === 'image'">上传 / 替换图片<input type="file" accept="image/jpeg,image/png,image/webp" @change="selectIssueModuleFile(module, $event)" /></label><label>图片对象路径<input :value="String(module.imageObjectKey || '')" placeholder="content/image/..." @input="setIssueModuleText(module, 'imageObjectKey', $event)" /></label><label>图片替代文本<input :value="String(module.altText || '')" @input="setIssueModuleText(module, 'altText', $event)" /></label></div>
              <label v-if="module.type === 'coverStory' || module.type === 'story'">{{ module.type === 'coverStory' ? '本期主题标题' : '人物引言' }}（换行会保留）<textarea :value="String(module.title || '')" rows="2" maxlength="500" @input="setIssueModuleText(module, 'title', $event)" /></label>
              <label v-else-if="module.type === 'contents'">目录标题<input :value="String(module.title || '')" maxlength="500" @input="setIssueModuleText(module, 'title', $event)" /></label>
              <label v-else-if="module.type === 'archive'">档案区标题<input :value="String(module.title || '')" maxlength="500" @input="setIssueModuleText(module, 'title', $event)" /></label>
              <label v-else-if="module.type !== 'issueMeta' && module.type !== 'audio'">标题 / 引言<input :value="String(module.title || '')" maxlength="500" @input="setIssueModuleText(module, 'title', $event)" /></label>
              <label v-if="module.type === 'issueMeta' || module.type === 'coverStory' || module.type === 'story' || module.type === 'question'">栏目眉题<input :value="String(module.eyebrow || '')" @input="setIssueModuleText(module, 'eyebrow', $event)" /></label>
              <div v-if="module.type === 'story'" class="form-grid"><label>图片左侧说明<input :value="String(module.captionLeft || '')" maxlength="160" @input="setIssueModuleText(module, 'captionLeft', $event)" /></label><label>图片右侧说明<input :value="String(module.captionRight || '')" maxlength="160" @input="setIssueModuleText(module, 'captionRight', $event)" /></label></div>
              <details v-if="module.type === 'story'" class="issue-module-details"><summary>人物故事详情页</summary><div class="form-grid"><label>详情图片左侧说明<input :value="String(module.detailCaptionLeft || '')" maxlength="160" @input="setIssueModuleText(module, 'detailCaptionLeft', $event)" /></label><label>详情图片右侧说明<input :value="String(module.detailCaptionRight || '')" maxlength="160" @input="setIssueModuleText(module, 'detailCaptionRight', $event)" /></label></div><label>文章来源说明<input :value="String(module.detailSource || '')" maxlength="500" @input="setIssueModuleText(module, 'detailSource', $event)" /></label><label>故事正文第一段<textarea :value="String(module.detailParagraph1 || '')" rows="5" maxlength="6000" @input="setIssueModuleText(module, 'detailParagraph1', $event)" /></label><label>故事正文第二段<textarea :value="String(module.detailParagraph2 || '')" rows="5" maxlength="6000" @input="setIssueModuleText(module, 'detailParagraph2', $event)" /></label><label>结尾引言<textarea :value="String(module.detailQuote || '')" rows="3" maxlength="6000" @input="setIssueModuleText(module, 'detailQuote', $event)" /></label><label>公众号文章链接<input type="url" :value="String(module.officialArticleUrl || '')" placeholder="https://mp.weixin.qq.com/s/..." maxlength="2048" @input="setIssueModuleText(module, 'officialArticleUrl', $event)" /></label><p class="field-help">文章链接需来自 mp.weixin.qq.com。以上内容随期刊草稿保存，发布后在小程序人物故事页显示。</p></details>
              <div v-if="module.type === 'storyAction'" class="form-grid"><label>跳转目标栏目<input :value="String(module.targetId || 'story')" maxlength="64" @input="setIssueModuleText(module, 'targetId', $event)" /></label></div>
              <label v-if="module.type === 'issueMeta'">月份文字<input :value="String(module.month || '')" @input="setIssueModuleText(module, 'month', $event)" /></label>
              <label v-if="module.body !== undefined || ['coverStory','opener','story','question','observationAction','sharedPracticeAction','brandFooter'].includes(module.type)">{{ module.type === 'coverStory' ? '主题说明' : '正文 / 说明' }}<textarea :value="String(module.body || '')" rows="4" maxlength="6000" @input="setIssueModuleText(module, 'body', $event)" /></label>
              <details v-if="module.type === 'contents'" class="issue-module-details"><summary>编辑四条目录内容</summary><div class="form-grid"><label>01 栏目<input :value="String(module.entry1Label || '')" maxlength="80" @input="setIssueModuleText(module, 'entry1Label', $event)" /></label><label>01 说明<input :value="String(module.entry1Summary || '')" maxlength="160" @input="setIssueModuleText(module, 'entry1Summary', $event)" /></label><label>02 栏目<input :value="String(module.entry2Label || '')" maxlength="80" @input="setIssueModuleText(module, 'entry2Label', $event)" /></label><label>02 说明<input :value="String(module.entry2Summary || '')" maxlength="160" @input="setIssueModuleText(module, 'entry2Summary', $event)" /></label><label>03 栏目<input :value="String(module.entry3Label || '')" maxlength="80" @input="setIssueModuleText(module, 'entry3Label', $event)" /></label><label>03 说明<input :value="String(module.entry3Summary || '')" maxlength="160" @input="setIssueModuleText(module, 'entry3Summary', $event)" /></label><label>04 栏目<input :value="String(module.entry4Label || '')" maxlength="80" @input="setIssueModuleText(module, 'entry4Label', $event)" /></label><label>04 说明<input :value="String(module.entry4Summary || '')" maxlength="160" @input="setIssueModuleText(module, 'entry4Summary', $event)" /></label></div><p class="field-help">四项分别链接到人物、微声音、观察和共同实践；目标由小程序固定，不接收自定义路由。</p></details>
              <details v-if="module.type === 'archive'" class="issue-module-details"><summary>编辑策展条目</summary><div class="form-grid"><label>刊期说明<input :value="String(module.entryLabel || '')" maxlength="160" @input="setIssueModuleText(module, 'entryLabel', $event)" /></label><label>档案标题<input :value="String(module.entryTitle || '')" maxlength="160" @input="setIssueModuleText(module, 'entryTitle', $event)" /></label></div><p class="field-help">当前只展示档案预告；旧期详情入口尚未开放。</p></details>
              <div v-if="module.type === 'coverStory'" class="form-grid cover-story-typography"><label>主题标题字号（rpx）<input type="number" min="20" max="120" step="1" :value="Number(module.titleFontSize || 72)" @input="setIssueModuleText(module, 'titleFontSize', $event)" /></label><label>主题标题颜色<input type="color" :value="String(module.titleColor || '#59483d')" @input="setIssueModuleText(module, 'titleColor', $event)" /></label><label>主题说明字号（rpx）<input type="number" min="20" max="120" step="1" :value="Number(module.bodyFontSize || 30)" @input="setIssueModuleText(module, 'bodyFontSize', $event)" /></label><label>主题说明颜色<input type="color" :value="String(module.bodyColor || '#40362f')" @input="setIssueModuleText(module, 'bodyColor', $event)" /></label></div>
              <div v-if="module.type === 'coverStory'" class="form-grid"><label>封面左侧说明<input :value="String(module.captionLeft || '')" @input="setIssueModuleText(module, 'captionLeft', $event)" /></label><label>封面右侧说明<input :value="String(module.captionRight || '')" @input="setIssueModuleText(module, 'captionRight', $event)" /></label><label>策展署名<input :value="String(module.byline || '')" @input="setIssueModuleText(module, 'byline', $event)" /></label></div>
              <section v-if="module.type === 'audio'" class="issue-audio-editor">
                <p class="field-help">最多 3 段；每段可单独替换音频并编辑对应文案。只有发布后，小程序才会显示更新。</p>
                <article v-for="(track, trackIndex) in issueAudioTracks(module)" :key="track.id" class="issue-audio-track">
                  <header><strong>{{ trackIndex === 0 ? '主声音' : `更多声音 ${String(trackIndex + 1).padStart(2, '0')}` }}</strong><button v-if="trackIndex > 0" type="button" class="quiet danger" :disabled="uploading" @click="removeIssueAudioTrack(module, trackIndex)">移除</button></header>
                  <div class="form-grid"><label>声音标题<input :value="track.title" maxlength="120" @input="setIssueAudioTrackText(track, 'title', $event)" /></label><label>时长文字<input :value="track.duration" maxlength="20" placeholder="01:12" @input="setIssueAudioTrackText(track, 'duration', $event)" /></label><label>上传 / 替换音频<input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a" :disabled="uploading" @change="selectIssueAudioTrackFile(module, track, $event)" /></label><label>音频对象路径<input :value="String(track.audioObjectKey || '')" placeholder="content/audio/..." @input="setIssueAudioTrackText(track, 'audioObjectKey', $event)" /></label></div>
                  <audio v-if="issueModulePreviewUrls[issueAudioTrackPreviewKey(module.id, track.id)]" class="media-preview-audio" controls preload="none" :src="issueModulePreviewUrls[issueAudioTrackPreviewKey(module.id, track.id)]">当前浏览器不支持音频试听</audio>
                  <label>引言<textarea :value="track.quote" rows="2" maxlength="500" @input="setIssueAudioTrackText(track, 'quote', $event)" /></label>
                  <label>引言说明<textarea :value="track.subtitle" rows="2" maxlength="500" @input="setIssueAudioTrackText(track, 'subtitle', $event)" /></label>
                  <label>音频文字稿<textarea :value="track.transcript" rows="3" maxlength="6000" @input="setIssueAudioTrackText(track, 'transcript', $event)" /></label>
                </article>
                <button v-if="issueAudioTracks(module).length < 3" type="button" class="secondary" :disabled="uploading" @click="addIssueAudioTrack(module)">＋ 添加声音</button>
              </section>
              <label v-if="module.transcript !== undefined && module.type !== 'audio'">音频文字稿<textarea :value="String(module.transcript || '')" rows="3" maxlength="6000" @input="setIssueModuleText(module, 'transcript', $event)" /></label>
              <label v-if="module.text !== undefined">引言内容<textarea :value="String(module.text || '')" rows="3" maxlength="1000" @input="setIssueModuleText(module, 'text', $event)" /></label>
              <label v-if="module.attribution !== undefined">引言署名<input :value="String(module.attribution || '')" @input="setIssueModuleText(module, 'attribution', $event)" /></label>
              <label v-if="module.caption !== undefined">图片说明<input :value="String(module.caption || '')" @input="setIssueModuleText(module, 'caption', $event)" /></label>
            </article></div>
            <details v-if="activeContentSection === 'journal-home'" class="issue-preview-disclosure">
              <summary>小程序首页预览 <span>展开查看 · 草稿预览，不会发布</span></summary>
              <section class="issue-phone-preview" aria-label="小程序首页草稿预览">
                <div class="issue-phone-preview-head"><span>MYRIAD SHE</span><small>仅预览草稿，不会发布到线上</small></div>
                <div class="issue-phone-preview-body">
                  <article v-for="module in issueForm.draftContent.sections.filter((item) => item.enabled && item.type !== 'storyAction' && !(['observationAction','sharedPracticeAction'].includes(item.type) && issueForm.draftContent.sections.some((section) => section.enabled && section.type === 'question')))" :key="module.id" :class="`preview-${module.type}`">
                    <template v-if="module.type === 'coverStory'">
                      <img v-if="issueModulePreviewUrls[module.id]" class="preview-image" :src="issueModulePreviewUrls[module.id]" :alt="String(module.altText || '')" />
                      <div v-if="issueModulePreviewUrls[module.id]" class="preview-cover-caption"><span>{{ module.captionLeft }}</span><span>{{ module.captionRight }}</span></div>
                      <div class="preview-cover-copy"><small>{{ module.eyebrow || '本期主题' }}</small><h3 :style="{ fontSize: `${Number(module.titleFontSize || 72) * 0.42}px`, color: String(module.titleColor || '#59483d'), whiteSpace: 'pre-wrap' }">{{ module.title || '' }}</h3><p :style="{ fontSize: `${Number(module.bodyFontSize || 30) * 0.42}px`, color: String(module.bodyColor || '#40362f') }">{{ module.body || '' }}</p><footer>{{ module.byline || '' }}</footer></div>
                    </template>
                    <template v-else-if="module.type === 'story'">
                      <div class="preview-story-kicker"><span>01</span><span>{{ module.eyebrow || '人物纪实' }}</span></div><blockquote>{{ module.title || '' }}</blockquote><p class="preview-story-copy">{{ module.body || '' }}</p><div class="preview-story-link">{{ issueForm.draftContent.sections.find((item) => item.type === 'storyAction' && (item.targetId || 'story') === module.id)?.title || '进入本期人物' }} <span>→</span></div><img v-if="issueModulePreviewUrls[module.id]" class="preview-image" :src="issueModulePreviewUrls[module.id]" :alt="String(module.altText || '')" /><div v-else-if="module.imageObjectKey" class="preview-image-placeholder">{{ module.altText || '人物图片预览' }}</div><footer>{{ module.captionLeft }}<span>{{ module.captionRight }}</span></footer>
                    </template>
                    <template v-else-if="module.type === 'audio'">
                      <div class="preview-audio-kicker"><span>02</span><span>{{ String(module.title || '微声音').replace(/\s+0?\d+$/, '') }}</span><time>{{ module.duration }}</time></div>
                      <template v-if="issueAudioTracks(module)[0]" v-for="(track, trackIndex) in issueAudioTracks(module).slice(0, 1)" :key="track.id">
                        <div class="preview-audio-feature"><span class="preview-audio-play">▶</span><div><h3 v-if="track.quote">{{ track.quote }}</h3><p v-if="track.subtitle" class="preview-audio-subtitle">{{ track.subtitle }}</p><p v-if="track.transcript" class="preview-audio-transcript">{{ track.transcript }}</p></div></div>
                      </template>
                      <div v-if="issueAudioTracks(module).length > 1" class="preview-audio-more"><h4>更多声音</h4><div v-for="track in issueAudioTracks(module).slice(1)" :key="track.id" class="preview-audio-more-item"><div class="preview-audio-more-title"><span>▶</span><strong>{{ track.title }}</strong><time>{{ track.duration }}</time></div><p v-if="track.subtitle">{{ track.subtitle }}</p><blockquote v-if="track.quote">{{ track.quote }}</blockquote><p v-if="track.transcript">{{ track.transcript }}</p></div></div>
                    </template>
                    <template v-else-if="module.type === 'question'">
                      <div class="preview-question-kicker"><span>03</span><span>本期问题</span></div><p class="preview-question-intro">{{ module.eyebrow || '从她的经验，回到你的此刻' }}</p><h3 class="preview-question-title">{{ module.title || issueForm.question }}</h3><p v-if="module.body" class="preview-question-body">{{ module.body }}</p>
                      <div v-if="issueForm.draftContent.sections.some((action) => action.enabled && ['observationAction','sharedPracticeAction'].includes(action.type))" class="preview-question-actions"><div v-for="action in issueForm.draftContent.sections.filter((item) => item.enabled && ['observationAction','sharedPracticeAction'].includes(item.type))" :key="action.id" class="preview-question-action"><div><strong>{{ action.title }}</strong><small>{{ action.body }}</small></div><span>→</span></div></div>
                    </template>
                    <template v-else-if="module.type === 'contents'">
                      <div class="preview-contents-heading"><span>{{ module.title || '本期目录' }}</span><small>CONTENTS</small></div>
                      <div v-for="entry in issuePreviewContents(module)" :key="entry.number" class="preview-contents-row"><small>{{ entry.number }}</small><strong>{{ entry.label }}</strong><span>{{ entry.summary }}</span></div>
                    </template>
                    <template v-else-if="module.type === 'archive'">
                      <div class="preview-archive-heading">{{ module.title || '策展档案' }}</div>
                      <div class="preview-archive-entry"><small>{{ module.entryLabel || 'ISSUE 01 · 往期精彩示意' }}</small><strong>{{ module.entryTitle || '留住没有答案的时刻' }}<span>→</span></strong></div>
                    </template>
                    <template v-else-if="module.type === 'brandFooter'">
                      <div class="preview-footer-brand">MYRIAD SHE</div>
                      <div class="preview-footer-title">{{ module.title || '我有我的时节' }}</div>
                      <p class="preview-footer-copy">{{ module.body || '记录真实的女性经验，也为看见之后的生活留下一条可行的路。' }}</p>
                      <div class="preview-footer-flower" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                    </template>
                    <template v-else>
                      <small>{{ module.eyebrow || module.type }}</small><h3>{{ module.title || module.month || '' }}</h3><p>{{ module.body || module.text || module.caption || '' }}</p><img v-if="(module.type === 'cover' || module.type === 'image') && issueModulePreviewUrls[module.id]" class="preview-image" :src="issueModulePreviewUrls[module.id]" :alt="String(module.altText || '')" /><div v-else-if="module.type === 'cover' || module.type === 'image'" class="preview-image-placeholder">{{ module.altText || '图片预览（上传或保存后载入）' }}</div>
                    </template>
                  </article>
                </div>
              </section>
            </details>
            <section v-if="activeContentSection === 'journal-archive'" class="panel journal-past-panel">
              <div class="section-heading"><div><p class="eyebrow">PAST ISSUES</p><h3>往期与归档期次</h3></div><small>由期刊状态自动生成，不能手工新增</small></div>
              <p class="field-help">这里只读展示当前期之外的线上与归档期次；「策展档案」栏目的入口文案在上方编辑。旧期正文仍按各自发布版本保留。</p>
              <div class="journal-past-list">
                <article v-for="item in journalPastIssues" :key="item.id">
                  <div><small>{{ item.month }} · {{ item.code }}</small><strong>{{ item.theme }}</strong><span>{{ journalIssueStatusLabel(item.status) }} · v{{ item.publishedVersion }}</span></div>
                  <button type="button" class="quiet" @click="editIssue(item)">载入此期</button>
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
        <form v-else class="practice-form" @submit.prevent="savePracticeContent">
          <div class="practice-page-fields">
            <RichTextEditor v-model="practiceContent.titleRichText" v-model:font-size="practiceContent.titleFontSize" v-model:color="practiceContent.titleColor" label="页面标题" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
            <RichTextEditor v-model="practiceContent.metaLeftRichText" v-model:font-size="practiceContent.metaLeftFontSize" v-model:color="practiceContent.metaLeftColor" label="左侧页眉（默认：实践）" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
            <RichTextEditor v-model="practiceContent.metaRightRichText" v-model:font-size="practiceContent.metaRightFontSize" v-model:color="practiceContent.metaRightColor" label="右侧页眉（默认：此刻归安）" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
            <RichTextEditor v-model="practiceContent.introRichText" v-model:font-size="practiceContent.introFontSize" v-model:color="practiceContent.introColor" label="页面说明" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
          </div>
          <p v-if="practiceContentConflict" class="error full" role="alert">实践页面已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
          <p v-if="practiceContentDirty && !practiceContentSaving" class="muted" role="status">有未保存的修改。</p>
          <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
          <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
          <div class="form-actions"><button type="submit" :disabled="practiceContentSaving || practiceContentConflict">{{ practiceContentSaving ? '保存中…' : '保存实践页面' }}</button><button v-if="practiceContentConflict" type="button" class="quiet" :disabled="practiceContentSaving" @click="reloadPracticeContent">{{ practiceContentSaving ? '读取中…' : '放弃修改并载入最新版本' }}</button></div>
        </form>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'directory'" id="practice-directory-settings" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE DIRECTORY</p><h2>实践目录设置</h2></div></div>
        <div v-if="!practiceContent" class="practice-empty">
          <p class="muted">实践目录配置尚未读取。</p>
          <button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button>
        </div>
        <form v-else class="practice-form" @submit.prevent="savePracticeContent">
          <div class="directory-toolbar"><p class="muted field-help">拖动暂不开放，目录按此处顺序显示。每个目录都可在标题行右侧直接切换入口状态。</p><button type="button" class="quiet" :disabled="practiceContentSaving || practiceContentConflict || practiceContent.entries.length >= 100" @click="addPracticeEntry">＋ 新增目录</button></div>
          <div class="practice-entry-list">
            <article v-for="(entry, index) in practiceContent.entries" :key="entry.key" class="practice-entry-row" :class="{ expanded: isPracticeEntryExpanded(entry.key) }">
              <div class="practice-entry-header">
                <button type="button" class="practice-entry-toggle" :aria-expanded="isPracticeEntryExpanded(entry.key)" :aria-controls="`practice-entry-panel-${entry.key}`" @click="togglePracticeEntry(entry.key)">
                  <span class="practice-entry-index">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="practice-entry-summary"><strong>{{ entry.title }}</strong><small>实践目录 · 可管理开放状态</small></span>
                  <svg class="practice-entry-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <span class="practice-entry-status"><span class="practice-entry-status-label">入口状态</span><button type="button" class="practice-entry-status-toggle" :class="{ enabled: entry.enabled }" :disabled="practiceContentSaving || practiceContentConflict" :aria-pressed="entry.enabled" :aria-label="`${entry.title}${entry.enabled ? '已开启' : '已关闭'}，点击切换`" @click.stop="togglePracticeEntryEnabled(entry)"><span class="practice-entry-status-dot" aria-hidden="true"></span><span>{{ entry.enabled ? '开启' : '关闭' }}</span></button></span>
              </div>
              <Transition name="directory-panel">
                <div v-if="isPracticeEntryExpanded(entry.key)" :id="`practice-entry-panel-${entry.key}`" class="practice-entry-panel">
                  <div class="practice-entry-lines">
                    <PracticeLineEditor v-model="entry.contextRichText" v-model:font-size="entry.contextFontSize" v-model:color="entry.contextColor" label="第一行 · 情境文案" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                    <PracticeLineEditor v-model="entry.titleRichText" v-model:font-size="entry.titleFontSize" v-model:color="entry.titleColor" label="第二行 · 目录名称" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                    <PracticeLineEditor v-model="entry.descriptionRichText" v-model:font-size="entry.descriptionFontSize" v-model:color="entry.descriptionColor" label="第三行 · 补充说明" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" />
                  </div>
                </div>
              </Transition>
            </article>
          </div>
          <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p>
          <p v-if="practiceContentDirty && !practiceContentSaving" class="muted" role="status">有未保存的目录修改。</p>
          <p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p>
          <p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
          <div class="form-actions"><button type="submit" :disabled="practiceContentSaving || practiceContentConflict">{{ practiceContentSaving ? '保存中…' : '保存草稿' }}</button><button v-if="isSuperAdmin" type="button" class="quiet" :disabled="practiceContentSaving || practiceContentDirty || practiceContentConflict || !practiceContent.draft" @click="publishPracticeContent">发布到小程序</button><button v-if="practiceContentConflict" type="button" class="quiet" :disabled="practiceContentSaving" @click="reloadPracticeContent">{{ practiceContentSaving ? '读取中…' : '放弃修改并载入最新版本' }}</button></div>
        </form>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'observation'" id="practice-observation-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / CONTENT / OBSERVATION</p><h2>此刻观察</h2></div></div>
        <div v-if="!practiceContent" class="practice-empty"><p class="muted">此刻观察内容尚未读取。</p><button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button></div>
        <form v-else class="practice-form" @submit.prevent="savePracticeContent">
          <div class="observation-copy-groups"><section v-for="group in observationCopyGroups" :key="group.title" class="observation-copy-group"><h3>{{ group.title }}</h3><label v-for="field in group.fields" :key="field.key" class="observation-copy-field"><span>{{ field.label }}</span><textarea :value="normalizeObservationCopyForEditor(practiceContent.observationCopy[field.key].richText)" rows="3" maxlength="240" :disabled="practiceContentSaving || practiceContentConflict" @input="updateObservationCopyText(field.key, $event)" /></label></section></div>
          <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p><p v-if="practiceContentDirty && !practiceContentSaving" class="muted" role="status">有未保存的修改。</p><p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p><p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
          <div class="form-actions"><button type="submit" :disabled="practiceContentSaving || practiceContentConflict">{{ practiceContentSaving ? '保存中…' : '保存草稿' }}</button><button v-if="isSuperAdmin" type="button" class="quiet" :disabled="practiceContentSaving || practiceContentDirty || practiceContentConflict || !practiceContent.draft" @click="publishPracticeContent">发布到小程序</button><button v-if="practiceContentConflict" type="button" class="quiet" :disabled="practiceContentSaving" @click="reloadPracticeContent">载入最新版本</button></div>
        </form>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'shared-practice'" id="practice-shared-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / CONTENT / SHARED PRACTICE</p><h2>共同实践目录</h2></div></div>
        <div v-if="!practiceContent" class="practice-empty"><p class="muted">共同实践内容尚未读取。</p><button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button></div>
        <form v-else class="practice-form" @submit.prevent="savePracticeContent">
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

            <section class="practice-copy-block">
              <header><h4>线上 · 讨论说明段落</h4><button type="button" class="quiet" @click="addParagraph">+ 添加段落</button></header>
              <p v-if="!practiceCopyParagraphs.length" class="muted">还没有段落，点击「添加段落」开始。</p>
              <div v-for="(paragraph, index) in practiceCopyParagraphs" :key="`p-${index}`" class="practice-copy-row">
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
              <div v-for="(rule, index) in practiceCopyRules" :key="`r-${index}`" class="practice-copy-rule">
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

          <div class="observation-copy-groups"><section v-for="group in sharedPracticeCopyGroups" :key="group.title" class="observation-copy-group"><h3>{{ group.title }}</h3><RichTextEditor v-for="field in group.fields" :key="field.key" v-model="practiceContent.sharedPracticeCopy[field.key].richText" v-model:font-size="practiceContent.sharedPracticeCopy[field.key].fontSize" v-model:color="practiceContent.sharedPracticeCopy[field.key].color" :label="field.label" :disabled="practiceContentSaving || practiceContentConflict" @change="markPracticeContentDirty" /></section></div>
          <p v-if="practiceContentConflict" class="error full" role="alert">实践内容已被其他管理员更新。本地修改已保留，载入最新版本前不能继续保存。</p><p v-if="practiceContentDirty && !practiceContentSaving" class="muted" role="status">有未保存的修改。</p><p v-if="practiceContentError" class="error" role="alert">{{ practiceContentError }}</p><p v-if="practiceContentMessage" class="status-message" role="status">{{ practiceContentMessage }}</p>
          <div class="form-actions"><button type="submit" :disabled="practiceContentSaving || practiceContentConflict">{{ practiceContentSaving ? '保存中…' : '保存草稿' }}</button><button v-if="isSuperAdmin" type="button" class="quiet" :disabled="practiceContentSaving || practiceContentDirty || practiceContentConflict || !practiceContent.draft" @click="publishPracticeContent">发布到小程序</button><button v-if="practiceContentConflict" type="button" class="quiet" :disabled="practiceContentSaving" @click="reloadPracticeContent">载入最新版本</button></div>
        </form>
      </section>
      <section v-if="activeSection === 'practice' && activeContentSection === 'daily-objects'" id="practice-daily-objects-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRACTICE / DAILY OBJECTS</p><h2>日常之物</h2></div></div>
        <div v-if="!dailyObjectsContent" class="practice-empty"><p class="muted">日常之物设置尚未读取。</p><button class="quiet" :disabled="dashboardLoading" @click="loadDailyObjectsContent">重新读取</button></div>
        <form v-else class="practice-form daily-objects-form" @submit.prevent="saveDailyObjectsContent">
          <section class="daily-shop-gate"><div><h3>商城入口</h3><p>商城功能暂未开放。准备好商品内容后，可在入口状态中一键开启。</p></div><button type="button" class="quiet" @click="openDailyObjectsEntrySettings">设置商城开启状态</button></section>
          <section class="observation-copy-group"><h3>商品页首屏</h3><div class="daily-objects-fields">
            <label>品牌英文<input v-model="dailyObjectsContent.brandName" maxlength="80" @input="markDailyObjectsDirty" /></label><label>品牌中文<input v-model="dailyObjectsContent.brandSubtitle" maxlength="80" @input="markDailyObjectsDirty" /></label>
            <label>英文眉题<input v-model="dailyObjectsContent.eyebrow" maxlength="80" @input="markDailyObjectsDirty" /></label><label>页面标题<input v-model="dailyObjectsContent.title" maxlength="120" @input="markDailyObjectsDirty" /></label>
            <label class="full">页面说明<textarea v-model="dailyObjectsContent.intro" rows="3" maxlength="500" @input="markDailyObjectsDirty"></textarea></label>
            <label>预览说明<input v-model="dailyObjectsContent.previewNote" maxlength="300" @input="markDailyObjectsDirty" /></label><label>联系支持文字<input v-model="dailyObjectsContent.supportLabel" maxlength="120" @input="markDailyObjectsDirty" /></label>
          </div></section>
          <section class="observation-copy-group"><div class="daily-products-heading"><h3>商品与详情</h3><button class="quiet" type="button" :disabled="dailyObjectsSaving || dailyObjectsConflict || dailyObjectsContent.products.length >= 50" @click="addDailyObjectsProduct">＋ 新增商品</button></div>
            <article v-for="(product, index) in dailyObjectsContent.products" :key="product.id" class="daily-product-editor">
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
          <div class="form-actions"><button type="submit" :disabled="dailyObjectsSaving || dailyObjectsConflict">{{ dailyObjectsSaving ? '保存中…' : '保存草稿' }}</button><button v-if="isSuperAdmin" type="button" class="quiet" :disabled="dailyObjectsSaving || dailyObjectsDirty || dailyObjectsConflict || !dailyObjectsContent.draft" @click="publishDailyObjectsContent">发布到小程序</button><button v-if="dailyObjectsConflict" type="button" class="quiet" @click="loadDailyObjectsContent">重新读取</button></div>
        </form>
      </section>
      <section v-if="activeSection === 'content' && activeContentSection === 'privacy-page'" id="privacy-page-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">PRIVACY / ABOUT</p><h2>关于 MYRIAD SHE</h2></div></div>
        <p class="muted">当前线上版本：第 {{ privacyPagePublishedVersion }} 版<span v-if="privacyPagePublishedAt"> · {{ new Date(privacyPagePublishedAt).toLocaleString() }}</span>。修改先保存为草稿，预览确认后再发布。</p>
        <div v-if="!privacyPageContent" class="practice-empty"><p class="muted">关于 MYRIAD SHE 内容尚未读取。</p><button class="quiet" :disabled="privacyPageSaving" @click="reloadPrivacyPageContent">重新读取</button></div>
        <form v-else class="practice-form about-editor-form" @submit.prevent="savePrivacyPageContent">
          <div class="about-editor-layout">
            <section class="observation-copy-group about-fields"><h3>页面内容</h3><label>品牌介绍<textarea v-model="privacyPageContent.brandIntro" rows="6" maxlength="6000" :disabled="privacyPageSaving || privacyPageConflict" @input="markPrivacyPageDirty" /></label><label>内容来源<textarea v-model="privacyPageContent.contentSources" rows="5" maxlength="6000" :disabled="privacyPageSaving || privacyPageConflict" @input="markPrivacyPageDirty" /></label><label>联系方式<textarea v-model="privacyPageContent.contactInfo" rows="3" maxlength="6000" :disabled="privacyPageSaving || privacyPageConflict" @input="markPrivacyPageDirty" /></label></section>
            <aside class="about-draft-preview" aria-label="当前草稿预览"><div class="about-draft-preview-heading"><div><p class="eyebrow">DRAFT PREVIEW</p><h3>预览当前草稿</h3></div><span v-if="privacyPageDirty" class="draft-state">未保存</span><span v-else class="draft-state">草稿预览</span></div><div class="about-preview-content"><p class="about-preview-brand">MYRIAD SHE</p><h4>关于 MYRIAD SHE</h4><section><h5>品牌介绍</h5><p>{{ privacyPageContent.brandIntro }}</p></section><section><h5>内容来源</h5><p>{{ privacyPageContent.contentSources }}</p></section><section><h5>联系方式</h5><p>{{ privacyPageContent.contactInfo }}</p></section></div></aside>
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
      <section v-if="activeSection === 'content' && activeContentSection === 'mine'" id="mine-page-content" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">MY PAGE CONTENT</p><h2>我的页面设置</h2></div></div>
        <div v-if="!minePageContent" class="practice-empty">
          <p class="muted">我的页面设置尚未读取。</p>
          <button class="quiet" :disabled="dashboardLoading" @click="loadDashboard">{{ dashboardLoading ? '读取中…' : '重新读取' }}</button>
        </div>
        <form v-else class="practice-form" @submit.prevent="saveMinePageContent">
          <div class="mine-settings-layout">
            <nav class="mine-editor-tabs" role="tablist" aria-label="我的页面设置模块" aria-orientation="vertical">
              <button id="mine-tab-intro" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'intro' }" :tabindex="minePageEditorTab === 'intro' ? 0 : -1" :aria-selected="minePageEditorTab === 'intro'" aria-controls="mine-panel-intro" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'intro'">我的</button>
              <button id="mine-tab-observations" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'observations' }" :tabindex="minePageEditorTab === 'observations' ? 0 : -1" :aria-selected="minePageEditorTab === 'observations'" aria-controls="mine-panel-observations" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'observations'">01. 我的观察</button>
              <button id="mine-tab-discussions" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'discussions' }" :tabindex="minePageEditorTab === 'discussions' ? 0 : -1" :aria-selected="minePageEditorTab === 'discussions'" aria-controls="mine-panel-discussions" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'discussions'">02. 参与的讨论</button>
              <button id="mine-tab-practice" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'practice' }" :tabindex="minePageEditorTab === 'practice' ? 0 : -1" :aria-selected="minePageEditorTab === 'practice'" aria-controls="mine-panel-practice" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'practice'">03. 线下实践</button>
              <button id="mine-tab-privacy" type="button" role="tab" class="mine-editor-tab" :class="{ active: minePageEditorTab === 'privacy' }" :tabindex="minePageEditorTab === 'privacy' ? 0 : -1" :aria-selected="minePageEditorTab === 'privacy'" aria-controls="mine-panel-privacy" @keydown="moveMinePageEditorTab" @click="minePageEditorTab = 'privacy'">04. 选择与隐私</button>
            </nav>
            <div class="mine-page-fields">
            <section v-show="minePageEditorTab === 'intro'" id="mine-panel-intro" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-intro" tabindex="0">
              <div><p class="eyebrow">MY PAGE</p><h3 id="mine-copy-above">我的</h3></div>
              <RichTextEditor v-model="minePageContent.title" label="主标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.intro" label="说明文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'observations'" id="mine-panel-observations" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-observations" tabindex="0">
              <div><p class="eyebrow">01 · MY OBSERVATIONS</p><h3 id="mine-copy-below">01.我的观察</h3></div>
              <RichTextEditor v-model="minePageContent.observationHeading" label="观察记录区标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.emptyTitle" label="空状态标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.emptyIntro" label="空状态说明" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.startButton" label="观察按钮文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'discussions'" id="mine-panel-discussions" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-discussions" tabindex="0">
              <div><p class="eyebrow">DISCUSSIONS</p><h3 id="mine-copy-discussions">参与的讨论</h3></div>
              <RichTextEditor v-model="minePageContent.discussionHeading" label="模块标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.discussionCount" label="发言计数文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.discussionEmptyAction" label="空状态入口文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.discussionIntro" label="模块说明" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'practice'" id="mine-panel-practice" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-practice" tabindex="0">
              <div><p class="eyebrow">OFFLINE PRACTICE</p><h3 id="mine-copy-practice">线下实践</h3></div>
              <RichTextEditor v-model="minePageContent.practiceHeading" label="模块标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.practiceCount" label="参与次数文字" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.practiceEmptyTitle" label="空状态标题" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
              <RichTextEditor v-model="minePageContent.practiceIntro" label="空状态说明" :disabled="minePageContentSaving || minePageContentConflict" @change="markMinePageContentDirty" />
            </section>
            <section v-show="minePageEditorTab === 'privacy'" id="mine-panel-privacy" class="mine-copy-group" role="tabpanel" aria-labelledby="mine-tab-privacy" tabindex="0">
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
      <section v-if="activeSection === 'contributions'" id="discussion-contributions" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">DISCUSSION / MODERATION</p><h2>用户经历审核</h2></div><div class="section-tools"><button type="button" class="quiet" :disabled="discussionContributionLoading" @click="refreshDiscussionContributions">{{ discussionContributionLoading ? '刷新中…' : '刷新' }}</button></div></div>
        
        <p v-if="discussionContributionActionMessage" class="status-message" role="status">{{ discussionContributionActionMessage }}</p>
        <p v-if="discussionContributionError" class="error" role="alert">{{ discussionContributionError }}</p>
        <div class="filters" aria-label="用户经历筛选"><label>处理状态<select v-model="discussionContributionStatus" @change="refreshDiscussionContributions"><option value="pending">待处理</option><option value="handled">已处理</option><option value="dismissed">不采纳</option><option value="">全部</option></select></label><label>期刊<select v-model="discussionContributionIssueCode" @change="refreshDiscussionContributions"><option value="">全部期刊</option><option v-for="issue in issues" :key="issue.code" :value="issue.code">{{ issue.label }}</option></select></label></div>
        <div class="discussion-contribution-table" aria-live="polite">
          <div class="discussion-contribution-head"><span>期刊 / 回复对象</span><span>状态</span><span>更新时间</span><span>内容</span></div>
          <div v-for="record in discussionContributions" :key="record.id" class="discussion-contribution-row">
            <span><strong>{{ record.issueLabel || record.issueCode }}</strong><small>{{ record.threadAuthor ? `回复 ${record.threadAuthor}` : '本期经历' }}</small></span>
            <span>{{ record.status === 'pending' ? '待处理' : record.status === 'handled' ? '已处理' : '不采纳' }}</span>
            <span>{{ displayDate(record.updatedAt) }}</span>
            <span><button type="button" class="quiet observation-view-button" @click="viewDiscussionContribution(record)">查看正文</button></span>
          </div>
          <p v-if="discussionContributionLoading && !discussionContributions.length" class="muted" role="status">正在读取用户经历…</p>
          <p v-else-if="!discussionContributionLoading && !discussionContributions.length" class="muted">当前筛选下没有用户经历。</p>
          <div v-if="discussionContributionHasMore || discussionContributionMoreError" class="table-actions"><button type="button" class="quiet" :disabled="discussionContributionLoadingMore" @click="discussionContributionMoreError ? refreshDiscussionContributions() : loadMoreDiscussionContributions()">{{ discussionContributionLoadingMore ? '加载中…' : discussionContributionMoreError || '加载更多经历' }}</button></div>
        </div>
        <Teleport to="body">
<div v-if="selectedDiscussionContributionLoading || selectedDiscussionContributionError || selectedDiscussionContribution" class="observation-modal-backdrop" @click.self="selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">
          <section class="observation-detail-panel discussion-contribution-detail" role="dialog" aria-modal="true" aria-labelledby="discussion-contribution-title" aria-live="polite" tabindex="-1" @keydown.esc="selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">
            <div class="section-heading"><div><p class="eyebrow">USER EXPERIENCE</p><h3 id="discussion-contribution-title">经历正文</h3></div><button type="button" class="quiet" aria-label="关闭经历正文" @click="selectedDiscussionContribution = null; selectedDiscussionContributionError = ''; discussionContributionActionMessage = ''">关闭</button></div>
          <div class="panel-body">
            <p v-if="selectedDiscussionContributionLoading" class="muted" role="status">正在读取并解密经历…</p>
            <p v-else-if="selectedDiscussionContributionError" class="error" role="alert">{{ selectedDiscussionContributionError }}</p>
            <template v-else-if="selectedDiscussionContribution">
              <p class="muted observation-detail-meta">{{ selectedDiscussionContribution.issueLabel }} · {{ selectedDiscussionContribution.threadAuthor ? `回复 ${selectedDiscussionContribution.threadAuthor}` : '本期经历' }} · {{ selectedDiscussionContribution.status === 'pending' ? '待处理' : selectedDiscussionContribution.status === 'handled' ? '已处理' : '不采纳' }}</p>
              <article class="discussion-contribution-body">{{ selectedDiscussionContribution.body }}</article>
              <p v-if="discussionContributionActionMessage" class="status-message" role="status">{{ discussionContributionActionMessage }}</p>
              <div class="form-actions discussion-contribution-actions">
                <button type="button" :disabled="discussionContributionSaving || selectedDiscussionContribution.status === 'handled'" @click="updateDiscussionContributionStatus('handled')">{{ discussionContributionSaving ? '保存中…' : '标记已处理' }}</button>
                <button type="button" class="quiet danger" :disabled="discussionContributionSaving || selectedDiscussionContribution.status === 'dismissed'" @click="updateDiscussionContributionStatus('dismissed')">标记不采纳</button>
                <button type="button" class="quiet" :disabled="discussionContributionSaving || selectedDiscussionContribution.status === 'pending'" @click="updateDiscussionContributionStatus('pending')">重新打开</button>
              </div>
            </template>
          </div>
        </section>
        </div>
</Teleport>
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
      <section v-if="activeSection === 'audit'" id="audit-logs" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">AUDIT</p><h2>操作审计</h2></div></div>
        <div class="filters" aria-label="操作审计筛选"><label>执行者<select v-model="auditActorType" @change="refreshAudit"><option value="">全部</option><option value="user">用户</option><option value="admin">管理员</option><option value="system">系统</option></select></label><label class="audit-action-filter">操作名称<input v-model="auditAction" maxlength="120" placeholder="例如 observation.saved" @keyup.enter="refreshAudit" /></label><button class="quiet audit-filter-button" @click="refreshAudit">筛选</button></div>
        <div class="observation-table">
          <div class="observation-head audit-head"><span>时间</span><span>操作</span><span>资源</span><span>执行者</span></div>
          <div v-for="entry in auditLogs" :key="entry.id" class="observation-row audit-head"><span>{{ entry.createdAt }}</span><span>{{ entry.action }}</span><span>{{ entry.resourceType }}</span><span>{{ entry.actorType }}</span></div>
          <p v-if="!auditLogs.length" class="muted">暂无操作记录。</p>
          <div v-if="auditHasMore || auditMoreError" class="table-actions"><button class="quiet" :disabled="auditLoadingMore" @click="loadMoreAudit">{{ auditLoadingMore ? '加载中…' : auditMoreError || '加载更多审计记录' }}</button></div>
        </div>
      </section>
      <section v-if="activeSection === 'members'" id="member-directory" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">MEMBER DIRECTORY</p><h2>会员列表</h2></div></div>
        <div class="filters member-filters" aria-label="会员筛选"><label>昵称、ID 或手机号后四位<input v-model="memberQuery" maxlength="80" placeholder="搜索会员资料" @keyup.enter="refreshMembers()" /></label><label>注册自<input v-model="memberFrom" type="date" /></label><label>注册至<input v-model="memberTo" type="date" /></label><button class="quiet" :disabled="memberLoading" @click="refreshMembers()">{{ memberLoading ? '读取中…' : '筛选会员' }}</button></div>
        <p v-if="memberError" class="error" role="alert">{{ memberError }}</p>
        <p class="muted">当前条件 {{ memberTotal }} 位会员</p>
        <div class="observation-table">
          <div class="observation-head member-head"><span>会员资料</span><span>注册时间</span><span>手机号</span><span>观察记录</span><span>账号状态</span><span>详情 / 管理</span></div>
          <div v-for="member in members" :key="member.id" class="observation-row member-head"><div class="member-summary"><img v-if="member.avatarUrl" class="member-avatar" :src="member.avatarUrl" :alt="member.nickname || '会员头像'" /><span v-else class="member-avatar-placeholder" aria-hidden="true">{{ member.nickname ? member.nickname.slice(0, 1) : 'M' }}</span><span class="member-summary-copy"><strong>{{ member.nickname || '未设置昵称' }}</strong><small class="mono">{{ member.id }}</small></span></div><span>{{ displayDate(member.createdAt) }}</span><span class="member-phone">{{ member.phoneNumber || member.phoneMasked || '未绑定' }}</span><span>{{ member.observationCount }}</span><span>{{ member.status === 'active' ? '正常' : '已停用' }}</span><span class="member-actions"><button class="quiet" @click="showMember(member.id)">详情</button><button v-if="isSuperAdmin" class="quiet" @click="toggleMemberStatus(member)">{{ member.status === 'active' ? '停用' : '恢复' }}</button></span></div>
          <p v-if="!members.length && !memberLoading" class="muted">没有找到会员记录。</p>
          <div v-if="memberOffset < memberTotal" class="table-actions"><button class="quiet" :disabled="memberLoading" @click="refreshMembers(true)">加载更多会员</button></div>
        </div>
        <Teleport to="body">
<div v-if="memberDetail" class="observation-modal-backdrop" @click.self="memberDetail = null"><section class="observation-detail-panel" role="dialog" aria-modal="true" aria-labelledby="member-detail-title"><div class="section-heading"><div><p class="eyebrow">MEMBER ACCOUNT</p><h3 id="member-detail-title">会员详情</h3></div><button class="quiet" @click="memberDetail = null">关闭</button></div>
          <div class="panel-body"><div class="member-detail-profile"><img v-if="memberDetail.avatarUrl" class="member-avatar" :src="memberDetail.avatarUrl" :alt="memberDetail.nickname || '会员头像'" /><span v-else class="member-avatar-placeholder" aria-hidden="true">{{ memberDetail.nickname ? memberDetail.nickname.slice(0, 1) : 'M' }}</span><strong>{{ memberDetail.nickname || '未设置昵称' }}</strong></div><p class="mono">{{ memberDetail.id }}</p><p>注册时间：{{ displayDate(memberDetail.createdAt) }}</p><p>手机号：{{ memberDetail.phoneNumber || memberDetail.phoneMasked || '未绑定' }}</p><p>微信 OpenID：{{ memberDetail.openId }}</p><p>微信 UnionID：{{ memberDetail.maskedUnionId || '未提供' }}</p><p>观察记录：{{ memberDetail.observationCount }} 条（详情内容不在此页读取）</p><h4>账户隐私申请</h4><p v-if="!memberDetail.privacyRequests?.length" class="muted">暂无隐私申请。</p><p v-for="item in memberDetail.privacyRequests" :key="item.id">{{ item.status }} · {{ displayDate(item.requestedAt) }} · 计划 {{ displayDate(item.scheduledFor) }}</p><p v-if="!isSuperAdmin" class="muted">客服仅查看申请状态；处理与删除操作由超级管理员执行。</p>
          </div>
        </section></div>
</Teleport>
      </section>
      <section v-if="activeSection === 'life-card-views'" id="life-card-views" class="content-area">
  <div class="section-heading"><div><p class="eyebrow">LIFE CARD VIEWS</p><h2>生命牌查看</h2></div></div>
  <p v-if="lifeCardViewsError" class="error" role="alert">{{ lifeCardViewsError }}</p>
  <div class="life-card-view-filters">
    <label>开始日期<input v-model="lifeCardViewFilter.from" type="date" /></label>
    <label>结束日期<input v-model="lifeCardViewFilter.to" type="date" /></label>
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
        <div class="section-heading"><div><p class="eyebrow">BUSINESS SETTINGS</p><h2>系统设置</h2></div></div>
        <p v-if="settingsError" class="error" role="alert">{{ settingsError }}</p><p v-if="settingsMessage" class="status-message" role="status">{{ settingsMessage }}</p>
        <div class="settings-form"><label class="setting-toggle"><span><strong>商城开放</strong><small>总开关：关闭时小程序不展示「日常之物」的商品与价格；开启后还需在「实践 → 实践目录设置」启用「日常之物」入口才会展示。</small></span><input v-model="systemSettings.store_enabled" type="checkbox" :disabled="settingsLoading || !isSuperAdmin" /></label><label>维护公告<textarea v-model="systemSettings.maintenance_notice" rows="3" maxlength="500" :disabled="settingsLoading || !isSuperAdmin" placeholder="可留空" /></label><label>联系支持<textarea v-model="systemSettings.support_contact" rows="2" maxlength="200" :disabled="settingsLoading || !isSuperAdmin" placeholder="可填写客服渠道或邮箱" /></label><div v-if="isSuperAdmin" class="topbar-actions"><button :disabled="settingsSaving || settingsLoading || JSON.stringify(systemSettings) === JSON.stringify(systemSettingsOriginal)" @click="saveSystemSettings">{{ settingsSaving ? '保存中…' : '保存系统设置' }}</button><button class="quiet" :disabled="settingsSaving" @click="systemSettings = { ...systemSettingsOriginal }; settingsError = ''">撤销修改</button></div><p v-else class="muted">当前账号仅可查看设置。</p></div>
      </section>
      <section v-if="activeSection === 'employees' && isSuperAdmin" id="employee-access" class="content-area">
        <div class="section-heading"><div><p class="eyebrow">STAFF ACCESS</p><h2>员工与权限</h2></div><button @click="createEmployeeOpen = true; employeeError = ''; employeeMessage = ''">创建员工账号</button></div>
        <p v-if="employeeError" class="error" role="alert">{{ employeeError }}</p><p v-if="employeeMessage" class="status-message" role="status">{{ employeeMessage }}</p>
        <p class="muted">员工当前支持内容编辑和客服只读；敏感会员操作保留给超级管理员。</p>
        <div class="observation-table"><div class="observation-head employee-head"><span>员工</span><span>账号</span><span>角色</span><span>状态 / 最近登录</span><span>管理</span></div><div v-for="employee in employees" :key="employee.id" class="observation-row employee-head"><span>{{ employee.displayName }}</span><span>{{ employee.username }}</span><span><select :value="employee.role" :disabled="employee.role === 'super_admin'" aria-label="员工角色" @change="updateEmployee(employee, { role: ($event.target as HTMLSelectElement).value as Employee['role'] })"><option value="super_admin" disabled>超级管理员（受控账号）</option><option value="content_editor">内容编辑</option><option value="support_readonly">客服只读</option></select></span><span>{{ employee.status === 'active' ? '启用' : '已停用' }}<small>最近登录：{{ employee.lastLoginAt ? displayDate(employee.lastLoginAt) : '暂无' }}</small></span><span><button class="quiet" :disabled="employee.role === 'super_admin'" @click="updateEmployee(employee, { status: employee.status === 'active' ? 'disabled' : 'active' })">{{ employee.status === 'active' ? '停用' : '启用' }}</button><button class="quiet" :disabled="employee.role === 'super_admin'" @click="resetEmployeePassword(employee)">重置密码</button></span></div><p v-if="!employees.length && !employeeLoading" class="muted">暂无数据库员工账号。当前环境管理员仍可使用部署配置的超级管理员登录。</p></div>
        <Teleport to="body">
<div v-if="createEmployeeOpen" class="observation-modal-backdrop" @click.self="createEmployeeOpen = false"><section class="observation-detail-panel employee-create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-employee-title" @keydown.esc="createEmployeeOpen = false"><div class="section-heading"><div><p class="eyebrow">NEW STAFF ACCOUNT</p><h3 id="create-employee-title">创建员工账号</h3></div><button type="button" class="quiet" aria-label="关闭创建员工账号" @click="createEmployeeOpen = false">关闭</button></div>
          <div class="panel-body"><form class="employee-form" @submit.prevent="createEmployee"><label>登录账号<input v-model="employeeForm.username" required minlength="3" maxlength="64" autocomplete="off" /></label><label>员工姓名<input v-model="employeeForm.displayName" required maxlength="80" /></label><label>初始密码（至少 12 位）<input v-model="employeeForm.password" type="password" required minlength="12" maxlength="256" autocomplete="new-password" /></label><label>角色<select v-model="employeeForm.role"><option value="content_editor">内容编辑</option><option value="support_readonly">客服只读</option></select></label><p v-if="employeeError" class="error" role="alert">{{ employeeError }}</p><div class="topbar-actions"><button type="submit" :disabled="employeeSaving">{{ employeeSaving ? '创建中…' : '确认创建' }}</button><button type="button" class="quiet" :disabled="employeeSaving" @click="createEmployeeOpen = false">取消</button></div></form>
          </div>
        </section></div>
</Teleport>
      </section>
        </div>
      </div>
    </template>
    </main>
    <footer v-if="!loggedIn" class="filing-footer" aria-label="网站备案信息">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">蜀ICP备2026044906号-1</a>
    </footer>
  </div>
</template>
