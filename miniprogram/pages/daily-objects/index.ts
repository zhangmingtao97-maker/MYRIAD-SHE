import { apiErrorMessage, request } from '../../utils/request';
import { isDailyObjectsContent, isPracticeContent, isPublicHomeContent, isStoreStatus } from '../../utils/content';
import type { DailyObjectsContent, PracticeContent, PublicHomeContent, StoreStatus } from '../../utils/content';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
import { fetchBrandPopup, markBrandPopupShown, shouldShowBrandPopup } from '../../utils/brand-popup';
import type { BrandPopupConfig } from '../../utils/brand-popup';

const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];
type OfficialArticleRuntime = typeof wx & {
  openOfficialAccountArticle?: (options: { url: string; fail?: (error: unknown) => void }) => void;
};

function normalizedText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
}

function articleExcerpt(value: unknown) {
  const text = normalizedText(value);
  return text.length > 520 ? `${text.slice(0, 520).trimEnd()}…` : text;
}

Page({
  data: {
    statusBarHeight: 0,
    coverImageHeight: 394,
    products: [] as DailyObjectsContent['products'],
    content: null as DailyObjectsContent | null,
    articleTitle: '',
    articleExcerpt: '',
    articleImageUrl: '',
    articleImageAlt: '人物日常图片',
    articleCaption: '',
    officialArticleUrl: '',
    articleButtonLabel: '前往公众号阅读完整文章',
    loading: true,
    error: '',
    accessAvailable: false,
    shopOpen: false,
    brandPopup: null as BrandPopupConfig | null,
  },
  requestGeneration: 0,
  brandPopupGeneration: 0,
  onLoad() {
    enableShareMenu();
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight, coverImageHeight: Math.round(windowInfo.windowWidth * 0.9) });
    void this.loadPreviewAccess();
    void this.loadBrandPopup();
  },
  onShow() {
    if (!this.data.loading) void this.loadPreviewAccess();
  },
  onHide() {
    this.requestGeneration += 1;
    this.brandPopupGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
    if (this.data.brandPopup) this.setData({ brandPopup: null });
  },
  onUnload() {
    this.requestGeneration += 1;
    this.brandPopupGeneration += 1;
    if (this.data.brandPopup) this.setData({ brandPopup: null });
  },
  async loadBrandPopup() {
    const generation = ++this.brandPopupGeneration;
    const popup = await fetchBrandPopup('daily-objects');
    if (generation !== this.brandPopupGeneration || !popup || !shouldShowBrandPopup(popup.frequency, new Date(), 'daily-objects')) return;
    this.setData({ brandPopup: popup });
  },
  onBrandPopupClose() {
    this.setData({ brandPopup: null });
  },
  onBrandPopupShown() {
    if (this.data.brandPopup) markBrandPopupShown(this.data.brandPopup.frequency, new Date(), 'daily-objects');
  },
  async loadPreviewAccess() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const [data, status, home] = await Promise.all([
        request<PracticeContent>('/content/practice'),
        request<StoreStatus>('/content/store-status'),
        request<PublicHomeContent>('/content/home'),
      ]);
      if (generation !== this.requestGeneration) return;
      if (!isPracticeContent(data)) throw new Error('实践内容格式无效');
      if (!isStoreStatus(status)) throw new Error('商城状态格式无效');
      if (!isPublicHomeContent(home)) throw new Error('首页内容格式无效');
      const shop = await request<DailyObjectsContent>('/content/daily-objects');
      if (generation !== this.requestGeneration) return;
      if (!isDailyObjectsContent(shop)) throw new Error('日常之物内容格式无效');
      // 总闸开启且「日常之物」入口启用，才展示商品；否则只显示未开放落地页。
      const entryEnabled = data.entries.some((entry) => String(entry.target || entry.key) === 'daily-goods' && entry.enabled);
      const shopOpen = status.open === true && entryEnabled;
      const story = home.modules?.find((module) => module.type === 'story' && module.enabled);
      const articleTitle = normalizedText(shop.articleTitle) || normalizedText(story?.title) || '她的日常，仍在继续。';
      const articleText = normalizedText(shop.articleExcerpt) || articleExcerpt(story?.body) || '从具体的生活细节里，看见一个人如何慢慢回到自己的节奏。';
      this.setData({
        loading: false,
        error: '',
        accessAvailable: true,
        shopOpen,
        content: shop,
        products: shopOpen ? shop.products.filter((product) => product.enabled) : [],
        articleTitle,
        articleExcerpt: articleText,
        articleImageUrl: normalizedText(shop.articleImageUrl) || normalizedText(shop.articleImage) || normalizedText(story?.imageUrl),
        articleImageAlt: normalizedText(shop.articleImageAlt) || normalizedText(story?.altText) || '人物日常图片',
        articleCaption: normalizedText(shop.articleCaption) || normalizedText(story?.captionRight) || normalizedText(story?.captionLeft),
        officialArticleUrl: normalizedText(shop.officialArticleUrl) || normalizedText(story?.officialArticleUrl),
        articleButtonLabel: normalizedText(shop.officialArticleButton) || '前往公众号阅读完整文章',
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
  onArticleImageError() { this.setData({ articleImageUrl: '' }); },
  openOfficialArticle() {
    const url = this.data.officialArticleUrl;
    if (!url) {
      wx.showToast({ title: '公众号文章链接暂未配置', icon: 'none' });
      return;
    }
    const runtime = wx as OfficialArticleRuntime;
    if (!runtime.openOfficialAccountArticle) {
      wx.showToast({ title: '请更新微信后再打开公众号文章', icon: 'none' });
      return;
    }
    runtime.openOfficialAccountArticle({ url, fail: () => wx.showToast({ title: '暂时无法打开公众号文章', icon: 'none' }) });
  },
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
  onShareAppMessage() {
    return shareCard({
      title: '日常之物｜MYRIAD SHE',
      path: '/pages/daily-objects/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: '日常之物｜MYRIAD SHE',
      query: {},
    });
  },
});
