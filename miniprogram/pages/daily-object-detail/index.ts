import { apiErrorMessage, request } from '../../utils/request';
import { isDailyObjectsContent, isPracticeContent, isStoreStatus } from '../../utils/content';
import type { DailyObjectsContent, PracticeContent, StoreStatus } from '../../utils/content';

const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];

Page({
  data: { statusBarHeight: 0, imageHeight: 375, product: null as DailyObjectsContent['products'][number] | null, brandName: 'Hitherbreath', brandSubtitle: '此刻归安', supportLabel: '联系支持', openSection: '', loading: true, error: '', accessAvailable: false },
  productId: '',
  requestGeneration: 0,
  onLoad(query: Record<string, string | undefined>) {
    const windowInfo = wx.getWindowInfo();
    this.productId = String(query.id || '');
    this.setData({ statusBarHeight: windowInfo.statusBarHeight, imageHeight: windowInfo.windowWidth });
    wx.setNavigationBarTitle({ title: '日常之物' });
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
      const entryEnabled = data.entries.some((entry) => entry.key === 'daily-goods' && entry.enabled);
      if (status.open !== true || !entryEnabled) throw new Error('日常之物尚未开放');
      const shop = await request<DailyObjectsContent>('/content/daily-objects');
      if (generation !== this.requestGeneration) return;
      if (!isDailyObjectsContent(shop)) throw new Error('日常之物内容格式无效');
      const product = shop.products.find((item) => item.id === this.productId && item.enabled);
      if (!product) throw new Error('该商品已下架或不存在');
      this.setData({ loading: false, error: '', accessAvailable: true, product, brandName: shop.brandName, brandSubtitle: shop.brandSubtitle, supportLabel: shop.supportLabel });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '日常之物暂未开放') });
    }
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.navigateTo({ url: '/pages/daily-objects/index' });
  },
  handleMore() { wx.showToast({ title: '商品样式预览', icon: 'none' }); },
  handleSupport() { wx.navigateTo({ url: `/pages/contact-support/index?productId=${encodeURIComponent(this.productId)}` }); },
  toggleSection(event: WechatMiniprogram.CustomEvent) {
    const section = String(event.currentTarget.dataset.section || '');
    this.setData({ openSection: this.data.openSection === section ? '' : section });
  },
  addToBag() { wx.navigateTo({ url: '/pages/daily-bag/index' }); },
  buyProduct() { wx.showToast({ title: '购买入口待开放', icon: 'none' }); },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const url = tabs[Number(event.currentTarget.dataset.index)];
    if (url) wx.switchTab({ url });
  },
});
