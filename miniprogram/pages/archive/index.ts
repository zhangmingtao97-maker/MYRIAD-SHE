import { apiErrorMessage, request } from '../../utils/request';
import { isPublicArchive } from '../../utils/content';
import type { PublicArchiveIssue } from '../../utils/content';

interface ArchiveListItem extends PublicArchiveIssue {
  number: string;
  statusLabel: string;
  subline: string;
  interactive: boolean;
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    issues: [] as ArchiveListItem[],
  },
  requestGeneration: 0,
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadArchive();
  },
  onShow() {
    if (!this.data.loading && !this.data.issues.length && !this.data.error) void this.loadArchive();
  },
  onHide() {
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
  },
  onUnload() { this.requestGeneration += 1; },
  async loadArchive() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const response = await request<{ issues: PublicArchiveIssue[] }>('/content/archive', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicArchive(response)) throw new Error('策展档案格式无效');
      const issues = response.issues.map((issue, index) => ({
        ...issue,
        number: String(index + 1).padStart(2, '0'),
        statusLabel: issue.status === 'published' ? '正在策展' : issue.month || issue.label,
        subline: issue.status === 'published' ? '当前这一期' : issue.question,
        interactive: issue.status === 'archived',
      }));
      this.setData({ issues, loading: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ issues: [], loading: false, error: apiErrorMessage(caught, '暂时无法读取策展档案') });
    }
  },
  openIssue(event: WechatMiniprogram.CustomEvent) {
    const code = String(event.currentTarget.dataset.code || '');
    const issue = this.data.issues.find((item) => item.code === code);
    if (!issue || !issue.interactive) return;
    wx.navigateTo({ url: `/pages/story-detail/index?issueCode=${encodeURIComponent(issue.code)}` });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
  openMore() { wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }); },
  onShareAppMessage() { return { title: '往期策展｜MYRIAD SHE', path: '/pages/archive/index' }; },
  onShareTimeline() { return { title: '往期策展｜MYRIAD SHE' }; },
});

export {};
