import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent, PublicHomeModule } from '../../utils/content';

type HomeIssue = NonNullable<PublicHomeContent['issue']>;
type HomeContentsDestination = 'story' | 'audio' | 'observation' | 'discussion';
interface HomeContentsEntry { id: HomeContentsDestination; number: string; label: string; summary: string; destination: HomeContentsDestination }
const emptyIssue: HomeIssue = { code: '', label: '', month: '', theme: '', question: '', microVoiceTitle: null, microVoiceDuration: null, homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '', homeCoverCaptionRight: '' };

function formatAudioTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function combineCoverAndOpener(modules: PublicHomeModule[]) {
  const result: PublicHomeModule[] = [];
  const coverIndex = modules.findIndex((module) => module.type === 'coverStory' || module.type === 'cover');
  const openerIndex = modules.findIndex((module) => module.type === 'opener');
  if (coverIndex >= 0 && openerIndex >= 0) {
    const cover = modules[coverIndex];
    const opener = modules[openerIndex];
    const combined: PublicHomeModule = { ...cover, ...opener, id: cover.id, type: 'coverStory', order: Math.min(cover.order, opener.order), enabled: cover.enabled || opener.enabled, imageUrl: cover.imageUrl || '', imageObjectKey: cover.imageObjectKey || '', altText: cover.altText || '', captionLeft: cover.captionLeft || '', captionRight: cover.captionRight || '', eyebrow: opener.eyebrow || '本期主题', title: opener.title || '', titleFontSize: opener.titleFontSize || 72, titleColor: opener.titleColor || '#59483d', body: opener.body || '', bodyFontSize: opener.bodyFontSize || 30, bodyColor: opener.bodyColor || '#40362f', byline: cover.byline || '策展与编辑 · MYRIAD SHE' };
    modules.forEach((module, index) => {
      if (index === coverIndex) result.push(combined);
      else if (index !== openerIndex) result.push(module);
    });
  } else {
    result.push(...modules);
  }
  return result.sort((left, right) => left.order - right.order);
}

function presentHomeModules(modules: PublicHomeModule[]) {
  const prepared = modules.map((module) => {
    if (module.type !== 'audio') return module;
    const rawTracks = Array.isArray(module.tracks) ? module.tracks as Array<Record<string, unknown>> : [];
    const tracks = rawTracks.length ? rawTracks : [{
      id: 'voice-01', title: module.title || '微声音 01', duration: module.duration || '', audioUrl: module.audioUrl || '',
      quote: module.quote || '', subtitle: module.subtitle || '', transcript: module.transcript || '',
    }];
    const preparedTracks = tracks.map((track, index) => ({
      ...track,
      id: String(track.id || `voice-${String(index + 1).padStart(2, '0')}`),
      title: String(track.title || `微声音 ${String(index + 1).padStart(2, '0')}`),
      duration: String(track.duration || ''),
      audioUrl: String(track.audioUrl || (index === 0 ? module.audioUrl || '' : '')),
      quote: String(track.quote || ''),
      subtitle: String(track.subtitle || ''),
      transcript: String(track.transcript || ''),
      playbackId: `${module.id}:${String(track.id || `voice-${String(index + 1).padStart(2, '0')}`)}`,
    }));
    return {
      ...module,
      tracks: preparedTracks,
      primaryTrack: preparedTracks[0],
      displayTitle: String(module.title || '微声音').replace(/\s+0?\d+$/, ''),
    };
  });
  const embeddedActions = new Set<string>();
  const withStoryActions = prepared.map((module) => {
    if (module.type !== 'story') return module;
    const action = prepared.find((candidate) => candidate.type === 'storyAction' && (candidate.targetId || 'story') === module.id);
    if (!action) return module;
    embeddedActions.add(action.id);
    return { ...module, storyActionTitle: action.title || '进入本期人物' };
  });
  const withQuestionActions = withStoryActions.map((module) => {
    if (module.type !== 'question') return module;
    const actions = withStoryActions.filter((candidate) => candidate.type === 'observationAction' || candidate.type === 'sharedPracticeAction');
    actions.forEach((action) => embeddedActions.add(action.id));
    return { ...module, questionActions: actions, eyebrow: module.eyebrow || '从她的经验，回到你的此刻' };
  });
  return withQuestionActions.filter((module) => !embeddedActions.has(module.id));
}

function buildContentsEntries(modules: PublicHomeModule[], issue: HomeIssue): HomeContentsEntry[] {
  const directory = modules.find((module) => module.type === 'contents');
  if (!directory) return [];
  const audio = modules.find((module) => module.type === 'audio');
  const text = (field: string, fallback: string) => {
    const value = directory[field];
    return typeof value === 'string' && value.trim() ? value : fallback;
  };
  return [
    { id: 'story', number: '01', label: text('entry1Label', '人物纪实'), summary: text('entry1Summary', issue.theme), destination: 'story' },
    { id: 'audio', number: '02', label: text('entry2Label', '微声音'), summary: text('entry2Summary', String(audio?.subtitle || '第一个普通早晨')), destination: 'audio' },
    { id: 'observation', number: '03', label: text('entry3Label', '此刻观察'), summary: text('entry3Summary', '从本期问题继续'), destination: 'observation' },
    { id: 'discussion', number: '04', label: text('entry4Label', '本期讨论'), summary: text('entry4Summary', '一起听见不同的经历'), destination: 'discussion' },
  ];
}

