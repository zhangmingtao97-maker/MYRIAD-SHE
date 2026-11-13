import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent, PublicHomeModule } from '../../utils/content';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
import { buildMicroVoice } from '../../utils/micro-voice';
import { richTextHtml, richTextWithSuffixHtml } from '../../utils/rich-text';
import { fetchBrandPopup, markBrandPopupShown, shouldShowBrandPopup } from '../../utils/brand-popup';
import type { BrandPopupConfig } from '../../utils/brand-popup';
import { createRecoverableAudio } from '../../utils/recoverable-audio';
import { refreshAudioSource } from '../../utils/audio-source';
import { homeContentSignature, mediaIdentity, retainMediaUrls } from '../../utils/home-update';

type HomeIssue = NonNullable<PublicHomeContent['issue']>;
type HomeContentsDestination = 'story' | 'audio' | 'observation' | 'discussion';
interface HomeContentsEntry {
  id: HomeContentsDestination;
  number: string;
  label: string;
  labelHtml: string;
  summary: string;
  summaryHtml: string;
  destination: HomeContentsDestination;
}
const emptyIssue: HomeIssue = {
  code: '', label: '', labelRichText: '', month: '', monthRichText: '', theme: '', themeRichText: '',
  question: '', questionRichText: '', microVoiceTitle: null, microVoiceDuration: null,
  homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f',
  homeCoverCaptionLeft: '', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '',
  homeCoverCaptionRightRichText: '', homeBackgroundUrl: '',
};
// 首页第一栏排成「当期策展 / ISSUE 02 / SEPTEMBER 2026 · 英文刊期标识」三行。
const ISSUE_KICKER = '当期策展';
const DEFAULT_HOME_INTRODUCTION = '记录女性的真实经历，也邀请你观察自己的生活';
const HOME_CONTENT_CACHE_KEY = 'myriad_she_home_content_cache_v1';
// Audio and video URLs are signed, so local page data may be reused for at most 45 minutes.
const HOME_CONTENT_CACHE_TTL_MS = 45 * 60 * 1000;
interface HomeContentCache {
  savedAt: number;
  data: PublicHomeContent;
}
const EDITION_TAGLINE = 'A CURATED EDITION';
const emptyIssueHeader = {
  kicker: ISSUE_KICKER,
  kickerHtml: richTextHtml('', ISSUE_KICKER),
  number: '',
  numberHtml: '',
  edition: '',
  editionHtml: '',
};
const englishMonthNames: Record<string, string> = {
  JAN: 'JANUARY', FEB: 'FEBRUARY', MAR: 'MARCH', APR: 'APRIL', MAY: 'MAY', JUN: 'JUNE',
  JUL: 'JULY', AUG: 'AUGUST', SEP: 'SEPTEMBER', SEPT: 'SEPTEMBER', OCT: 'OCTOBER', NOV: 'NOVEMBER', DEC: 'DECEMBER',
};

