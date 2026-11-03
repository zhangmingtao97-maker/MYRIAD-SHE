import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent, PublicHomeModule } from '../../utils/content';

type AudioTrackView = {
  id: string;
  title: string;
  duration: string;
  audioUrl: string;
  quote: string;
  subtitle: string;
  transcript: string;
};

type AudioView = {
  id: string;
  title: string;
  subtitle: string;
  quote: string;
  transcript: string;
  tracks: AudioTrackView[];
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function buildAudio(module: PublicHomeModule): AudioView | null {
  const rawTracks = Array.isArray(module.tracks) ? module.tracks : [];
  const tracks: AudioTrackView[] = rawTracks
    .filter((track): track is Record<string, unknown> => Boolean(track) && typeof track === 'object' && !Array.isArray(track))
    .map((track, index) => ({
      id: text(track.id) || `track-${index + 1}`,
      title: text(track.title) || `微声音 ${String(index + 1).padStart(2, '0')}`,
      duration: text(track.duration),
      audioUrl: text(track.audioUrl),
      quote: text(track.quote),
      subtitle: text(track.subtitle),
      transcript: text(track.transcript),
    }))
    .filter((track) => Boolean(track.audioUrl));
  const fallbackUrl = text(module.audioUrl);
  if (!tracks.length && fallbackUrl) {
    tracks.push({
      id: text(module.id) || 'audio-01',
      title: text(module.title) || '微声音',
      duration: text(module.duration),
      audioUrl: fallbackUrl,
      quote: text(module.quote),
      subtitle: text(module.subtitle),
      transcript: text(module.transcript),
    });
  }
  if (!tracks.length) return null;
  return {
    id: text(module.id) || 'audio',
    title: text(module.title) || '微声音',
    subtitle: text(module.subtitle) || tracks[0].subtitle,
    quote: text(module.quote),
    transcript: text(module.transcript),
    tracks,
  };
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    issueCode: '',
    audio: null as AudioView | null,
    activeId: '',
    playing: false,
    progress: 0,
    currentLabel: '00:00',
    durationLabel: '00:00',
  },
  requestGeneration: 0,
  audioContext: null as WechatMiniprogram.InnerAudioContext | null,
  audioTrackId: '',
  onLoad() {
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
    this.setData({ loading: true, error: '', audio: null, issueCode: '' });
    try {
      const data = await request<PublicHomeContent>('/content/home', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('本期声音格式无效');
      const module = (data.modules || []).find((item) => item.enabled && item.type === 'audio');
      const audio = module ? buildAudio(module) : null;
      if (!audio) throw new Error('本期微声音暂未开放');
      this.setData({ loading: false, error: '', issueCode: data.issue?.code || '', audio });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取本期声音') });
    }
  },
  toggleTrack(event: WechatMiniprogram.CustomEvent) {
    const trackId = String(event.currentTarget.dataset.trackId || '');
    const track = this.data.audio?.tracks.find((item) => item.id === trackId);
    if (!track?.audioUrl) {
      wx.showToast({ title: '这段声音暂不可用', icon: 'none' });
      return;
    }
    if (this.audioContext && this.audioTrackId === trackId) {
      if (this.data.playing) {
        this.audioContext.pause();
        this.setData({ playing: false });
      } else {
        this.audioContext.play();
        this.setData({ playing: true });
      }
      return;
    }
    this.stopAudio();
    const context = wx.createInnerAudioContext();
    this.audioContext = context;
    this.audioTrackId = trackId;
    this.setData({
      activeId: trackId,
      playing: true,
      progress: 0,
      currentLabel: '00:00',
      durationLabel: track.duration || '00:00',
    });
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
    this.audioTrackId = '';
    this.setData({ activeId: '', playing: false, progress: 0, currentLabel: '00:00', durationLabel: '00:00' });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
  onShareAppMessage() {
    const title = this.data.audio?.title;
    return { title: title ? `${title}｜微声音` : '微声音｜MYRIAD SHE', path: '/pages/audio/index' };
  },
  onShareTimeline() {
    const title = this.data.audio?.title;
    return { title: title ? `${title}｜微声音` : '微声音｜MYRIAD SHE' };
  },
});
