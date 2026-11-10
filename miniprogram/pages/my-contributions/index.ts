import { apiErrorMessage, request } from '../../utils/request';
import { readLocalDiscussion, removeLocalContribution } from '../../utils/discussion-storage';
import type { LocalContribution } from '../../utils/discussion-storage';

interface CloudContribution {
  id: string;
  issueCode: string;
  issueLabel: string;
  threadId: string;
  threadAuthor: string | null;
  parentContributionId?: string | null;
  body: string;
  status: 'pending' | 'handled' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

function isCloudContribution(value: unknown): value is CloudContribution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.issueCode === 'string'
    && typeof item.issueLabel === 'string'
    && typeof item.threadId === 'string'
    && (item.parentContributionId === undefined || item.parentContributionId === null || typeof item.parentContributionId === 'string')
    && typeof item.body === 'string'
    && ['pending', 'handled', 'dismissed'].includes(String(item.status));
}

Page({
  data: {
    statusBarHeight: 0,
    cloudContributions: [] as CloudContribution[],
    localContributions: [] as LocalContribution[],
    loading: true,
    error: '',
    deletingId: '',
  },
  requestGeneration: 0,
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
  },
  onShow() {
    this.syncLocalContributions();
    void this.loadCloudContributions();
  },
  onHide() {
    this.requestGeneration += 1;
  },
  syncLocalContributions() {
    const contributions = readLocalDiscussion().contributions
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    this.setData({ localContributions: contributions });
  },
  async loadCloudContributions() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const result = await request<CloudContribution[]>('/discussion/contributions');
      if (generation !== this.requestGeneration) return;
      if (!Array.isArray(result) || !result.every(isCloudContribution)) throw new Error('已保存经历列表格式无效');
      this.setData({ cloudContributions: result, loading: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取已保存经历。') });
    }
  },
  deleteCloudContribution(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.cloudContributions.find((entry) => entry.id === id);
    if (!item || this.data.deletingId) return;
    wx.showModal({
      title: '删除已保存经历',
      content: '删除后，这段经历会从你的账户和运营审核列表中永久移除。',
      confirmText: '删除经历',
      confirmColor: '#663124',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ deletingId: id });
        try {
          const parentContributionId = typeof item.parentContributionId === 'string' ? item.parentContributionId : '';
          const query = `issueCode=${encodeURIComponent(item.issueCode)}&threadId=${encodeURIComponent(item.threadId)}${parentContributionId ? `&parentContributionId=${encodeURIComponent(parentContributionId)}` : ''}`;
          const result = await request<{ deleted: boolean }>(`/discussion/contributions/mine?${query}`, { method: 'DELETE' });
          if (!result.deleted) throw new Error('这段经历已不存在');
          this.setData({ cloudContributions: this.data.cloudContributions.filter((entry) => entry.id !== id) });
          wx.showToast({ title: '已删除', icon: 'none' });
        } catch (caught) {
          wx.showToast({ title: apiErrorMessage(caught, '删除失败，请稍后重试。'), icon: 'none' });
        } finally {
          this.setData({ deletingId: '' });
        }
      },
    });
  },
  deleteLocalContribution(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!this.data.localContributions.some((item) => item.id === id)) return;
    wx.showModal({
      title: '删除本机发言',
      content: '只删除这台设备保存的这段经历，不会影响已发布的内容。',
      confirmText: '删除',
      success: ({ confirm }) => {
        if (!confirm) return;
        removeLocalContribution(id);
        this.syncLocalContributions();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },
  openLocalDiscussion(event: WechatMiniprogram.CustomEvent) {
    const issueCode = String(event.currentTarget.dataset.issueCode || '');
    wx.navigateTo({ url: issueCode ? `/pages/discussion/index?issueCode=${encodeURIComponent(issueCode)}` : '/pages/discussion/index' });
  },
  openCurrentDiscussion() {
    wx.navigateTo({ url: '/pages/discussion/index' });
  },
  goBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/mine/index' }) });
  },
});
