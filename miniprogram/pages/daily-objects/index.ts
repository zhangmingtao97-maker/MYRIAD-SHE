import { apiErrorMessage, request } from '../../utils/request';
import { isDailyObjectsContent, isPracticeContent, isStoreStatus } from '../../utils/content';
import type { DailyObjectsContent, PracticeContent, StoreStatus } from '../../utils/content';

const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];

Page({
  data: { statusBarHeight: 0, coverImageHeight: 394, products: [] as DailyObjectsContent['products'], content: null as DailyObjectsContent | null, loading: true, error: '', accessAvailable: false, shopOpen: false },
  requestGeneration: 0,
  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight, coverImageHeight: Math.round(windowInfo.windowWidth * 0.9) });
    void this.loadPreviewAccess();
  },
  onShow() {
    if (!this.data.accessAvailable && !this.data.loading) void this.loadPreviewAccess();
  },
  onHide() {
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
  },
  async loadPreviewAccess() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const [data, status] = await Promise.all([
        request<PracticeContent>('/content/practice'),
        request<StoreStatus>('/content/store-status'),
      ]);
      if (generation !== this.requestGeneration) return;
      if (!isPracticeContent(data)) throw new Error('实践内容格式无效');
      if (!isStoreStatus(status)) throw new Error('商城状态格式无效');
      const shop = await request<DailyObjectsContent>('/content/daily-objects');
      if (generation !== this.requestGeneration) return;
      if (!isDailyObjectsContent(shop)) throw new Error('日常之物内容格式无效');
      // 总闸开启且「日常之物」入口启用，才展示商品；否则只显示未开放落地页。
      const entryEnabled = data.entries.some((entry) => entry.key === 'daily-goods' && entry.enabled);
      const shopOpen = status.open === true && entryEnabled;
      this.setData({
        loading: false,
        error: '',
        accessAvailable: true,
        shopOpen,
        content: shop,
        products: shopOpen ? shop.products.filter((product) => product.enabled) : [],
      });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '日常之物暂未开放') });
    }
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: '/pages/practice/index' });
  },
  handleMore() { wx.showToast({ title: '商店样式预览', icon: 'none' }); },
  handleBag() { wx.navigateTo({ url: '/pages/daily-bag/index' }); },
  handleSupport() { wx.navigateTo({ url: '/pages/contact-support/index' }); },
  openProduct(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!this.data.products.some((product) => product.id === id)) return;
    wx.navigateTo({ url: `/pages/daily-object-detail/index?id=${id}` });
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const url = tabs[Number(event.currentTarget.dataset.index)];
    if (url) wx.switchTab({ url });
  },
});
