import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];

Page({
  data: { statusBarHeight: 0 },
  onLoad() {
    enableShareMenu();
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });
    wx.setNavigationBarTitle({ title: '联系支持' });
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.navigateTo({ url: '/pages/daily-objects/index' });
  },
  handleMore() { wx.showToast({ title: '联系支持', icon: 'none' }); },
  handleContact() {
    wx.showToast({ title: '品牌客服渠道待开放', icon: 'none' });
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const url = tabs[Number(event.currentTarget.dataset.index)];
    if (url) wx.switchTab({ url });
  },
  onShareAppMessage() {
    return shareCard({
      title: '联系与支持｜MYRIAD SHE',
      path: '/pages/contact-support/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: '联系与支持｜MYRIAD SHE',
      query: {},
    });
  },
});
