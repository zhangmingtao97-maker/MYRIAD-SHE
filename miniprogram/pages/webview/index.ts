Page({
  data: {
    url: '',
    error: '',
  },
  onLoad(query: Record<string, string | undefined>) {
    let url = '';
    try {
      url = decodeURIComponent(query.url || '');
    } catch {
      url = '';
    }
    if (!/^https:\/\/[^\s<>]+$/i.test(url)) {
      this.setData({ error: '这个网站链接不可用' });
      return;
    }
    this.setData({ url, error: '' });
  },
  handleError() {
    this.setData({ url: '', error: '网页暂时无法打开，请稍后再试' });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
});
