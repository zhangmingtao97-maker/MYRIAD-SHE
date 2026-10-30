const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];

Page({
  data: { statusBarHeight: 0 },
  onLoad() {
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
});
