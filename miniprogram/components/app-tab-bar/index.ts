const tabs = [
  { pagePath: 'pages/home/index', text: '首页', key: 'home' },
  { pagePath: 'pages/practice/index', text: '实践', key: 'practice' },
  { pagePath: 'pages/mine/index', text: '我的', key: 'mine' },
];

Component({
  data: { selected: 0, list: tabs },
  pageLifetimes: {
    show() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = currentPage?.route || '';
      const selected = route === 'pages/observation/index' || route === 'pages/season-intro/index' ? 1
        : route === 'pages/archive/index' || route === 'pages/story-detail/index' ? 0
          : tabs.findIndex((tab) => tab.pagePath === route);
      if (selected >= 0) this.setData({ selected });
    },
  },
  methods: {
    switchTab(event: WechatMiniprogram.CustomEvent) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = tabs[index];
      if (!tab) return;
      this.setData({ selected: index });
      wx.switchTab({
        url: `/${tab.pagePath}`,
        success: () => this.setData({ selected: index }),
        fail: () => {
          wx.reLaunch({ url: `/${tab.pagePath}` });
        },
      });
    },
  },
});

export {};
