import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent } from '../../utils/content';
import { buildMicroVoice, findMicroVoiceTrack } from '../../utils/micro-voice';
import type { MicroVoiceTrack } from '../../utils/micro-voice';
import { enableShareMenu } from '../../utils/share';

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
    description: '',
    playing: false,
    progress: 0,
    currentLabel: '00:00',
    durationLabel: '00:00',
  },
  requestGeneration: 0,
  requestedTrackId: '',
  audioContext: null as WechatMiniprogram.InnerAudioContext | null,
  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
    this.requestedTrackId = query.id ? decodeURIComponent(query.id) : '';
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadContent();
  },
  onHide() {
    this.requestGeneration += 1;
    this.stopAudio();
  },
  onUnload() {
    this.requestGeneration += 1;
    this.stopAudio();
  },
  async loadContent() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '', track: null });
    try {
      const data = await request<PublicHomeContent>('/content/home', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('本期微声音格式无效');
      const module = (data.modules || []).find((item) => item.enabled && item.type === 'audio');
      const audio = buildMicroVoice(module);
      const track = findMicroVoiceTrack(audio, this.requestedTrackId);
      if (!track) throw new Error('这段微声音暂未开放');
      this.setData({
        loading: false,
        error: '',
        issueCode: data.issue?.code || '',
        track,
        heading: track.detailTitle || track.title,
        description: track.description || track.transcript,
        durationLabel: track.duration || '00:00',
      });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取这段微声音') });
    }
  },
  toggleAudio() {
    const track = this.data.track;
    if (!track || track.mediaType !== 'audio' || !track.audioUrl) {
      wx.showToast({ title: '这段声音暂不可用', icon: 'none' });
      return;
    }
    if (this.audioContext) {
      if (this.data.playing) {
        this.audioContext.pause();
        this.setData({ playing: false });
      } else {
        this.audioContext.play();
        this.setData({ playing: true });
      }
      return;
    }
    const context = wx.createInnerAudioContext();
    this.audioContext = context;
    this.setData({ playing: true, progress: 0, currentLabel: '00:00', durationLabel: track.duration || '00:00' });
    context.src = track.audioUrl;
    context.onCanplay(() => {
      if (this.audioContext !== context) return;
      const duration = Math.max(0, Number(context.duration) || 0);
      if (duration) this.setData({ durationLabel: formatTime(duration) });
    });
    context.onTimeUpdate(() => {
      if (this.audioContext !== context) return;
      const duration = Math.max(0, Number(context.duration) || 0);
      const current = Math.max(0, Number(context.currentTime) || 0);
      this.setData({
        progress: duration ? Math.min(100, current / duration * 100) : 0,
        currentLabel: formatTime(current),
        durationLabel: duration ? formatTime(duration) : this.data.durationLabel,
      });
    });
    context.onEnded(() => {
      if (this.audioContext !== context) return;
      this.setData({ playing: false, progress: 0, currentLabel: '00:00' });
    });
    context.onError(() => {
      if (this.audioContext !== context) return;
      this.setData({ playing: false });
      wx.showToast({ title: '声音播放失败，请稍后重试', icon: 'none' });
    });
    context.play();
  },
  stopAudio() {
    if (this.audioContext) {
      this.audioContext.stop();
      this.audioContext.destroy();
      this.audioContext = null;
    }
    this.setData({ playing: false, progress: 0, currentLabel: '00:00' });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
  onShareAppMessage() {
    const track = this.data.track;
    const title = track ? `${track.detailTitle || track.title}｜微声音` : '微声音｜MYRIAD SHE';
    return { title, path: track ? `/pages/audio/detail?id=${encodeURIComponent(track.id)}` : '/pages/audio/index' };
  },
  onShareTimeline() {
    const track = this.data.track;
    return { title: track ? `${track.detailTitle || track.title}｜微声音` : '微声音｜MYRIAD SHE' };
  },
});
