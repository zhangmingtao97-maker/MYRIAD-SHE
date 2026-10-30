import { apiErrorMessage, request } from '../../utils/request';
import { isPracticeContent } from '../../utils/content';
import type { PracticeContent } from '../../utils/content';

const bagCopy = {
  bagTopbarTitle: { richText: '购物袋', fontSize: 16, color: '#5c493c' },
  bagEyebrow: { richText: 'YOUR BAG', fontSize: 11, color: '#663124' },
  bagTitle: { richText: '购物袋', fontSize: 28, color: '#5c493c' },
  bagIntro: { richText: '留在这里的物，可以慢慢决定。', fontSize: 14, color: '#40362f' },
  bagEmptyTitle: { richText: '还没有加入物品', fontSize: 22, color: '#5c493c' },
  bagEmptyCopy: { richText: '看清一件物，再决定是否把它放进生活。', fontSize: 13, color: '#40362f' },
  bagAction: { richText: '去日常之物看看', fontSize: 14, color: '#f5f0e8' },
  bagPreviewNote: { richText: '商店样式预览 · 商品资料与金额均为示意', fontSize: 11, color: '#5c493c' },
};

const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];

Page({
  data: { statusBarHeight: 0, loading: true, error: '', accessAvailable: false, copy: bagCopy },
  requestGeneration: 0,
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadBagContent();
  },
  onShow() {
    if (!this.data.accessAvailable && !this.data.loading) void this.loadBagContent();
  },
  onHide() {
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
  },
  async loadBagContent() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const content = await request<PracticeContent>('/content/practice');
      if (generation !== this.requestGeneration) return;
      if (!isPracticeContent(content)) throw new Error('购物袋页面内容格式无效');
      if (!content.entries.some((entry) => entry.key === 'daily-goods' && entry.enabled)) throw new Error('日常之物尚未开放');
      this.setData({ loading: false, error: '', accessAvailable: true });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '购物袋暂不可用') });
    }
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: '/pages/daily-objects/index' });
  },
  browseObjects() {
    const pages = getCurrentPages();
    if (pages.length > 1 && pages[pages.length - 2]?.route === 'pages/daily-objects/index') wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: '/pages/daily-objects/index' });
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const url = tabs[Number(event.currentTarget.dataset.index)];
    if (url) wx.switchTab({ url });
  },
});
