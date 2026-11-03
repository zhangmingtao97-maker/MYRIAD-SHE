import { apiErrorMessage, request } from '../../utils/request';
import { isPublicDiscussion } from '../../utils/discussion-content';
import type { DiscussionThread, PublicDiscussion } from '../../utils/discussion-content';
import { discussionStorageKey, readLocalDiscussion } from '../../utils/discussion-storage';
import type { LocalContribution, LocalDiscussionDraft } from '../../utils/discussion-storage';

type DisplayThread = DiscussionThread & { reported: boolean };
interface CloudReport { threadId: string; status: 'pending' | 'handled' | 'dismissed' }
const reportReasons = [
  { code: 'inappropriate', label: '不适当内容' },
  { code: 'spam', label: '垃圾信息' },
  { code: 'privacy', label: '隐私问题' },
  { code: 'other', label: '其他' },
];

Page({
  data: { statusBarHeight: 0, issueCode: '', issueLabel: '', content: null as PublicDiscussion['content'] | null, threads: [] as DisplayThread[], myPosts: [] as LocalContribution[], draft: null as LocalDiscussionDraft | null, loading: true, error: '', localPostCount: 0, reporting: false },
  requestGeneration: 0,
  reportedThreads: {} as Record<string, boolean>,
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, issueCode: query.issueCode || '' });
    void this.load();
  },
  onShow() { this.syncLocalContent(); if (!this.data.loading) void this.loadReports(); },
  onHide() { this.requestGeneration += 1; if (this.data.loading) this.setData({ loading: false }); },
  syncLocalContent() {
    const stored = readLocalDiscussion();
    const issueCode = this.data.issueCode;
    const mine = stored.contributions.filter((entry) => entry.issueCode === issueCode);
    const draft = stored.drafts
      .filter((entry) => entry.issueCode === issueCode)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null;
    this.setData({ myPosts: mine.filter((entry) => !entry.threadId), localPostCount: mine.length, draft,
      threads: this.data.threads.map((thread) => ({ ...thread, reported: Boolean(this.reportedThreads[thread.id]) })) });
  },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    const path = this.data.issueCode ? `/content/discussion?issueCode=${encodeURIComponent(this.data.issueCode)}` : '/content/discussion';
    try {
      const data = await request<PublicDiscussion>(path);
      if (generation !== this.requestGeneration) return;
      if (!isPublicDiscussion(data)) throw new Error('本期讨论内容格式无效');
      this.setData({ issueCode: data.issueCode, issueLabel: data.issueLabel, content: data.content, threads: data.content.threads.map((thread) => ({ ...thread, reported: false })), loading: false, error: '' });
      this.syncLocalContent();
      void this.loadReports();
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取本期讨论') });
    }
  },
  async loadReports() {
    if (!this.data.issueCode) return;
    try {
      const items = await request<CloudReport[]>(`/discussion/reports/mine?issueCode=${encodeURIComponent(this.data.issueCode)}`);
      if (!Array.isArray(items)) return;
      const next: Record<string, boolean> = {};
      for (const item of items) {
        if (item && typeof item.threadId === 'string' && item.threadId) next[item.threadId] = true;
      }
      this.reportedThreads = next;
      this.syncLocalContent();
    } catch { /* 未登录或网络异常时不影响浏览，举报入口会在提交时再要求登录 */ }
  },
  handleBack() { wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) }); },
  handleMore() {
    const itemList = this.data.localPostCount ? ['讨论说明', '清除本期本机发言'] : ['讨论说明'];
    wx.showActionSheet({ itemList, success: ({ tapIndex }) => {
      if (tapIndex === 0) wx.showModal({ title: '讨论说明', content: '本页中的经历与追问是排版示例。保存的新经历会进入运营后台供编辑团队查看和处理，不会自动公开；举报会连同本期讨论一起提交到运营后台，由编辑团队核实处理。', showCancel: false });
      if (tapIndex === 1) wx.showModal({ title: '清除本机发言', content: '仅删除本期在这台设备保存的经历与回复。已发布的示例内容不会改变，已提交的举报也不会被撤回。', confirmText: '清除', success: ({ confirm }) => {
        if (!confirm) return;
        const stored = readLocalDiscussion();
        wx.setStorageSync(discussionStorageKey, { contributions: stored.contributions.filter((entry) => entry.issueCode !== this.data.issueCode), drafts: stored.drafts.filter((entry) => entry.issueCode !== this.data.issueCode) });
        this.syncLocalContent();
      } });
    } });
  },
  writeExperience(event?: WechatMiniprogram.CustomEvent) {
    this.openComposer(String(event?.currentTarget.dataset.threadId || ''));
  },
  replyToThread(event: WechatMiniprogram.CustomEvent) { this.openComposer(String(event.currentTarget.dataset.threadId || '')); },
  continueDraft() { if (this.data.draft) this.openComposer(this.data.draft.threadId); },
  openComposer(threadId: string) {
    const thread = this.data.threads.find((item) => item.id === threadId);
    const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(threadId)}&threadAuthor=${encodeURIComponent(thread?.author || '')}`;
    wx.navigateTo({ url: `/pages/discussion-compose/index?${query}` });
  },
  reportThread(event: WechatMiniprogram.CustomEvent) {
    const threadId = String(event.currentTarget.dataset.threadId || '');
    const thread = this.data.threads.find((item) => item.id === threadId);
    if (!thread || this.data.reporting) return;
    if (this.reportedThreads[threadId]) {
      wx.showModal({ title: '这条内容已举报', content: '编辑团队正在核实处理。如果你还想补充说明，可以通过「联系我们」告诉我们。', showCancel: false, confirmText: '知道了' });
      return;
    }
    wx.showModal({
      title: '举报这条内容',
      content: '举报会连同本期讨论一起提交到运营后台，由编辑团队核实处理；处理过程不会向对方公开你的身份。',
      confirmText: '继续举报',
      cancelText: '取消',
      success: ({ confirm }) => { if (confirm) this.chooseReportReason(threadId); },
    });
  },
  chooseReportReason(threadId: string) {
    wx.showActionSheet({ itemList: reportReasons.map((reason) => reason.label), success: ({ tapIndex }) => {
      const reason = reportReasons[tapIndex];
      if (!reason) return;
      void this.submitReport(threadId, reason.code);
    } });
  },
  async submitReport(threadId: string, reason: string) {
    if (this.data.reporting) return;
    this.setData({ reporting: true });
    wx.showLoading({ title: '正在提交举报', mask: true });
    try {
      await request<{ id: string }>('/discussion/reports', { method: 'POST', data: { issueCode: this.data.issueCode, threadId, reason } });
      wx.hideLoading();
      this.reportedThreads = { ...this.reportedThreads, [threadId]: true };
      this.syncLocalContent();
      wx.showToast({ title: '已提交举报', icon: 'none' });
    } catch (caught) {
      wx.hideLoading();
      wx.showModal({ title: '举报没有提交成功', content: apiErrorMessage(caught, '请检查网络后重试。'), showCancel: false, confirmText: '知道了' });
    } finally {
      this.setData({ reporting: false });
    }
  },
  openConversation(event: WechatMiniprogram.CustomEvent) {
    const threadId = String(event.currentTarget.dataset.threadId || '');
    if (!threadId) return;
    wx.navigateTo({ url: `/pages/discussion-thread/index?issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(threadId)}` });
  },
  openPrivateObservation() {
    wx.navigateTo({ url: `/pages/observation/index?issueCode=${encodeURIComponent(this.data.issueCode)}` });
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const paths = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];
    const path = paths[Number(event.currentTarget.dataset.index)];
    if (path) wx.switchTab({ url: path });
  },
});
