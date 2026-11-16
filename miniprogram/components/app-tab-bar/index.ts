const tabs = [
  { pagePath: 'pages/home/index', text: '首页', key: 'home' },
  { pagePath: 'pages/practice/index', text: '实践', key: 'practice' },
  { pagePath: 'pages/mine/index', text: '我的', key: 'mine' },
];

Component({
  properties: {
    activeTab: { type: Number, value: -1, observer() { this.syncSelected(); } },
  },
  data: { selected: 0, list: tabs },
  lifetimes: {
    attached() { this.syncSelected(); },
  },
  pageLifetimes: {
    show() { this.syncSelected(); },
  },
  methods: {
    syncSelected() {
      const activeTab = this.properties.activeTab;
      if (Number.isInteger(activeTab) && activeTab >= 0 && activeTab < tabs.length) {
        this.setData({ selected: activeTab });
        return;
      }
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = currentPage?.route || '';
      const selected = route === 'pages/observation/index' || route === 'pages/season-intro/index' ? 1
        : route === 'pages/archive/index' || route === 'pages/story-detail/index' ? 0
          : tabs.findIndex((tab) => tab.pagePath === route);
      if (selected >= 0) this.setData({ selected });
    },
    switchTab(event: WechatMiniprogram.CustomEvent) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = tabs[index];
      if (!tab) return;
      wx.switchTab({
        url: `/${tab.pagePath}`,
        success: () => this.syncSelected(),
        fail: () => {
          wx.reLaunch({ url: `/${tab.pagePath}`, complete: () => this.syncSelected() });
        },
      });
    },
  },
});

export {};
