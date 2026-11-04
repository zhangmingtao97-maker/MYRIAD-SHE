import { apiErrorMessage, request } from '../../utils/request';
import { isPracticeContent } from '../../utils/content';
import type { PracticeContent } from '../../utils/content';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

Page({
  data: { statusBarHeight: 0, title: '实践', titleRichText: '日常实践', titleFontSize: 12, titleColor: '#8b6b58', intro: '先回到能承接真实经验的位置。', introRichText: '先回到能承接真实经验的位置。', introFontSize: 28, introColor: '#40362f', metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58', metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58', entries: [] as PracticeContent['entries'], loading: true, error: '' },
  requestGeneration: 0,
  onLoad() { enableShareMenu(); this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); void this.load(); },
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
    // 后台可以新增 / 删除目录条目，每个条目用 target 指向要打开的页面；
    // 老数据没有 target 时回落到它自己的 key。
    const target = String((entry as { target?: string }).target || entry.key);
    if (!entry.enabled) {
      wx.showToast({ title: '该实践尚未开放', icon: 'none' });
      return;
    }
    if (target === 'shared-practice') {
      wx.navigateTo({ url: '/pages/shared-practice/index' });
      return;
    }
    if (target === 'observation') {
      wx.navigateTo({ url: '/pages/observation/index' });
      return;
    }
    if (target === 'daily-goods') {
      wx.navigateTo({ url: '/pages/daily-objects/index' });
      return;
    }
  },
  onShareAppMessage() {
    return shareCard({
      title: '实践｜MYRIAD SHE',
      path: '/pages/practice/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: '实践｜MYRIAD SHE',
      query: {},
    });
  },
});
