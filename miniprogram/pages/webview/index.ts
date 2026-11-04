let loadTimer: ReturnType<typeof setTimeout> | undefined;

Page({
  data: {
    url: '',
    targetUrl: '',
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
    this.setData({ url, targetUrl: url, error: '' });
    loadTimer = setTimeout(() => {
      if (!this.data.url) return;
      this.setData({ url: '', error: '网页加载超时，请复制链接后在浏览器打开' });
    }, 8000);
  },
  onUnload() {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = undefined;
  },
  handleLoad() {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = undefined;
  },
  handleError() {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = undefined;
    this.setData({ url: '', error: '网页暂时无法打开，请复制链接后在浏览器打开' });
  },
  copyLink() {
    if (!this.data.targetUrl) return;
    wx.setClipboardData({
      data: this.data.targetUrl,
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
});