Page({
  data: { loading: true, statusBarHeight: 0, issue: emptyIssue, question: '', coverUrl: '', microVoice: null as PublicHomeContent['microVoice'] | null, sections: [] as string[], modules: [] as PublicHomeModule[], contentsEntries: [] as HomeContentsEntry[], hasModules: false, error: '', playingAudioId: '', activeAudioId: '', audioCurrentTime: 0, audioDuration: 0, audioCurrentTimeLabel: '00:00', audioDurationLabel: '00:00', audioProgressPercent: 0 },
  requestGeneration: 0,
  audioContext: null as WechatMiniprogram.InnerAudioContext | null,
  audioContextModuleId: '',
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadContent();
  },
  onShow() {
    if (!this.data.loading) void this.loadContent();
  },
  onHide() {
    // Public content is ordinary view data. Invalidate a hidden-page read so
    // an older response cannot repaint on return.
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
    this.stopAudioPlayback();
  },
  onUnload() {
    this.stopAudioPlayback(false);
  },
  async loadContent() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '', issue: emptyIssue, question: '', coverUrl: '', microVoice: null, sections: [], modules: [], contentsEntries: [], hasModules: false });
    try {
      const data = await request<PublicHomeContent>('/content/home');
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('首页内容格式无效');
      const supported = new Set(['issueMeta', 'coverStory', 'cover', 'opener', 'story', 'storyAction', 'image', 'quote', 'audio', 'question', 'observationAction', 'sharedPracticeAction', 'contents', 'archive', 'brandFooter']);
      const orderedModules = (data.modules || []).filter((module) => module.enabled && supported.has(module.type)).sort((left, right) => left.order - right.order);
      const combinedModules = combineCoverAndOpener(orderedModules);
      const modules = presentHomeModules(combinedModules);
      const issue = data.issue || emptyIssue;
      this.setData({ ...data, issue, modules, contentsEntries: buildContentsEntries(modules, issue), hasModules: modules.length > 0, loading: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法连接云端内容'), issue: emptyIssue, question: '', coverUrl: '', microVoice: null, sections: [], modules: [], contentsEntries: [], hasModules: false });
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
  toggleAudio(event: WechatMiniprogram.CustomEvent) {
    const moduleId = String(event.currentTarget.dataset.moduleId || '');
    const trackId = String(event.currentTarget.dataset.trackId || '');
    const audio = this.data.modules.find((module) => module.id === moduleId && module.type === 'audio');
    const tracks = Array.isArray(audio?.tracks) ? audio.tracks as Array<Record<string, unknown>> : [];
    const track = tracks.find((item) => item.id === trackId);
    const source = String(track?.audioUrl || '');
    const playbackId = String(track?.playbackId || '');
    if (!moduleId || !trackId || !source || !playbackId) {
      wx.showToast({ title: '音频暂不可用', icon: 'none' });
      return;
    }
    if (this.audioContext && this.audioContextModuleId === playbackId) {
      if (this.data.playingAudioId === playbackId) {
        this.audioContext.pause();
        this.setData({ playingAudioId: '' });
      } else {
        if (this.data.audioDuration > 0 && this.data.audioCurrentTime >= this.data.audioDuration) {
          this.audioContext.seek(0);
          this.setData({ audioCurrentTime: 0, audioCurrentTimeLabel: '00:00', audioProgressPercent: 0 });
        }
        this.audioContext.play();
        this.setData({ playingAudioId: playbackId });
      }
      return;
    }
    this.stopAudioPlayback();
    const context = wx.createInnerAudioContext();
    context.src = source;
    context.onCanplay(() => this.syncAudioProgress(context, true));
    context.onTimeUpdate(() => this.syncAudioProgress(context));
    context.onEnded(() => {
      if (this.audioContext !== context) return;
      const duration = Math.max(0, Number(context.duration) || this.data.audioDuration);
      this.setData({
        playingAudioId: '',
        audioCurrentTime: duration,
        audioDuration: duration,
        audioCurrentTimeLabel: formatAudioTime(duration),
        audioDurationLabel: formatAudioTime(duration),
        audioProgressPercent: duration > 0 ? 100 : 0,
      });
    });
    context.onError(() => {
      if (this.audioContext !== context) return;
      this.stopAudioPlayback();
      wx.showToast({ title: '音频播放失败，请稍后重试', icon: 'none' });
    });
    this.audioContext = context;
    this.audioContextModuleId = playbackId;
    this.setData({ playingAudioId: playbackId, activeAudioId: playbackId, audioCurrentTime: 0, audioDuration: 0, audioCurrentTimeLabel: '00:00', audioDurationLabel: '00:00', audioProgressPercent: 0 });
    context.play();
  },
  syncAudioProgress(context: WechatMiniprogram.InnerAudioContext, force = false) {
    if (this.audioContext !== context) return;
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
    if (this.audioContext) {
      this.audioContext.stop();
      this.audioContext.destroy();
      this.audioContext = null;
    }
    this.audioContextModuleId = '';
    if (resetUi) this.setData({ playingAudioId: '', activeAudioId: '', audioCurrentTime: 0, audioDuration: 0, audioCurrentTimeLabel: '00:00', audioDurationLabel: '00:00', audioProgressPercent: 0 });
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
    if (destination === 'observation') return this.startObservation();
    if (destination === 'discussion') {
      this.openDiscussion();
      return;
    }
    if (destination !== 'story' && destination !== 'audio') return;
    const target = this.data.modules.find((module) => module.type === destination && module.enabled);
    if (!target) {
      wx.showToast({ title: '该栏目暂未开放', icon: 'none' });
      return;
    }
    this.scrollToModuleId(target.id);
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
    if (!Number.isInteger(index) || index < 0) return;
    this.setData({ [`modules[${index}].imageUrl`]: '' });
  },
  startObservation() {
    wx.navigateTo({ url: '/pages/observation/index' });
  },
  startPractice() {
    wx.switchTab({ url: '/pages/practice/index' });
  },
});
