import { apiErrorMessage, request } from '../../utils/request';
import { isPublicDiscussion } from '../../utils/discussion-content';
import type { DiscussionCopy, PublicDiscussion } from '../../utils/discussion-content';
import { readLocalDraftEntry, removeLocalDraft, saveLocalDraft } from '../../utils/discussion-storage';
import { richTextHtml } from '../../utils/rich-text';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

type ComposeCopy = Pick<DiscussionCopy, 'number' | 'intro' | 'composeTitle' | 'composeHeading' | 'composeFieldLabel' | 'composePlaceholder' | 'composePreviewAction' | 'composeSaveAction' | 'composeDiscardAction'>;
const composeCopyKeys = ['number', 'intro', 'composeTitle', 'composeHeading', 'composeFieldLabel', 'composePlaceholder', 'composePreviewAction', 'composeSaveAction', 'composeDiscardAction'] as const;

function composeCopyHtml(copy: ComposeCopy, richText?: Partial<Record<keyof DiscussionCopy, string>>) {
  const result: Partial<Record<keyof ComposeCopy, string>> = {};
  for (const key of composeCopyKeys) result[key] = richTextHtml(richText?.[key], copy[key]);
  return result;
}
interface CloudContribution { id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null; parentContributionId?: string | null; body: string; status: 'pending' | 'handled' | 'dismissed'; createdAt: string; updatedAt: string }
interface SubscriptionConfig { enabled: boolean; templateId?: string }

const fallbackCopy: ComposeCopy = {
  number: '02', intro: '你从哪件小事上发现，事情已经缓和了，自己却还在用原来的方式应对？',
  composeTitle: '写下你的经历',
  composeHeading: '从一件具体的事，\n开始说起。', composeFieldLabel: '你的经历',
  composePlaceholder: '最近发生了什么？你当时做了什么，又有什么感受？也可以写下与本期人物完全不同的经验。',
  composePreviewAction: '预览这段内容', composeSaveAction: '保存到后台并返回', composeDiscardAction: '放弃草稿',
};

