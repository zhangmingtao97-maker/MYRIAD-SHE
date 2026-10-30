import { apiErrorMessage, request } from '../../utils/request';
import { isPracticeContent } from '../../utils/content';
import type { PracticeContent } from '../../utils/content';

Page({
  data: { statusBarHeight: 0, title: '实践', titleRichText: '日常实践', titleFontSize: 12, titleColor: '#8b6b58', intro: '先回到能承接真实经验的位置。', introRichText: '先回到能承接真实经验的位置。', introFontSize: 28, introColor: '#40362f', metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58', metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58', entries: [] as PracticeContent['entries'], loading: true, error: '' },
  requestGeneration: 0,
  onLoad() { this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); void this.load(); },
  onShow() { if (!this.data.loading) void this.load(); },
  onHide() {
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
  },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const data = await request<PracticeContent>('/content/practice');
      if (generation !== this.requestGeneration) return;
      if (!isPracticeContent(data)) throw new Error('实践内容格式无效');
      this.setData({ ...data, loading: false, error: '' });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取实践内容') });
    }
  },
  handleEntryTap(event: WechatMiniprogram.CustomEvent) {
    const key = String(event.currentTarget.dataset.key || '');
    const entry = this.data.entries.find((item) => item.key === key);
    if (!entry) {
      wx.showToast({ title: '该实践尚未开放', icon: 'none' });
      return;
    }
    if (key === 'shared-practice') {
      if (!entry.enabled) {
        wx.showToast({ title: '该实践尚未开放', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: '/pages/shared-practice/index' });
      return;
    }
    if (key === 'observation') {
      if (!entry.enabled) {
        wx.showToast({ title: '该实践尚未开放', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: '/pages/observation/index' });
      return;
    }
    if (key === 'daily-goods') {
      wx.navigateTo({ url: '/pages/daily-objects/index' });
      return;
    }
    if (!entry.enabled) wx.showToast({ title: '该实践尚未开放', icon: 'none' });
  },
});
