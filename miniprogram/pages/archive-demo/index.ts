import { request } from '../../utils/request';
import { isPublicHomeContent } from '../../utils/content';
import type { PublicHomeContent } from '../../utils/content';

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    coverUrl: '',
    imageError: false,
  },
  requestGeneration: 0,
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadImage();
  },
  onHide() { this.requestGeneration += 1; },
  onUnload() { this.requestGeneration += 1; },
  async loadImage() {
    const generation = ++this.requestGeneration;
    try {
      const data = await request<PublicHomeContent>('/content/home', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration || !isPublicHomeContent(data)) return;
      const modules = data.modules || [];
      const coverModule = modules.find((module) => module.type === 'coverStory' || module.type === 'cover' || module.type === 'image');
      const coverUrl = data.coverUrl
        || (typeof coverModule?.imageUrl === 'string' ? coverModule.imageUrl : '')
        || '';
      this.setData({ coverUrl, loading: false, imageError: false });
    } catch {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false });
    }
  },
  onImageError() {
    this.setData({ imageError: true });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: '/pages/archive/index' }) });
  },
  onShareAppMessage() {
    return { title: '往期策展 · 结构示意｜MYRIAD SHE', path: '/pages/archive-demo/index' };
  },
  onShareTimeline() {
    return { title: '往期策展 · 结构示意｜MYRIAD SHE' };
  },
});