function readHomeContentCache(): PublicHomeContent | null {
  try {
    const cached = wx.getStorageSync(HOME_CONTENT_CACHE_KEY) as unknown;
    if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return null;
    const { savedAt, data } = cached as Partial<HomeContentCache>;
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
    const age = Date.now() - savedAt;
    if (age < 0 || age > HOME_CONTENT_CACHE_TTL_MS || !isPublicHomeContent(data)) {
      if (age < 0 || age > HOME_CONTENT_CACHE_TTL_MS) wx.removeStorageSync(HOME_CONTENT_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveHomeContentCache(data: PublicHomeContent) {
  try {
    wx.setStorageSync(HOME_CONTENT_CACHE_KEY, { savedAt: Date.now(), data } satisfies HomeContentCache);
  } catch {
    // Storage pressure should never prevent the live page from rendering.
  }
}

function formatAudioTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function withModuleHtml(module: PublicHomeModule): PublicHomeModule {
  return {
    ...module,
    titleHtml: richTextHtml(module.titleRichText, module.title, ''),
    bodyHtml: richTextHtml(module.bodyRichText, module.body, ''),
    eyebrowHtml: richTextHtml(module.eyebrowRichText, module.eyebrow, ''),
    captionHtml: richTextHtml(module.captionRichText, module.caption, ''),
    captionLeftHtml: richTextHtml(module.captionLeftRichText, module.captionLeft, ''),
    captionRightHtml: richTextHtml(module.captionRightRichText, module.captionRight, ''),
    textHtml: richTextHtml(module.textRichText, module.text, ''),
    attributionHtml: richTextHtml(module.attributionRichText, module.attribution, ''),
    entryLabelHtml: richTextHtml(module.entryLabelRichText, module.entryLabel, ''),
    entryTitleHtml: richTextHtml(module.entryTitleRichText, module.entryTitle, ''),
    linkLabelHtml: richTextHtml(module.linkLabelRichText, module.linkLabel, ''),
    storyActionTitleHtml: richTextHtml(module.storyActionTitleRichText, module.storyActionTitle, ''),
    bylineHtml: richTextHtml(module.bylineRichText, module.byline, ''),
  };
}

function combineCoverAndOpener(modules: PublicHomeModule[]) {
  const result: PublicHomeModule[] = [];
  const coverIndex = modules.findIndex((module) => module.type === 'coverStory' || module.type === 'cover');
  const openerIndex = modules.findIndex((module) => module.type === 'opener');
  if (coverIndex >= 0 && openerIndex >= 0) {
    const cover = modules[coverIndex];
    const opener = modules[openerIndex];
    const combined: PublicHomeModule = {
      ...cover,
      ...opener,
      id: cover.id,
      type: 'coverStory',
      order: Math.min(cover.order, opener.order),
      enabled: cover.enabled || opener.enabled,
      imageUrl: cover.imageUrl || '',
      imageObjectKey: cover.imageObjectKey || '',
      altText: cover.altText || '',
      captionLeft: cover.captionLeft || '',
      captionLeftRichText: cover.captionLeftRichText || '',
      captionRight: cover.captionRight || '',
      captionRightRichText: cover.captionRightRichText || '',
      eyebrow: opener.eyebrow || '本期主题',
      eyebrowRichText: opener.eyebrowRichText || '',
      title: opener.title || '',
      titleRichText: opener.titleRichText || '',
      titleFontSize: opener.titleFontSize || 72,
      titleColor: opener.titleColor || '#59483d',
      body: opener.body || '',
      bodyRichText: opener.bodyRichText || '',
      bodyFontSize: opener.bodyFontSize || 30,
      bodyColor: opener.bodyColor || '#40362f',
      byline: cover.byline || '策展与编辑 · MYRIAD SHE',
      bylineRichText: cover.bylineRichText || '',
    };
    modules.forEach((module, index) => {
      if (index === coverIndex) result.push(combined);
      else if (index !== openerIndex) result.push(module);
    });
  } else {
    result.push(...modules);
  }
  return result.sort((left, right) => left.order - right.order);
}

function presentHomeModules(modules: PublicHomeModule[], issue: HomeIssue) {
  const prepared = modules.map((module) => {
    if (module.type !== 'audio') return withModuleHtml(module);
    const voice = buildMicroVoice(module);
    if (!voice) return withModuleHtml(module);
    const preparedTracks = voice.tracks.map((track) => ({
      ...track,
      playbackId: `${module.id}:${track.id}`,
      videoId: `home-video-${module.id}-${track.id}`,
    }));
    const displayTitle = String(module.title || '微声音').replace(/\s+0?\d+$/, '');
    return withModuleHtml({
      ...module,
      tracks: preparedTracks,
      primaryTrack: preparedTracks[0],
      displayTitle,
      displayTitleHtml: richTextHtml(module.titleRichText, displayTitle || '微声音'),
    });
  });
  const embeddedActions = new Set<string>();
  const withStoryActions = prepared.map((module) => {
    if (module.type !== 'story') return module;
    const action = prepared.find((candidate) => candidate.type === 'storyAction' && (candidate.targetId || 'story') === module.id);
    if (!action) return module;
    embeddedActions.add(action.id);
    const storyActionTitle = action.title || '进入本期人物';
    return {
      ...module,
      storyActionTitle,
      storyActionTitleHtml: richTextHtml(action.titleRichText, storyActionTitle),
    };
  });
  const withQuestionActions = withStoryActions.map((module) => {
    if (module.type !== 'question') return module;
    const actions = withStoryActions.filter((candidate) => candidate.type === 'observationAction' || candidate.type === 'sharedPracticeAction');
    actions.forEach((action) => embeddedActions.add(action.id));
    return {
      ...module,
      questionActions: actions,
      titleHtml: module.titleHtml || richTextHtml(issue.questionRichText, issue.question, ''),
    };
  });
  return withQuestionActions
    .filter((module) => !embeddedActions.has(module.id))
    .filter((module) => module.type !== 'audio' || Boolean((module as PublicHomeModule & { primaryTrack?: unknown }).primaryTrack));
}

function buildContentsEntries(modules: PublicHomeModule[], issue: HomeIssue): HomeContentsEntry[] {
  const directory = modules.find((module) => module.type === 'contents');
  if (!directory) return [];
  const audio = modules.find((module) => module.type === 'audio');
  const text = (field: string, fallback: string) => {
    const value = directory[field];
    return typeof value === 'string' && value.trim() ? value : fallback;
  };
  const rich = (field: string, fallback = '') => {
    const value = directory[field];
    return typeof value === 'string' && value.trim() ? value : fallback;
  };
  const entry = (
    id: HomeContentsDestination,
    number: string,
    labelField: string,
    summaryField: string,
    labelFallback: string,
    summaryFallback: string,
    labelRichFallback = '',
    summaryRichFallback = '',
  ): HomeContentsEntry => {
    const label = text(labelField, labelFallback);
    const summary = text(summaryField, summaryFallback);
    const labelRichText = rich(`${labelField}RichText`, labelRichFallback);
    const summaryRichText = rich(`${summaryField}RichText`, summaryRichFallback);
    return {
      id,
      number,
      label,
      labelHtml: richTextHtml(labelRichText, label, label),
      summary,
      summaryHtml: richTextHtml(summaryRichText, summary, summary),
      destination: id,
    };
  };
  return [
    entry('story', '01', 'entry1Label', 'entry1Summary', '人物纪实', issue.theme, '', issue.themeRichText),
    entry('audio', '02', 'entry2Label', 'entry2Summary', '微声音', String(audio?.subtitle || '第一个普通早晨'), '', String(audio?.subtitleRichText || '')),
    entry('observation', '03', 'entry3Label', 'entry3Summary', '此刻观察', '从本期问题继续'),
    entry('discussion', '04', 'entry4Label', 'entry4Summary', '本期讨论', '一起听见不同的经历'),
  ];
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// 英文刊期按杂志排印展开缩写（SEP 2026 → SEPTEMBER 2026）；中文月份写法保持原样。
function expandIssueMonth(value: string) {
  return value.toUpperCase().replace(
    /(^|[^A-Z])(SEPT|SEP|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|OCT|NOV|DEC)\.?(?![A-Z])/g,
    (_match, prefix: string, month: string) => `${prefix}${englishMonthNames[month] || month}`,
  );
}

function buildIssueHeader(modules: PublicHomeModule[], issue: HomeIssue) {
  const meta = modules.find((module) => module.type === 'issueMeta');
  const label = textValue(meta?.eyebrow) || textValue(issue.label);
  const labelRichText = textValue(meta?.eyebrowRichText) || textValue(issue.labelRichText);
  const codeDigits = textValue(issue.code).match(/(\d+)/);
  const number = (label || (codeDigits ? `ISSUE ${codeDigits[1].padStart(2, '0')}` : '')).toUpperCase();
  const month = textValue(meta?.month) || textValue(issue.month);
  const monthRichText = textValue(meta?.monthRichText) || textValue(issue.monthRichText);
  const monthText = month ? expandIssueMonth(month) : '';
  const editionText = meta?.edition === undefined ? EDITION_TAGLINE : textValue(meta.edition).trim();
  const edition = [monthText, editionText].filter(Boolean).join(' · ');
  const editionSuffix = editionText ? `${monthText ? ' · ' : ''}${editionText}` : '';
  return {
    kicker: ISSUE_KICKER,
    kickerHtml: richTextHtml('', ISSUE_KICKER),
    number,
    numberHtml: richTextHtml(labelRichText, number, number),
    edition,
    editionHtml: edition
      ? (monthRichText
        ? richTextWithSuffixHtml(monthRichText, monthText || editionText, edition, editionSuffix)
        : richTextHtml('', edition))
      : '',
  };
}

Page({
  data: { updateAvailable: false, refreshError: '', editorialRevealed: {} as Record<string, boolean>, imagesReady: {} as Record<string, boolean>, loading: true, contentVisible: false, statusBarHeight: 0, brandPopup: null as BrandPopupConfig | null, homeIntroduction: DEFAULT_HOME_INTRODUCTION, issue: emptyIssue, issueHeader: { ...emptyIssueHeader }, question: '', coverUrl: '', microVoice: null as PublicHomeContent['microVoice'] | null, sections: [] as string[], modules: [] as PublicHomeModule[], contentsEntries: [] as HomeContentsEntry[], hasModules: false, error: '', bufferingAudioId: '', audioErrorId: '', audioPlaybackError: '', playingAudioId: '', activeAudioId: '', audioSeeking: false, audioCurrentTime: 0, audioDuration: 0, audioCurrentTimeLabel: '00:00', audioDurationLabel: '00:00', audioProgressPercent: 0 },
  requestGeneration: 0,
  contentRequestInFlight: false,
  currentContentSignature: '',
  pendingHomeContent: null as PublicHomeContent | null,
  brandPopupGeneration: 0,
  audioContext: null as WechatMiniprogram.InnerAudioContext | null,
  audioContextModuleId: '',
  audioSession: null as ReturnType<typeof createRecoverableAudio> | null,
  activeVideoId: '',
  audioSeekRect: null as { left: number; width: number } | null,
  audioSeekTrackId: '',
  audioSeekPlaybackId: '',
  audioSeekResume: false,
  audioSeekPendingX: null as number | null,
  audioSeekEnded: false,
  motionObserver: null as WechatMiniprogram.IntersectionObserver | null,
  motionReady: false,
  motionHidden: false,
  onLoad() {
    enableShareMenu();
    const cached = readHomeContentCache();
    if (cached) this.applyHomeContent(cached);
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadContent();
    void this.loadBrandPopup();
  },
  onShow() {
    this.motionHidden = false;
    if (this.motionReady) this.observeEditorialModules();
    if (!this.contentRequestInFlight) void this.loadContent();
  },
  onReady() {
    this.motionReady = true;
    this.observeEditorialModules();
    if (this.data.brandPopup) this.setBrandTabBarHidden(true);
  },
  onHide() {
    this.motionHidden = true;
    this.disconnectEditorialObserver();
    // Public content is ordinary view data. Invalidate a hidden-page read so
    // an older response cannot repaint on return.
    this.requestGeneration += 1;
    this.contentRequestInFlight = false;
    this.brandPopupGeneration += 1;
    if (this.data.brandPopup) this.setData({ brandPopup: null });
    this.setBrandTabBarHidden(false);
    if (this.data.loading) this.setData({ loading: false });
    this.stopVideoPlayback();
    this.stopAudioPlayback();
  },
  onUnload() {
    this.motionHidden = true;
    this.disconnectEditorialObserver();
    this.requestGeneration += 1;
    this.contentRequestInFlight = false;
    this.brandPopupGeneration += 1;
    this.setBrandTabBarHidden(false);
    this.stopVideoPlayback();
    this.stopAudioPlayback(false);
  },
  async loadBrandPopup() {
    const generation = ++this.brandPopupGeneration;
    const popup = await fetchBrandPopup();
    if (generation !== this.brandPopupGeneration || !popup || !shouldShowBrandPopup(popup.frequency)) return;
    this.setBrandTabBarHidden(true);
    this.setData({ brandPopup: popup });
  },
  setBrandTabBarHidden(hidden: boolean) {
    const getTabBar = (this as unknown as { getTabBar?: () => { setData?: (data: { brandPopupHidden: boolean }) => void } | undefined }).getTabBar;
    const tabBar = getTabBar?.call(this);
    tabBar?.setData?.({ brandPopupHidden: hidden });
  },
  onBrandPopupClose() {
    this.setData({ brandPopup: null });
    this.setBrandTabBarHidden(false);
  },
  onBrandPopupShown() {
    if (this.data.brandPopup) markBrandPopupShown(this.data.brandPopup.frequency);
  },
  applyHomeContent(data: PublicHomeContent) {
    this.currentContentSignature = homeContentSignature(data);
    const supported = new Set(['issueMeta', 'coverStory', 'cover', 'opener', 'story', 'storyAction', 'image', 'quote', 'audio', 'question', 'observationAction', 'sharedPracticeAction', 'contents', 'archive', 'brandFooter']);
    const orderedModules = (data.modules || []).filter((module) => module.enabled && supported.has(module.type)).sort((left, right) => left.order - right.order);
    const combinedModules = combineCoverAndOpener(orderedModules);
    const issue = data.issue ? { ...data.issue } : emptyIssue;
    const sameIssue = this.data.issue.code === issue.code;
    if (sameIssue && mediaIdentity(issue.homeBackgroundUrl) === mediaIdentity(this.data.issue.homeBackgroundUrl)) issue.homeBackgroundUrl = this.data.issue.homeBackgroundUrl;
    const modules = presentHomeModules(combinedModules, issue).map((module) => sameIssue ? retainMediaUrls(module, this.data.modules.find((old) => old.id === module.id)) : module);
    const allTracks = (rows: typeof modules) => rows.flatMap((module) => Array.isArray(module.tracks) ? module.tracks as Array<Record<string, unknown>> : []);
    const previousTracks = allTracks(this.data.modules);
    const nextTracks = allTracks(modules);
    if (this.data.activeAudioId) {
      const previous = previousTracks.find((track) => track.playbackId === this.data.activeAudioId);
      const next = nextTracks.find((track) => track.playbackId === this.data.activeAudioId);
      if (!next || mediaIdentity(previous?.audioUrl) !== mediaIdentity(next.audioUrl)) this.stopAudioPlayback();
    }
    if (this.activeVideoId) {
      const previous = previousTracks.find((track) => track.videoId === this.activeVideoId);
      const next = nextTracks.find((track) => track.videoId === this.activeVideoId);
      if (!next || mediaIdentity(previous?.videoUrl) !== mediaIdentity(next.videoUrl)) this.stopVideoPlayback();
    }
    const meta = orderedModules.find((module) => module.type === 'issueMeta');
    const homeIntroduction = typeof meta?.introduction === 'string' ? meta.introduction.trim() : DEFAULT_HOME_INTRODUCTION;
    // Preserve completed reveals during background refresh; a new issue starts fresh.
    const editorialRevealed = sameIssue ? this.data.editorialRevealed : {};
    const imagesReady: Record<string, boolean> = {};
    modules.forEach((module) => {
      const previous = this.data.modules.find((item) => item.id === module.id);
      if (sameIssue && String(previous?.imageUrl || '').split('?')[0] === String(module.imageUrl || '').split('?')[0] && this.data.imagesReady[module.id]) imagesReady[module.id] = true;
    });
    // Patch changed rows in place; unchanged rows retain native image/layout state.
    const coverUrl = sameIssue && mediaIdentity(data.coverUrl) === mediaIdentity(this.data.coverUrl) ? this.data.coverUrl : data.coverUrl;
    const next: Record<string, unknown> = { ...data, coverUrl, issue, homeIntroduction, issueHeader: buildIssueHeader(modules, issue), editorialRevealed, imagesReady, contentsEntries: buildContentsEntries(modules, issue), hasModules: modules.length > 0, contentVisible: true, loading: false, error: '', refreshError: '', updateAvailable: false };
    delete next.modules;
    if (sameIssue && this.data.modules.length === modules.length && modules.every((module, index) => module.id === this.data.modules[index].id)) {
      modules.forEach((module, index) => {
        if (JSON.stringify(module) !== JSON.stringify(this.data.modules[index])) next[`modules[${index}]`] = module;
      });
    } else next.modules = modules;
    this.setData(next, () => this.observeEditorialModules());
  },
  acceptHomeUpdate() {
    const pending = this.pendingHomeContent;
    if (!pending) return;
    this.pendingHomeContent = null;
    this.requestGeneration += 1;
    this.contentRequestInFlight = false;
    this.stopVideoPlayback();
    this.stopAudioPlayback();
    this.applyHomeContent(pending);
    saveHomeContentCache(pending);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  disconnectEditorialObserver() {
    this.motionObserver?.disconnect();
    this.motionObserver = null;
  },
  observeEditorialModules() {
    this.disconnectEditorialObserver();
    if (!this.motionReady || this.motionHidden || !wx.createIntersectionObserver) return;
    // Content stays visible without observer support; the observer only adds motion.
    const observer = wx.createIntersectionObserver(this, { observeAll: true, thresholds: [0, 0.08] });
    this.motionObserver = observer;
    observer.relativeToViewport({ bottom: -40 }).observe('.editorial-reveal', (result) => {
      if (this.motionObserver !== observer || result.intersectionRatio <= 0) return;
      const key = String(result.dataset.motionKey || '');
      if (!key || this.data.editorialRevealed[key]) return;
      this.setData({ editorialRevealed: { ...this.data.editorialRevealed, [key]: true } });
    });
  },
  onModuleImageLoad(event: WechatMiniprogram.CustomEvent) {
    const { moduleId, source } = event.currentTarget.dataset;
    const module = this.data.modules.find((item) => item.id === moduleId);
    if (!module || module.imageUrl !== source || this.data.imagesReady[module.id]) return;
    this.setData({ imagesReady: { ...this.data.imagesReady, [module.id]: true } });
  },
  async loadContent() {
    if (this.contentRequestInFlight) return;
    this.contentRequestInFlight = true;
    const generation = ++this.requestGeneration;
    // Keep cached or previously loaded content on screen while the network refresh runs.
    this.setData({ loading: !this.data.contentVisible, error: '', refreshError: '' });
    try {
      const data = await request<PublicHomeContent>('/content/home');
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('首页内容格式无效');
      if (this.data.contentVisible && data.issue?.code && data.issue.code !== this.data.issue.code) {
        this.pendingHomeContent = data;
        this.setData({ loading: false, updateAvailable: true });
        return;
      }
      this.pendingHomeContent = null;
      if (homeContentSignature(data) !== this.currentContentSignature) this.applyHomeContent(data);
      else this.setData({ loading: false, updateAvailable: false, refreshError: '' });
      saveHomeContentCache(data);
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      if (this.data.contentVisible) {
        this.setData({ loading: false, error: '', refreshError: apiErrorMessage(caught, '暂未更新，当前内容仍可阅读') });
        return;
      }
      this.setData({ loading: false, contentVisible: false, error: apiErrorMessage(caught, '暂时无法连接云端内容'), issue: emptyIssue, issueHeader: { ...emptyIssueHeader }, question: '', coverUrl: '', microVoice: null, sections: [], modules: [], contentsEntries: [], hasModules: false });
    } finally {
      if (generation === this.requestGeneration) this.contentRequestInFlight = false;
    }
  },
  scrollToSection(event: WechatMiniprogram.CustomEvent) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.sections.length) return;
    const targetIndex = index === 0 ? 0 : index === 1 && this.data.microVoice?.enabled ? 1 : index === 2 ? 2 : -1;
    if (targetIndex < 0) {
      wx.showToast({ title: '该入口暂未开放', icon: 'none' });
      return;
    }
    wx.pageScrollTo({ selector: `#home-section-${targetIndex}`, duration: 260 });
  },
  scrollToObservation() {
    wx.pageScrollTo({ selector: '#home-section-2', duration: 260 });
  },
  openModuleAction(event: WechatMiniprogram.CustomEvent) {
    const action = String(event.currentTarget.dataset.action || '');
    if (action === 'observation') this.startObservation();
    else if (action === 'discussion') this.openDiscussion();
  },
  openArchive() {
    wx.navigateTo({ url: '/pages/archive/index' });
  },
  openModuleLink(event: WechatMiniprogram.CustomEvent) {
    const type = String(event.currentTarget.dataset.linkType || '');
    const path = String(event.currentTarget.dataset.linkPath || '').trim();
    const url = String(event.currentTarget.dataset.linkUrl || '').trim();
    const fail = () => wx.showToast({ title: '暂时无法打开这个入口', icon: 'none' });
    if (type === 'web') {
      if (!/^https:\/\/[^\s<>]+$/i.test(url)) {
        wx.showToast({ title: '网站链接无效', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url: `/pages/webview/index?url=${encodeURIComponent(url)}`,
        fail,
      });
      return;
    }
    if (type === 'page') {
      const route = path.split('?')[0];
      if (!route.startsWith('/pages/') || !path.startsWith('/pages/')) {
        wx.showToast({ title: '页面路径无效', icon: 'none' });
        return;
      }
      if (['/pages/home/index', '/pages/practice/index', '/pages/mine/index'].includes(route)) {
        wx.switchTab({ url: route, fail });
      } else {
        wx.navigateTo({ url: path, fail });
      }
    }
  },
  startAudioSeek(event: WechatMiniprogram.TouchEvent) {
    const moduleId = String(event.currentTarget.dataset.moduleId || '');
    const trackId = String(event.currentTarget.dataset.trackId || '');
    const audio = this.data.modules.find((module) => module.id === moduleId && module.type === 'audio');
    const tracks = Array.isArray(audio?.tracks) ? audio.tracks as Array<Record<string, unknown>> : [];
    const track = tracks.find((item) => item.id === trackId);
    const playbackId = String(track?.playbackId || '');
    if (!playbackId || this.data.activeAudioId !== playbackId || !this.audioContext || this.audioContextModuleId !== playbackId) return;
    const touch = event.touches?.[0];
    const clientX = Number(touch?.clientX || 0);
    this.audioSeekTrackId = trackId;
    this.audioSeekPlaybackId = playbackId;
    this.audioSeekResume = this.data.playingAudioId === playbackId;
    this.audioSeekPendingX = clientX;
    this.audioSeekEnded = false;
    if (this.audioSeekResume && this.audioContext) {
      this.audioSession?.pause();
      this.setData({ playingAudioId: '', bufferingAudioId: '' });
    }
    this.setData({ audioSeeking: true });
    this.createSelectorQuery().select(`#audio-seek-${moduleId}-${trackId}`).boundingClientRect((rect) => {
      if (this.audioSeekTrackId !== trackId) return;
      if (!rect || !rect.width) {
        this.finishAudioSeek();
        return;
      }
      this.audioSeekRect = { left: rect.left, width: rect.width };
      if (this.audioSeekPendingX !== null) this.seekAudioAt(this.audioSeekPendingX);
      if (this.audioSeekEnded) this.finishAudioSeek();
    }).exec();
  },
  moveAudioSeek(event: WechatMiniprogram.TouchEvent) {
    if (!this.audioSeekTrackId) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    this.audioSeekPendingX = Number(touch.clientX || 0);
    if (this.audioSeekRect) this.seekAudioAt(this.audioSeekPendingX);
  },
  endAudioSeek(event: WechatMiniprogram.TouchEvent) {
    if (!this.audioSeekTrackId) return;
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    if (touch) {
      this.audioSeekPendingX = Number(touch.clientX || 0);
      if (this.audioSeekRect) this.seekAudioAt(this.audioSeekPendingX);
    }
    if (this.audioSeekRect) this.finishAudioSeek();
    else this.audioSeekEnded = true;
  },
  seekAudioAt(clientX: number) {
    if (!this.audioSeekRect || !this.audioContext || this.audioContextModuleId !== this.audioSeekPlaybackId) return;
    const duration = Math.max(0, Number(this.audioContext.duration) || this.data.audioDuration);
    if (!duration) return;
    const ratio = Math.max(0, Math.min(1, (clientX - this.audioSeekRect.left) / this.audioSeekRect.width));
    const currentTime = duration * ratio;
    this.audioContext.seek(currentTime);
    this.setData({
      audioCurrentTime: currentTime,
      audioDuration: duration,
      audioCurrentTimeLabel: formatAudioTime(currentTime),
      audioDurationLabel: formatAudioTime(duration),
      audioProgressPercent: ratio * 100,
    });
  },
  finishAudioSeek() {
    const playbackId = this.audioSeekPlaybackId;
    const resume = this.audioSeekResume && Boolean(playbackId) && Boolean(this.audioContext) && this.audioContextModuleId === playbackId;
    this.audioSeekTrackId = '';
    this.audioSeekRect = null;
    this.audioSeekPlaybackId = '';
    this.audioSeekResume = false;
    this.audioSeekPendingX = null;
    this.audioSeekEnded = false;
    this.setData({ audioSeeking: false });
    if (resume && this.audioContext) {
      this.audioSession?.resume();
    }
  },
  openAudioIndex() {
    wx.navigateTo({ url: `/pages/audio/index?issueCode=${encodeURIComponent(this.data.issue.code)}` });
  },
  openAudioDetail(event: WechatMiniprogram.CustomEvent) {
    const trackId = String(event.currentTarget.dataset.trackId || '');
    if (!trackId) return;
    this.stopVideoPlayback();
    this.stopAudioPlayback();
    wx.navigateTo({ url: `/pages/audio/detail?id=${encodeURIComponent(trackId)}&issueCode=${encodeURIComponent(this.data.issue.code)}` });
  },
  onHomeVideoPlay(event: WechatMiniprogram.CustomEvent) {
    const videoId = String(event.currentTarget.id || '');
    if (!videoId) return;
    if (this.activeVideoId !== videoId) this.stopVideoPlayback();
    this.stopAudioPlayback();
    this.activeVideoId = videoId;
  },
  onHomeVideoPause(event: WechatMiniprogram.CustomEvent) {
    if (this.activeVideoId === event.currentTarget.id) this.activeVideoId = '';
  },
  onHomeVideoError(event: WechatMiniprogram.CustomEvent) {
    this.onHomeVideoPause(event);
    wx.showToast({ title: '视频播放失败，请稍后重试', icon: 'none' });
  },
  stopVideoPlayback() {
    const videoId = this.activeVideoId;
    this.activeVideoId = '';
    if (videoId) wx.createVideoContext(videoId).pause();
  },
  toggleAudio(event: WechatMiniprogram.CustomEvent) {
    const moduleId = String(event.currentTarget.dataset.moduleId || '');
    const trackId = String(event.currentTarget.dataset.trackId || '');
    const audio = this.data.modules.find((module) => module.id === moduleId && module.type === 'audio');
    const tracks = Array.isArray(audio?.tracks) ? audio.tracks as Array<Record<string, unknown>> : [];
    const track = tracks.find((item) => item.id === trackId);
    if (track?.mediaType === 'video') {
      this.openAudioDetail(event);
      return;
    }
    const source = String(track?.audioUrl || '');
    const playbackId = String(track?.playbackId || '');
    if (!moduleId || !trackId || !source || !playbackId) {
      wx.showToast({ title: '音频暂不可用', icon: 'none' });
      return;
    }
    this.stopVideoPlayback();
    if (this.audioSession && this.audioContextModuleId === playbackId) {
      if (this.data.playingAudioId === playbackId || this.data.bufferingAudioId === playbackId) this.audioSession.pause();
      else {
        if (this.data.audioDuration > 0 && this.data.audioCurrentTime >= this.data.audioDuration) this.audioContext?.seek(0);
        this.audioSession.resume();
      }
      return;
    }
    this.stopAudioPlayback();
    this.audioContextModuleId = playbackId;
    this.setData({ activeAudioId: playbackId, audioPlaybackError: '', audioCurrentTime: 0, audioDuration: 0, audioCurrentTimeLabel: '00:00', audioDurationLabel: '00:00', audioProgressPercent: 0 });
    this.audioSession = createRecoverableAudio({
      source,
      refreshSource: () => refreshAudioSource(this.data.issue.code, moduleId, trackId),
      onContext: (context) => { this.audioContext = context; },
      onProgress: (context, force) => this.syncAudioProgress(context, force),
      onState: (state) => {
        if (state === 'ended') {
          const duration = this.data.audioDuration;
          this.setData({ playingAudioId: '', bufferingAudioId: '', audioCurrentTime: duration, audioCurrentTimeLabel: formatAudioTime(duration), audioProgressPercent: duration > 0 ? 100 : 0 });
        } else this.setData({
          playingAudioId: state === 'playing' ? playbackId : '',
          bufferingAudioId: state === 'buffering' ? playbackId : '',
          audioErrorId: state === 'error' ? playbackId : '',
          audioPlaybackError: state === 'error' ? '声音暂时无法播放，请再次轻触播放重试。' : '',
        });
      },
    });
  },

  syncAudioProgress(context: WechatMiniprogram.InnerAudioContext, force = false) {
    if (this.audioContext !== context || this.audioSeekTrackId) return;
    const currentTime = Math.max(0, Number(context.currentTime) || 0);
    const duration = Math.max(0, Number(context.duration) || 0);
    if (!force && Math.floor(currentTime * 2) === Math.floor(this.data.audioCurrentTime * 2) && Math.floor(duration) === Math.floor(this.data.audioDuration)) return;
    this.setData({
      audioCurrentTime: currentTime,
      audioDuration: duration,
      audioCurrentTimeLabel: formatAudioTime(currentTime),
      audioDurationLabel: formatAudioTime(duration),
      audioProgressPercent: duration > 0 ? Math.max(0, Math.min(100, currentTime / duration * 100)) : 0,
    });
  },
  stopAudioPlayback(resetUi = true) {
    this.audioSeekTrackId = '';
    this.audioSeekRect = null;
    this.audioSeekPlaybackId = '';
    this.audioSeekResume = false;
    this.audioSeekPendingX = null;
    this.audioSeekEnded = false;
    this.audioSession?.destroy();
    this.audioSession = null;
    this.audioContext = null;
    this.audioContextModuleId = '';
    if (resetUi) this.setData({ bufferingAudioId: '', audioErrorId: '', audioPlaybackError: '', playingAudioId: '', activeAudioId: '', audioSeeking: false, audioCurrentTime: 0, audioDuration: 0, audioCurrentTimeLabel: '00:00', audioDurationLabel: '00:00', audioProgressPercent: 0 });
  },
  openStoryAction(event: WechatMiniprogram.CustomEvent) {
    const targetId = String(event.currentTarget.dataset.targetId || 'story');
    const target = this.data.modules.find((module) => module.id === targetId && module.type === 'story' && module.enabled);
    if (!target) return;
    const issueCode = this.data.issue?.code || '';
    wx.navigateTo({ url: `/pages/story-detail/index?moduleId=${encodeURIComponent(targetId)}&issueCode=${encodeURIComponent(issueCode)}` });
  },
  scrollToModule(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    this.scrollToModuleId(id);
  },
  openContentsEntry(event: WechatMiniprogram.CustomEvent) {
    const destination = String(event.currentTarget.dataset.destination || '');
    if (destination === 'story') {
      const target = this.data.modules.find((module) => module.type === 'story' && module.enabled);
      if (!target) {
        wx.showToast({ title: '人物纪实暂未开放', icon: 'none' });
        return;
      }
      const issueCode = this.data.issue?.code || '';
      wx.navigateTo({ url: `/pages/story-detail/index?moduleId=${encodeURIComponent(target.id)}&issueCode=${encodeURIComponent(issueCode)}` });
      return;
    }
    if (destination === 'audio') {
      if (!this.data.modules.some((module) => module.type === 'audio' && module.enabled)) {
        wx.showToast({ title: '微声音暂未开放', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: `/pages/audio/index?issueCode=${encodeURIComponent(this.data.issue.code)}` });
      return;
    }
    if (destination === 'observation') return this.startObservation();
    if (destination === 'discussion') {
      this.openDiscussion();
    }
  },
  scrollToModuleId(id: string) {
    if (!id || !this.data.modules.some((module) => module.id === id)) return;
    wx.pageScrollTo({ selector: `#home-module-${id}`, duration: 260 });
  },
  openDiscussion() {
    const issueCode = this.data.issue?.code || '';
    if (!issueCode) {
      wx.showToast({ title: '本期讨论暂不可用', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/discussion/index?issueCode=${encodeURIComponent(issueCode)}` });
  },
  onModuleImageError(event: WechatMiniprogram.CustomEvent) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || !this.data.modules[index]) return;
    if (event.currentTarget.dataset.source && this.data.modules[index].imageUrl !== event.currentTarget.dataset.source) return;
    this.setData({ [`modules[${index}].imageUrl`]: '' });
  },
  onHomeBackgroundError() {
    this.setData({ 'issue.homeBackgroundUrl': '' });
  },
  startObservation() {
    wx.navigateTo({ url: '/pages/observation/index' });
  },
  startPractice() {
    wx.switchTab({ url: '/pages/practice/index' });
  },
  onShareAppMessage() {
    return shareCard({
      title: 'MYRIAD SHE｜写给自己的私人档案馆',
      path: '/pages/home/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: 'MYRIAD SHE｜写给自己的私人档案馆',
      query: {},
    });
  },
});
