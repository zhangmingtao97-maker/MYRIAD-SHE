import { apiErrorMessage, request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent } from '../../utils/content';
import { buildMicroVoice } from '../../utils/micro-voice';
import type { MicroVoiceView } from '../../utils/micro-voice';
import { enableShareMenu } from '../../utils/share';

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    issueCode: '',
    audio: null as MicroVoiceView | null,
  },
  requestGeneration: 0,
  onLoad() {
    enableShareMenu();
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadContent();
  },
  onHide() {
    this.requestGeneration += 1;
  },
  onUnload() {
    this.requestGeneration += 1;
  },
  async loadContent() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '', audio: null });
    try {
      const data = await request<PublicHomeContent>('/content/home', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicHomeContent(data)) throw new Error('本期微声音格式无效');
      const module = (data.modules || []).find((item) => item.enabled && item.type === 'audio');
      const audio = buildMicroVoice(module);
      if (!audio) throw new Error('本期微声音暂未开放');
      if (audio.tracks.length === 1) {
        wx.redirectTo({
          url: `/pages/audio/detail?id=${encodeURIComponent(audio.tracks[0].id)}`,
          fail: () => this.setData({ loading: false, error: '', issueCode: data.issue?.code || '', audio }),
        });
        return;
      }
      this.setData({ loading: false, error: '', issueCode: data.issue?.code || '', audio });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取本期微声音') });
    }
  },
  openDetail(event: WechatMiniprogram.CustomEvent) {
    const trackId = String(event.currentTarget.dataset.trackId || '');
    if (!trackId) return;
    wx.navigateTo({ url: `/pages/audio/detail?id=${encodeURIComponent(trackId)}` });
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
