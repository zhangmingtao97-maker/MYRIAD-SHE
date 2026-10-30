import { apiErrorMessage, request } from '../../utils/request';
import { isPublicDiscussion } from '../../utils/discussion-content';
import type { DiscussionThread, PublicDiscussion } from '../../utils/discussion-content';
import { discussionStorageKey, readLocalDiscussion, reportLocalThread } from '../../utils/discussion-storage';
import type { LocalContribution } from '../../utils/discussion-storage';

type DisplayThread = DiscussionThread & { localReplies: LocalContribution[]; expanded: boolean; reported: boolean };

Page({
  data: { statusBarHeight: 0, issueCode: '', issueLabel: '', content: null as PublicDiscussion['content'] | null, threads: [] as DisplayThread[], myPosts: [] as LocalContribution[], loading: true, error: '', localPostCount: 0 },
  requestGeneration: 0,
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, issueCode: query.issueCode || '' });
    void this.load();
  },
  onShow() { this.syncLocalContent(); },
  onHide() { this.requestGeneration += 1; if (this.data.loading) this.setData({ loading: false }); },
  syncLocalContent() {
    const stored = readLocalDiscussion();
    const issueCode = this.data.issueCode;
    const mine = stored.contributions.filter((entry) => entry.issueCode === issueCode);
    const localReplies = (threadId: string) => mine.filter((entry) => entry.threadId === threadId);
    this.setData({ myPosts: mine.filter((entry) => !entry.threadId), localPostCount: mine.length,
      threads: this.data.threads.map((thread) => ({ ...thread, localReplies: localReplies(thread.id), reported: stored.reports.some((item) => item.issueCode === issueCode && item.threadId === thread.id) })) });
  },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    const path = this.data.issueCode ? `/content/discussion?issueCode=${encodeURIComponent(this.data.issueCode)}` : '/content/discussion';
    try {
      const data = await request<PublicDiscussion>(path);
      if (generation !== this.requestGeneration) return;
      if (!isPublicDiscussion(data)) throw new Error('本期讨论内容格式无效');
      this.setData({ issueCode: data.issueCode, issueLabel: data.issueLabel, content: data.content, threads: data.content.threads.map((thread) => ({ ...thread, expanded: true, localReplies: [], reported: false })), loading: false, error: '' });
      this.syncLocalContent();
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取本期讨论') });
    }
  },
  handleBack() { wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) }); },
  handleMore() {
    const itemList = this.data.localPostCount ? ['本机内容说明', '清除本期本机发言'] : ['本机内容说明'];
    wx.showActionSheet({ itemList, success: ({ tapIndex }) => {
      if (tapIndex === 0) wx.showModal({ title: '讨论说明', content: '本页中的经历与追问是排版示例。保存的新经历会进入运营后台供编辑团队查看和处理，不会自动公开；举报标记仍保存在当前设备。', showCancel: false });
      if (tapIndex === 1) wx.showModal({ title: '清除本机发言', content: '仅删除本期在这台设备保存的经历与回复。已发布的示例内容不会改变。', confirmText: '清除', success: ({ confirm }) => {
        if (!confirm) return;
        const stored = readLocalDiscussion();
        wx.setStorageSync(discussionStorageKey, { contributions: stored.contributions.filter((entry) => entry.issueCode !== this.data.issueCode), reports: stored.reports.filter((entry) => entry.issueCode !== this.data.issueCode), drafts: stored.drafts.filter((entry) => entry.issueCode !== this.data.issueCode) });
        this.syncLocalContent();
      } });
    } });
  },
  writeExperience(event?: WechatMiniprogram.CustomEvent) {
    this.openComposer(String(event?.currentTarget.dataset.threadId || ''));
  },
  replyToThread(event: WechatMiniprogram.CustomEvent) { this.openComposer(String(event.currentTarget.dataset.threadId || '')); },
  openComposer(threadId: string) {
    const thread = this.data.threads.find((item) => item.id === threadId);
    const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(threadId)}&threadAuthor=${encodeURIComponent(thread?.author || '')}`;
    wx.navigateTo({ url: `/pages/discussion-compose/index?${query}` });
  },
  reportThread(event: WechatMiniprogram.CustomEvent) {
    const threadId = String(event.currentTarget.dataset.threadId || '');
    const thread = this.data.threads.find((item) => item.id === threadId);
    if (!thread) return;
    wx.showModal({ title: '举报示例内容', content: '原型演示中的举报标记只保存在本机，不会发送到后台。要标记这条示例内容吗？', confirmText: '继续', success: ({ confirm }) => {
      if (!confirm) return;
      const reasons = ['不适当内容', '垃圾信息', '隐私问题', '其他'];
      wx.showActionSheet({ itemList: reasons, success: ({ tapIndex }) => {
        reportLocalThread({ issueCode: this.data.issueCode, threadId, reason: reasons[tapIndex] || '其他' });
        this.syncLocalContent();
        wx.showToast({ title: '已在本机标记', icon: 'none' });
      } });
    } });
  },
  toggleConversation(event: WechatMiniprogram.CustomEvent) {
    const threadId = String(event.currentTarget.dataset.threadId || '');
    const index = this.data.threads.findIndex((item) => item.id === threadId);
    if (index < 0) return;
    this.setData({ [`threads[${index}].expanded`]: !this.data.threads[index].expanded });
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