function decodeQueryValue(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function subscriptionRequestId() {
  return `reply_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface DraftChoice { body: string; updatedAt: string; source: 'local' | 'cloud' }

Page({
  data: { statusBarHeight: 0, issueCode: '', threadId: '', threadAuthor: '', parentContributionId: '', title: '写下你的经历', titleHtml: '写下你的经历', fieldLabel: '你的经历', fieldLabelHtml: '你的经历', copy: fallbackCopy, copyHtml: composeCopyHtml(fallbackCopy), body: '', bodyHtml: '', previewOpen: false, previewConfirmed: false, restored: false, saving: false, error: '', draftNotice: false, draftSource: '' as '' | 'local' | 'cloud', notifyOnReplyAvailable: false, notifyOnReply: true, subscriptionTemplateId: '' },
  inputChanged: false,
  pendingDraft: null as DraftChoice | null,
  onLoad(query: Record<string, string | undefined>) {
    enableShareMenu();
    this.inputChanged = false;
    const threadId = query.threadId || '';
    const threadAuthor = decodeQueryValue(query.threadAuthor || '');
    const issueCode = query.issueCode || '';
    const target = decodeQueryValue(query.parentContributionId || '');
    const parentContributionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target) ? target : '';
    const localDraft = issueCode ? readLocalDraftEntry(issueCode, threadId, parentContributionId) : null;
    this.pendingDraft = localDraft ? { body: localDraft.body, updatedAt: localDraft.updatedAt, source: 'local' } : null;
    const title = threadId ? `回复${threadAuthor || '这段经历'}` : fallbackCopy.composeTitle;
    const fieldLabel = threadId ? '你的回应' : fallbackCopy.composeFieldLabel;
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, issueCode, threadId, threadAuthor, parentContributionId,
      title, titleHtml: richTextHtml('', title),
      fieldLabel, fieldLabelHtml: threadId ? richTextHtml('', fieldLabel) : composeCopyHtml(fallbackCopy).composeFieldLabel || richTextHtml('', fieldLabel),
      copyHtml: composeCopyHtml(fallbackCopy), body: '', bodyHtml: '', restored: false, draftNotice: Boolean(this.pendingDraft), draftSource: this.pendingDraft?.source || '' });
    if (query.resume === '1' && this.pendingDraft) this.continueDraft();
    void this.loadCopy();
    void this.loadSubscriptionConfig();
    if (issueCode) void this.restoreCloudDraft();
  },
  async loadCopy() {
    if (!this.data.issueCode) return;
    try {
      const path = `/content/discussion?issueCode=${encodeURIComponent(this.data.issueCode)}`;
      const result = await request<PublicDiscussion>(path);
      if (!isPublicDiscussion(result)) throw new Error('本期讨论内容格式无效');
      const copyHtml = composeCopyHtml(result.content.copy, result.content.copyRichText);
      const title = this.data.threadId ? `回复${this.data.threadAuthor || '这段经历'}` : result.content.copy.composeTitle;
      const fieldLabel = this.data.threadId ? '你的回应' : result.content.copy.composeFieldLabel;
      this.setData({ copy: result.content.copy, copyHtml, title, titleHtml: this.data.threadId ? richTextHtml('', title) : copyHtml.composeTitle || richTextHtml('', title),
        fieldLabel, fieldLabelHtml: this.data.threadId ? richTextHtml('', fieldLabel) : copyHtml.composeFieldLabel || richTextHtml('', fieldLabel) });
    } catch { /* Keep the matching built-in copy when the content endpoint is unavailable. */ }
  },
  async restoreCloudDraft() {
    if (this.pendingDraft) return;
    const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(this.data.threadId)}${this.data.parentContributionId ? `&parentContributionId=${encodeURIComponent(this.data.parentContributionId)}` : ''}`;
    try {
      const remote = await request<CloudContribution | null>(`/discussion/contributions/mine?${query}`);
      if (!remote || typeof remote.body !== 'string') return;
      if (this.inputChanged || this.pendingDraft) return;
      this.pendingDraft = { body: remote.body, updatedAt: remote.updatedAt, source: 'cloud' };
      this.setData({ draftNotice: true, draftSource: 'cloud', error: '' });
    } catch {
      if (!this.data.body) this.setData({ error: '暂时无法读取账户草稿，仍可继续编辑并稍后提交。' });
    }
  },
  async loadSubscriptionConfig() {
    if (!this.data.parentContributionId) return;
    try {
      const config = await request<SubscriptionConfig>('/discussion/subscription-config');
      if (!config?.enabled || typeof config.templateId !== 'string' || !/^[A-Za-z0-9_-]{10,128}$/.test(config.templateId)) return;
      this.setData({ notifyOnReplyAvailable: true, subscriptionTemplateId: config.templateId });
    } catch { /* 订阅消息不可用时仍可正常投稿。 */ }
  },
  toggleReplyNotification() {
    if (!this.data.notifyOnReplyAvailable) return;
    this.setData({ notifyOnReply: !this.data.notifyOnReply });
  },
  requestReplySubscription(): Promise<string> {
    if (!this.data.notifyOnReplyAvailable || !this.data.notifyOnReply || !this.data.subscriptionTemplateId) return Promise.resolve('');
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (requestId: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(requestId);
      };
      const requestId = subscriptionRequestId();
      timer = setTimeout(() => finish(''), 8_000);
      try {
        wx.requestSubscribeMessage({
          tmplIds: [this.data.subscriptionTemplateId],
          success: (result) => {
            const choices = result as unknown as Record<string, string>;
            finish(choices[this.data.subscriptionTemplateId] === 'accept' ? requestId : '');
          },
          fail: () => finish(''),
        });
      } catch {
        finish('');
      }
    });
  },
  continueDraft() {
    const draft = this.pendingDraft;
    if (!draft) return;
    this.pendingDraft = null;
    this.inputChanged = true;
    this.setData({ body: draft.body, bodyHtml: richTextHtml('', draft.body), draftNotice: false, draftSource: '', restored: true, previewConfirmed: false, error: '' });
    if (draft.source === 'cloud') saveLocalDraft({ issueCode: this.data.issueCode, threadId: this.data.threadId, parentContributionId: this.data.parentContributionId, body: draft.body, updatedAt: draft.updatedAt });
  },
  startFresh() {
    const draft = this.pendingDraft;
    this.pendingDraft = null;
    this.inputChanged = true;
    this.setData({ body: '', bodyHtml: '', draftNotice: false, draftSource: '', restored: false, previewConfirmed: false, error: '' });
    if (draft?.source === 'local') removeLocalDraft(this.data.issueCode, this.data.threadId, this.data.parentContributionId);
  },
  onInput(event: WechatMiniprogram.CustomEvent) {
    this.inputChanged = true;
    const body = String(event.detail.value || '').slice(0, 2000);
    const notice = this.data.draftNotice;
    this.pendingDraft = null;
    this.setData({ body, bodyHtml: richTextHtml('', body), previewConfirmed: false, error: '', restored: false, draftNotice: false, draftSource: '' });
    if (!this.data.issueCode) return;
    try {
      if (body.trim()) saveLocalDraft({ issueCode: this.data.issueCode, threadId: this.data.threadId, parentContributionId: this.data.parentContributionId, body, updatedAt: new Date().toISOString() });
      else if (!notice) removeLocalDraft(this.data.issueCode, this.data.threadId, this.data.parentContributionId);
    } catch (caught) {
      this.setData({ error: caught instanceof Error ? caught.message : '本机暂存失败，请先复制保留这段内容。' });
    }
  },
  handleBack() { wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) }); },
  handleMore() {
    wx.showModal({ title: '草稿说明', content: '输入时会暂存在这台设备。提交后会加密写入账户，并进入运营后台的「用户经历审核」，供编辑团队查看和处理，不会自动公开。', showCancel: false });
  },
  togglePreview() {
    const previewOpen = !this.data.previewOpen;
    if (previewOpen && !this.data.body.trim()) { this.setData({ error: '先写下一段经历，再预览。' }); return; }
    this.setData({ previewOpen, previewConfirmed: false, error: '' }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    });
  },
  closePreview() {
    this.setData({ previewOpen: false, previewConfirmed: false, error: '' }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    });
  },
  togglePreviewConfirm() {
    if (this.data.saving) return;
    this.setData({ previewConfirmed: !this.data.previewConfirmed, error: '' });
  },
  async saveDraft() {
    if (this.data.saving || !this.data.issueCode) return;
    if (!this.data.body.trim()) { this.setData({ error: '先写下一段经历，再提交到后台。' }); return; }
    if (this.data.previewOpen && !this.data.previewConfirmed) { this.setData({ error: '请先确认已检查这段内容。' }); return; }
    this.setData({ saving: true, error: '' });
    const requestId = await this.requestReplySubscription();
    try {
      const data: Record<string, unknown> = {
        issueCode: this.data.issueCode,
        threadId: this.data.threadId,
        parentContributionId: this.data.parentContributionId || undefined,
        body: this.data.body,
      };
      if (requestId) Object.assign(data, { notifyOnReply: true, subscriptionRequestId: requestId });
      await request<CloudContribution>('/discussion/contributions', { method: 'POST', data });
      removeLocalDraft(this.data.issueCode, this.data.threadId, this.data.parentContributionId);
      wx.showToast({ title: '已提交到后台审核', icon: 'none' });
      this.handleBack();
    } catch (caught) {
      this.setData({ saving: false, error: apiErrorMessage(caught, '提交到后台失败，请检查网络后重试。') });
    }
  },
  discardDraft() {
    if (this.data.saving) return;
    const discard = async () => {
      this.setData({ saving: true, error: '' });
      try {
        const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(this.data.threadId)}${this.data.parentContributionId ? `&parentContributionId=${encodeURIComponent(this.data.parentContributionId)}` : ''}`;
        await request<{ deleted: boolean }>(`/discussion/contributions/mine?${query}`, { method: 'DELETE' });
        removeLocalDraft(this.data.issueCode, this.data.threadId, this.data.parentContributionId);
        this.handleBack();
      } catch (caught) {
        this.setData({ saving: false, error: apiErrorMessage(caught, '无法删除账户草稿，请重试。') });
      }
    };
    if (!this.data.body.trim() && !this.data.restored) { discard(); return; }
    wx.showModal({ title: '放弃这份草稿？', content: '放弃后，当前设备和账户中保存的这段文字都会被删除。', confirmText: '放弃草稿', confirmColor: '#663124', success: ({ confirm }) => { if (confirm) void discard(); } });
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const paths = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];
    const path = paths[Number(event.currentTarget.dataset.index)];
    if (path) wx.switchTab({ url: path });
  },
  onShareAppMessage() {
    return shareCard({
      title: this.data.threadId ? `回复${this.data.threadAuthor || '这段经历'}` : '写下你的经历｜MYRIAD SHE',
      path: '/pages/discussion-compose/index',
      query: { issueCode: this.data.issueCode, threadId: this.data.threadId, threadAuthor: this.data.threadAuthor, parentContributionId: this.data.parentContributionId },
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: this.data.threadId ? `回复${this.data.threadAuthor || '这段经历'}` : '写下你的经历｜MYRIAD SHE',
      query: { issueCode: this.data.issueCode, threadId: this.data.threadId, threadAuthor: this.data.threadAuthor, parentContributionId: this.data.parentContributionId },
    });
  },
});
