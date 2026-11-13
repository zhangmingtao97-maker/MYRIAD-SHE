import { apiErrorMessage, request } from '../../utils/request';
import { isPracticeContent } from '../../utils/content';
import type { PracticeContent } from '../../utils/content';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

Page({
  data: { statusBarHeight: 0, title: '实践', titleRichText: '日常实践', titleFontSize: 12, titleColor: '#8b6b58', intro: '先回到能承接真实经验的位置。', introRichText: '先回到能承接真实经验的位置。', introFontSize: 32, introColor: '#40362f', metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58', metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58', footerCopy: { brand: { richText: 'MYRIAD SHE', fontSize: 11, color: '#5c493c' }, line1: { richText: '看见真实经验', fontSize: 16, color: '#40362f' }, label: { richText: '此刻归安', fontSize: 11, color: '#5c493c' }, line2: { richText: '让一件小事发生', fontSize: 16, color: '#40362f' } }, entries: [] as PracticeContent['entries'], loading: true, error: '', refreshError: '' },
  requestGeneration: 0,
  contentVisible: false,
  requestInFlight: false,
  onLoad() { enableShareMenu(); this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); void this.load(); },
  onShow() { if (!this.data.loading) void this.load(); },
  onHide() {
    this.requestGeneration += 1;
    this.requestInFlight = false;
    if (this.data.loading) this.setData({ loading: false });
  },
  async load() {
    if (this.requestInFlight) return;
    this.requestInFlight = true;
    const generation = ++this.requestGeneration;
    this.setData({ loading: !this.contentVisible, error: '', refreshError: '' });
    try {
      const data = await request<PracticeContent>('/content/practice');
      if (generation !== this.requestGeneration) return;
      if (!isPracticeContent(data)) throw new Error('实践内容格式无效');
      // 目录是否点亮只由实践目录自身的入口开关决定；商城总闸在小程序日常之物页单独判断。
      this.contentVisible = true;
      this.setData({ ...data, loading: false, error: '', refreshError: '' });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      const message = apiErrorMessage(caught, '暂时无法读取实践内容');
      this.setData({ loading: false, error: this.contentVisible ? '' : message, refreshError: this.contentVisible ? message : '' });
    } finally {
      if (generation === this.requestGeneration) this.requestInFlight = false;
    }
  },
  onUnload() { this.requestGeneration += 1; this.requestInFlight = false; },
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
    // 日常之物目录入口关闭或商城总闸关闭时，都进入落地页查看未开放状态。
    if (target === 'daily-goods') {
      wx.navigateTo({ url: '/pages/daily-objects/index' });
      return;
    }
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
