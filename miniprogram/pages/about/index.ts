import { apiErrorMessage, request } from '../../utils/request';
import { DEFAULT_ABOUT_CONTENT, isAboutContent } from '../../utils/content';
import type { AboutContent } from '../../utils/content';

Page({
  data: { statusBarHeight: 0, loading: true, error: '', content: DEFAULT_ABOUT_CONTENT as AboutContent },
  onLoad() { this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); },
  onShow() { void this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const content = await request<AboutContent>('/content/about', { header: { 'Cache-Control': 'no-cache' } });
      if (!isAboutContent(content)) throw new Error('关于 MYRIAD SHE 内容格式无效');
      this.setData({ content, loading: false });
    } catch (caught) {
      this.setData({ content: DEFAULT_ABOUT_CONTENT, loading: false, error: apiErrorMessage(caught, '当前显示内置品牌信息。') });
    }
  },
  handleBack() { wx.navigateBack({ delta: 1 }); },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const path = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'][Number(event.currentTarget.dataset.index)];
    if (path) wx.switchTab({ url: path });
  },
});
