import { apiErrorMessage, request } from '../../utils/request';
import { discussionRestrictionRecoveryText, isDiscussionRestrictionError, readDiscussionAccess } from '../../utils/discussion-access';
import type { DiscussionAccessStatus } from '../../utils/discussion-access';
import { discussionDetailCopyValue, isPublicDiscussion } from '../../utils/discussion-content';
import type { DiscussionCopy, DiscussionDetailCopyKey, DiscussionReply, PublicDiscussion } from '../../utils/discussion-content';
import { readLocalDiscussion } from '../../utils/discussion-storage';
import type { LocalContribution } from '../../utils/discussion-storage';
import { escapeHtml, richTextHtml } from '../../utils/rich-text';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

type DetailField = { text: string; html: string };
interface DiscussionDetailView {
  navTitle: DetailField; kicker: DetailField; title: DetailField; note: DetailField;
  exampleLabel: DetailField; communityLabel: DetailField; featuredLabel: DetailField; localLabel: DetailField;
  repliesTitle: DetailField; replyAction: DetailField; reportAction: DetailField; reportedAction: DetailField;
  replyContextExample: DetailField; replyContextCommunity: DetailField;
  footerPrimary: DetailField; footerSecondary: DetailField; moreTitle: DetailField; moreBody: DetailField;
  loading: DetailField; retry: DetailField;
}
type ConversationReply = DiscussionReply & { bodyHtml: string; sourceLabel: string; sourceLabelHtml: string; replyActionLabel: string; replyActionHtml: string };
interface ConversationThread {
  author: string;
  body: string;
  bodyRichText?: string;
  bodyHtml: string;
  replies: ConversationReply[];
  source?: 'editorial' | 'community';
  featured?: boolean;
  contributionId?: string;
  sourceLabel: string;
  sourceLabelHtml: string;
  replyActionLabel: string;
  replyActionHtml: string;
  replyContextText: string;
  replyContextHtml: string;
}
type DisplayLocalReply = LocalContribution & { bodyHtml: string; sourceLabel: string; sourceLabelHtml: string };

function detailField(copy: Partial<DiscussionCopy> | undefined, richText: Partial<Record<keyof DiscussionCopy, string>> | undefined, key: DiscussionDetailCopyKey): DetailField {
  const text = discussionDetailCopyValue(copy, key);
  return { text, html: richTextHtml(richText?.[key], text) };
}

function buildDiscussionDetailView(copy?: Partial<DiscussionCopy>, richText?: Partial<Record<keyof DiscussionCopy, string>>): DiscussionDetailView {
  return {
    navTitle: detailField(copy, richText, 'detailNavTitle'),
    kicker: detailField(copy, richText, 'detailKicker'),
    title: detailField(copy, richText, 'detailTitle'),
    note: detailField(copy, richText, 'detailNote'),
    exampleLabel: detailField(copy, richText, 'exampleLabel'),
    communityLabel: detailField(copy, richText, 'communityLabel'),
    featuredLabel: detailField(copy, richText, 'featuredLabel'),
    localLabel: detailField(copy, richText, 'localLabel'),
    repliesTitle: detailField(copy, richText, 'repliesTitle'),
    replyAction: detailField(copy, richText, 'replyAction'),
    reportAction: detailField(copy, richText, 'reportAction'),
    reportedAction: detailField(copy, richText, 'reportedAction'),
    replyContextExample: detailField(copy, richText, 'replyContextExample'),
    replyContextCommunity: detailField(copy, richText, 'replyContextCommunity'),
    footerPrimary: detailField(copy, richText, 'footerPrimary'),
    footerSecondary: detailField(copy, richText, 'footerSecondary'),
    moreTitle: detailField(copy, richText, 'detailMoreTitle'),
    moreBody: detailField(copy, richText, 'detailMoreBody'),
    loading: detailField(copy, richText, 'detailLoading'),
    retry: detailField(copy, richText, 'detailRetry'),
  };
}

function appendAuthor(field: DetailField, author: string): DetailField {
  if (field.html.includes('{author}') || field.text.includes('{author}')) {
    return {
      text: field.text.replace(/\{author\}/g, author),
      html: field.html.replace(/\{author\}/g, escapeHtml(author)),
    };
  }
  return { text: `${field.text}${author}`, html: `${field.html}${escapeHtml(author)}` };
}

