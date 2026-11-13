import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent } from '../../utils/content';
import { buildMicroVoice, findMicroVoiceTrack } from '../../utils/micro-voice';
import type { MicroVoiceAction, MicroVoiceTrack } from '../../utils/micro-voice';
import { createRecoverableAudio } from '../../utils/recoverable-audio';
import { refreshAudioSource } from '../../utils/audio-source';
import { enableShareMenu } from '../../utils/share';

type OfficialArticleRuntime = typeof wx & {
  openOfficialAccountArticle?: (options: { url: string; fail?: (error: unknown) => void }) => void;
};

function isOfficialAccountArticleUrl(value: string) {
  return /^https:\/\/mp\.weixin\.qq\.com\/s(?:\/|$|\?)/i.test(value);
}


function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    issueCode: '',
    track: null as MicroVoiceTrack | null,
    heading: '',
    headingHtml: '',
    description: '',
    descriptionHtml: '',
    playing: false,
    buffering: false,
    playbackError: '',
    progress: 0,
    currentLabel: '00:00',
    durationLabel: '00:00',
  },
  requestGeneration: 0,
  requestedTrackId: '',
  requestedIssueCode: '',
  contentRequestInFlight: false,
  audioSession: null as ReturnType<typeof createRecoverableAudio> | null,
  audioContext: null as WechatMiniprogram.InnerAudioContext | null,
  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
    this.requestedIssueCode = query.issueCode || '';
    this.requestedTrackId = query.id ? decodeURIComponent(query.id) : '';
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadContent();
  },
  onShow() { if (this.data.loading && !this.contentRequestInFlight) void this.loadContent(); },
  onHide() {
    this.contentRequestInFlight = false;
    this.requestGeneration += 1;
    this.stopAudio();
  },
  onUnload() {
    this.requestGeneration += 1;
    this.stopAudio();
  },
  async loadContent() {
    this.stopAudio();
    const generation = ++this.requestGeneration;
    this.contentRequestInFlight = true;
    this.setData({ loading: true, error: '', track: null });
    try {
      const data = await request<PublicHomeContent>(this.requestedIssueCode ? `/content/archive/${encodeURIComponent(this.requestedIssueCode)}` : '/content/home', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('本期微声音格式无效');
      if (this.requestedIssueCode && data.issue?.code !== this.requestedIssueCode) throw new Error('这期微声音暂时无法读取');
      const module = (data.modules || []).find((item) => item.enabled && item.type === 'audio');
      const audio = buildMicroVoice(module);
      const track = findMicroVoiceTrack(audio, this.requestedTrackId);
      if (!track || (this.requestedTrackId && track.id !== this.requestedTrackId)) throw new Error('这段微声音暂未开放');
      this.setData({
        loading: false,
        error: '',
        issueCode: data.issue?.code || '',
        track,
        heading: track.detailTitle || track.title,
        headingHtml: track.detailTitleHtml || track.titleHtml,
        description: track.description || track.transcript,
        descriptionHtml: track.descriptionHtml || track.transcriptHtml,
        durationLabel: track.duration || '00:00',
      });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取这段微声音') });
    } finally { if (generation === this.requestGeneration) this.contentRequestInFlight = false; }
  },
  toggleAudio() {
    const track = this.data.track;
    if (!track || track.mediaType !== 'audio' || !track.audioUrl) {
      wx.showToast({ title: '这段声音暂不可用', icon: 'none' });
      return;
    }
    if (this.audioSession) {
      if (this.data.playing || this.data.buffering) this.audioSession.pause();
      else this.audioSession.resume();
      return;
    }
    this.setData({ playbackError: '', progress: 0, currentLabel: '00:00', durationLabel: track.duration || '00:00' });
    this.audioSession = createRecoverableAudio({
      source: track.audioUrl,
      refreshSource: () => refreshAudioSource(this.data.issueCode, '', track.id),
      onContext: (context) => { this.audioContext = context; },
      onState: (state) => this.setData({ playing: state === 'playing', buffering: state === 'buffering', playbackError: state === 'error' ? '声音暂时无法播放，请重试。' : '' }),
      onProgress: (context) => {
        const duration = Math.max(0, Number(context.duration) || 0);
        const current = Math.max(0, Number(context.currentTime) || 0);
        const currentLabel = formatTime(current);
        const durationLabel = duration ? formatTime(duration) : this.data.durationLabel;
        if (currentLabel === this.data.currentLabel && durationLabel === this.data.durationLabel) return;
        this.setData({ progress: duration ? Math.min(100, current / duration * 100) : 0, currentLabel, durationLabel });
      },
    });
  },
  stopAudio() {
    this.audioSession?.destroy();
    this.audioSession = null;
    this.audioContext = null;
    this.setData({ playing: false, buffering: false });
  },

  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
  handleVoiceAction(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const action = this.data.track?.actions[index] as MicroVoiceAction | undefined;
    const fail = () => wx.showToast({ title: '暂时无法打开这个入口', icon: 'none' });
    if (!action) {
      fail();
      return;
    }
    if (action.kind === 'page') {
      const path = String(action.path || '').trim();
      const route = path.split('?')[0];
      if (!path.startsWith('/pages/') || path.includes('..') || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(path)) {
        wx.showToast({ title: '页面路径无效', icon: 'none' });
        return;
      }
      if (['/pages/home/index', '/pages/practice/index', '/pages/mine/index'].includes(route)) {
        wx.switchTab({ url: route, fail });
      } else {
        wx.navigateTo({ url: path, fail });
      }
      return;
    }
    if (action.kind === 'web') {
      const url = String(action.url || '').trim();
      if (!/^https:\/\/[^\s<>]+$/i.test(url)) {
        wx.showToast({ title: '网站链接无效', icon: 'none' });
        return;
      }
      const openWebView = () => wx.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(url)}`, fail });
      if (isOfficialAccountArticleUrl(url)) {
        const runtime = wx as OfficialArticleRuntime;
        if (runtime.openOfficialAccountArticle) {
          runtime.openOfficialAccountArticle({ url, fail: openWebView });
          return;
        }
      }
      openWebView();
    }
  },
  onShareAppMessage() {
    const track = this.data.track;
    const title = track ? `${track.detailTitle || track.title}｜微声音` : '微声音｜MYRIAD SHE';
    return { title, path: track ? `/pages/audio/detail?id=${encodeURIComponent(track.id)}&issueCode=${encodeURIComponent(this.data.issueCode)}` : '/pages/audio/index' };
  },
  onShareTimeline() {
    const track = this.data.track;
    return { title: track ? `${track.detailTitle || track.title}｜微声音` : '微声音｜MYRIAD SHE' };
  },
});
