import { apiErrorMessage, request } from '../../utils/request';
import { isPublicDiscussion } from '../../utils/discussion-content';
import type { DiscussionReply, PublicDiscussion } from '../../utils/discussion-content';
import { readLocalDiscussion } from '../../utils/discussion-storage';
import type { LocalContribution } from '../../utils/discussion-storage';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

interface ConversationThread { author: string; body: string; replies: DiscussionReply[] }
interface CloudReport { threadId: string; status: 'pending' | 'handled' | 'dismissed' }
const reportReasons = [
  { code: 'inappropriate', label: '不适当内容' },
  { code: 'spam', label: '垃圾信息' },
  { code: 'privacy', label: '隐私问题' },
  { code: 'other', label: '其他' },
];

function decodeQueryValue(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

Page({
  data: {
    statusBarHeight: 0, issueCode: '', threadId: '', number: '',
    intro: '', thread: null as ConversationThread | null, localReplies: [] as LocalContribution[],
    loading: true, error: '', reported: false, reporting: false,
  },
  requestGeneration: 0,
  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight,
      issueCode: decodeQueryValue(query.issueCode || ''),
      threadId: decodeQueryValue(query.threadId || ''),
    });
    void this.load();
  },
  onShow() { if (this.data.thread) this.syncLocal(); },
  onHide() { this.requestGeneration += 1; if (this.data.loading) this.setData({ loading: false }); },
  syncLocal() {
    const thread = this.data.thread;
    if (!thread) return;
    this.setData({
      localReplies: readLocalDiscussion().contributions
        .filter((entry) => entry.issueCode === this.data.issueCode && entry.threadId === this.data.threadId)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
    });
  },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      if (!this.data.issueCode) throw new Error('缺少本期讨论信息');
      const data = await request<PublicDiscussion>(`/content/discussion?issueCode=${encodeURIComponent(this.data.issueCode)}`);
      if (generation !== this.requestGeneration) return;
      if (!isPublicDiscussion(data)) throw new Error('本期讨论内容格式无效');
      const thread = data.content.threads.find((entry) => entry.id === this.data.threadId);
      if (!thread) throw new Error('这段对话暂时无法读取');
      this.setData({
        number: data.content.copy.number,
        intro: data.content.copy.intro,
        thread: { author: thread.author, body: thread.body, replies: thread.replies },
        loading: false,
        error: '',
      });
      this.syncLocal();
      void this.loadReports();
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取这段对话') });
    }
  },
  async loadReports() {
    try {
      const items = await request<CloudReport[]>(`/discussion/reports/mine?issueCode=${encodeURIComponent(this.data.issueCode)}`);
      if (!Array.isArray(items)) return;
      this.setData({ reported: items.some((item) => item && item.threadId === this.data.threadId) });
    } catch { /* 未登录或网络异常时不影响阅读，举报入口会在提交时再要求登录 */ }
  },
  handleBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: `/pages/discussion/index?issueCode=${encodeURIComponent(this.data.issueCode)}` }) }); },
  handleMore() {
    wx.showModal({ title: '讨论说明', content: '本页中的经历与追问是排版示例。保存的新经历会进入运营后台供编辑团队查看和处理，不会自动公开；举报会连同本期讨论一起提交到运营后台，由编辑团队核实处理。', showCancel: false });
  },
  replyTo(event: WechatMiniprogram.CustomEvent) {
    const author = decodeQueryValue(String(event.currentTarget.dataset.author || '')) || this.data.thread?.author || '';
    this.openComposer(author);
  },
  openComposer(author: string) {
    const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(this.data.threadId)}&threadAuthor=${encodeURIComponent(author)}`;
    wx.navigateTo({ url: `/pages/discussion-compose/index?${query}` });
  },
  continueTalk() {
    if (!this.data.thread) return;
    this.openComposer(this.data.thread.author);
  },
  viewOtherThreads() {
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: `/pages/discussion/index?issueCode=${encodeURIComponent(this.data.issueCode)}` }) });
  },
  reportThread() {
    if (!this.data.thread || this.data.reporting) return;
    if (this.data.reported) {
      wx.showModal({ title: '这条内容已举报', content: '编辑团队正在核实处理。如果你还想补充说明，可以通过「联系我们」告诉我们。', showCancel: false, confirmText: '知道了' });
      return;
    }
    wx.showModal({
      title: '举报这条内容',
      content: '举报会连同本期讨论一起提交到运营后台，由编辑团队核实处理；处理过程不会向对方公开你的身份。',
      confirmText: '继续举报',
      cancelText: '取消',
      success: ({ confirm }) => { if (confirm) this.chooseReportReason(); },
    });
  },
  chooseReportReason() {
    wx.showActionSheet({ itemList: reportReasons.map((reason) => reason.label), success: ({ tapIndex }) => {
      const reason = reportReasons[tapIndex];
      if (!reason) return;
      void this.submitReport(reason.code);
    } });
  },
  async submitReport(reason: string) {
    if (this.data.reporting) return;
    this.setData({ reporting: true });
    wx.showLoading({ title: '正在提交举报', mask: true });
    try {
      await request<{ id: string }>('/discussion/reports', { method: 'POST', data: { issueCode: this.data.issueCode, threadId: this.data.threadId, reason } });
      wx.hideLoading();
      this.setData({ reported: true });
      wx.showToast({ title: '已提交举报', icon: 'none' });
    } catch (caught) {
      wx.hideLoading();
      wx.showModal({ title: '举报没有提交成功', content: apiErrorMessage(caught, '请检查网络后重试。'), showCancel: false, confirmText: '知道了' });
    } finally {
      this.setData({ reporting: false });
    }
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const paths = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];
    const path = paths[Number(event.currentTarget.dataset.index)];
    if (path) wx.switchTab({ url: path });
  },
  onShareAppMessage() {
    return shareCard({
      title: this.data.thread ? `${this.data.thread.author}｜一段对话` : '一段对话｜MYRIAD SHE',
      path: '/pages/discussion-thread/index',
      query: { issueCode: this.data.issueCode, threadId: this.data.threadId },
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: this.data.thread ? `${this.data.thread.author}｜一段对话` : '一段对话｜MYRIAD SHE',
      query: { issueCode: this.data.issueCode, threadId: this.data.threadId },
    });
  },
});