function replaceAuthor(field: DetailField, author: string): DetailField {
  return {
    text: field.text.replace(/\{author\}/g, author),
    html: field.html.replace(/\{author\}/g, escapeHtml(author)),
  };
}

function trustedBodyHtml(item: { body: string; bodyRichText?: string; source?: 'editorial' | 'community'; contributionId?: string }) {
  return richTextHtml(item.source !== 'community' && !item.contributionId ? item.bodyRichText : '', item.body);
}
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
    statusBarHeight: 0, issueCode: '', threadId: '', number: '', numberHtml: '',
    intro: '', introHtml: '', thread: null as ConversationThread | null, localReplies: [] as DisplayLocalReply[],
    detail: buildDiscussionDetailView(),
    loading: true, error: '', restricted: false, restrictionReason: '', restrictionMessage: '', appealContact: '', supportContact: '', reported: false, reporting: false,
  },
  requestGeneration: 0,
  hasShown: false,
  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight,
      issueCode: decodeQueryValue(query.issueCode || ''),
      threadId: decodeQueryValue(query.threadId || ''),
    });
    void this.load();
  },
  onShow() {
    if (!this.hasShown) { this.hasShown = true; return; }
    void this.load();
  },
  onHide() { this.requestGeneration += 1; if (this.data.loading) this.setData({ loading: false }); },
  syncLocal() {
    const thread = this.data.thread;
    if (this.data.restricted || !thread) return;
    this.setData({
      localReplies: readLocalDiscussion().contributions
        .filter((entry) => entry.issueCode === this.data.issueCode && entry.threadId === this.data.threadId)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .map((entry) => ({ ...entry, bodyHtml: richTextHtml('', entry.body), sourceLabel: this.data.detail.localLabel.text, sourceLabelHtml: this.data.detail.localLabel.html })),
    });
  },
  applyDiscussionRestriction(access: DiscussionAccessStatus) {
    this.setData({ restricted: true, restrictionReason: access.reason || '', restrictionMessage: discussionRestrictionRecoveryText(access.endsAt), appealContact: access.appealContact || '', supportContact: access.supportContact || '' });
  },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ detail: buildDiscussionDetailView(), loading: true, error: '', restricted: false, restrictionReason: '', restrictionMessage: '', appealContact: '', supportContact: '', thread: null, localReplies: [] });
    try {
      const access = await readDiscussionAccess();
      if (generation !== this.requestGeneration) return;
      if (access.restricted) {
        this.setData({
          number: '',
          numberHtml: '',
          intro: '',
          introHtml: '',
          thread: null,
          localReplies: [],
          reported: false,
          loading: false,
          error: '',
        });
        this.applyDiscussionRestriction(access);
        return;
      }
      if (!this.data.issueCode) throw new Error('缺少本期讨论信息');
      const data = await request<PublicDiscussion>(`/content/discussion?issueCode=${encodeURIComponent(this.data.issueCode)}`);
      if (generation !== this.requestGeneration) return;
      if (!isPublicDiscussion(data)) throw new Error('本期讨论内容格式无效');
      const thread = data.content.threads.find((entry) => entry.id === this.data.threadId);
      if (!thread) throw new Error('这段对话暂时无法读取');
      const detail = buildDiscussionDetailView(data.content.copy, data.content.copyRichText);
      const isCommunity = thread.source === 'community' || Boolean(thread.contributionId);
      const sourceLabel = isCommunity ? detail.communityLabel : detail.exampleLabel;
      const replyAction = appendAuthor(detail.replyAction, thread.author);
      const replyContext = replaceAuthor(isCommunity ? detail.replyContextCommunity : detail.replyContextExample, thread.author);
      this.setData({
        number: data.content.copy.number,
        numberHtml: richTextHtml(data.content.copyRichText?.number, data.content.copy.number),
        intro: data.content.copy.intro,
        introHtml: richTextHtml(data.content.copyRichText?.intro, data.content.copy.intro),
        detail,
        thread: {
          author: thread.author,
          body: thread.body,
          bodyRichText: thread.bodyRichText,
          bodyHtml: trustedBodyHtml(thread),
          replies: thread.replies.map((reply) => {
            const replyCommunity = reply.source === 'community' || Boolean(reply.contributionId);
            const replyLabel = replyCommunity ? detail.communityLabel : detail.exampleLabel;
            const action = appendAuthor(detail.replyAction, reply.author);
            return { ...reply, bodyHtml: trustedBodyHtml(reply), sourceLabel: replyLabel.text, sourceLabelHtml: replyLabel.html, replyActionLabel: action.text, replyActionHtml: action.html };
          }),
          source: thread.source,
          featured: thread.featured,
          contributionId: thread.contributionId,
          sourceLabel: sourceLabel.text,
          sourceLabelHtml: sourceLabel.html,
          replyActionLabel: replyAction.text,
          replyActionHtml: replyAction.html,
          replyContextText: replyContext.text,
          replyContextHtml: replyContext.html,
        },
        loading: false,
        error: '',
        restricted: false,
        restrictionReason: '',
        restrictionMessage: '',
        appealContact: '',
        supportContact: '',
      });
      this.syncLocal();
      void this.loadReports();
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      if (isDiscussionRestrictionError(caught)) {
        let access: DiscussionAccessStatus | null = null;
        try { access = await readDiscussionAccess({ requireLogin: true }); } catch { /* Keep the restriction page available while contact details refresh. */ }
        if (generation !== this.requestGeneration) return;
        this.setData({ number: '', numberHtml: '', intro: '', introHtml: '', thread: null, localReplies: [], reported: false, loading: false, error: '' });
        this.applyDiscussionRestriction(access || { restricted: true, reason: null, endsAt: null, appealContact: null, supportContact: null });
        return;
      }
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取这段对话'), thread: null, localReplies: [] });
    }
  },
  async loadReports() {
    if (this.data.restricted) return;
    try {
      const items = await request<CloudReport[]>(`/discussion/reports/mine?issueCode=${encodeURIComponent(this.data.issueCode)}`);
      if (!Array.isArray(items) || this.data.restricted) return;
      this.setData({ reported: items.some((item) => item && item.threadId === this.data.threadId) });
    } catch { /* 未登录或网络异常时不影响阅读，举报入口会在提交时再要求登录 */ }
  },
  showDiscussionRestriction() {
    wx.showModal({
      title: '一起谈谈权限已停用',
      content: this.data.restrictionMessage || '你暂时不能查看或参与本期讨论。账号登录、观察、实践和商城不受影响。',
      showCancel: false,
      confirmText: '知道了',
    });
  },
  handleBack() { wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: `/pages/discussion/index?issueCode=${encodeURIComponent(this.data.issueCode)}` }) }); },
  handleMore() {
    wx.showModal({ title: this.data.detail.moreTitle.text, content: this.data.detail.moreBody.text, showCancel: false });
  },
  replyTo(event: WechatMiniprogram.CustomEvent) {
    if (this.data.restricted) { this.showDiscussionRestriction(); return; }
    const author = decodeQueryValue(String(event.currentTarget.dataset.author || '')) || this.data.thread?.author || '';
    const contributionId = String(event.currentTarget.dataset.contributionId || '');
    this.openComposer(author, contributionId);
  },
  openComposer(author: string, contributionId = '') {
    if (this.data.restricted) { this.showDiscussionRestriction(); return; }
    const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(this.data.threadId)}&threadAuthor=${encodeURIComponent(author)}${contributionId ? `&parentContributionId=${encodeURIComponent(contributionId)}` : ''}`;
    wx.navigateTo({ url: `/pages/discussion-compose/index?${query}` });
  },
  continueTalk() {
    if (this.data.restricted) { this.showDiscussionRestriction(); return; }
    if (!this.data.thread) return;
    this.openComposer(this.data.thread.author, this.data.thread.contributionId || '');
  },
  viewOtherThreads() {
    wx.navigateBack({ delta: 1, fail: () => wx.redirectTo({ url: `/pages/discussion/index?issueCode=${encodeURIComponent(this.data.issueCode)}` }) });
  },
  reportThread() {
    if (this.data.restricted) { this.showDiscussionRestriction(); return; }
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
    if (this.data.restricted) { this.showDiscussionRestriction(); return; }
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
      title: this.data.thread ? `${this.data.thread.author}｜${this.data.detail.navTitle.text}` : `${this.data.detail.navTitle.text}｜MYRIAD SHE`,
      path: '/pages/discussion-thread/index',
      query: { issueCode: this.data.issueCode, threadId: this.data.threadId },
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: this.data.thread ? `${this.data.thread.author}｜${this.data.detail.navTitle.text}` : `${this.data.detail.navTitle.text}｜MYRIAD SHE`,
      query: { issueCode: this.data.issueCode, threadId: this.data.threadId },
    });
  },
});
