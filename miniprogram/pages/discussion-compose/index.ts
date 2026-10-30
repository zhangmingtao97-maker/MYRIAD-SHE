import { apiErrorMessage, request } from '../../utils/request';
import { isPublicDiscussion } from '../../utils/discussion-content';
import type { DiscussionCopy, PublicDiscussion } from '../../utils/discussion-content';
import { readLocalDraftEntry, removeLocalDraft, saveLocalDraft } from '../../utils/discussion-storage';

type ComposeCopy = Pick<DiscussionCopy, 'number' | 'intro' | 'composeTitle' | 'composeHeading' | 'composeFieldLabel' | 'composePlaceholder' | 'composePreviewAction' | 'composeSaveAction' | 'composeDiscardAction'>;
interface CloudContribution { id: string; revision: number; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null; body: string; status: 'pending' | 'handled' | 'dismissed'; createdAt: string; updatedAt: string }

const fallbackCopy: ComposeCopy = {
  number: '02', intro: '你从哪件小事上发现，事情已经缓和了，自己却还在用原来的方式应对？',
  composeTitle: '写下你的经历',
  composeHeading: '从一件具体的事，\n开始说起。', composeFieldLabel: '你的经历',
  composePlaceholder: '最近发生了什么？你当时做了什么，又有什么感受？也可以写下与本期人物完全不同的经验。',
  composePreviewAction: '预览这段内容', composeSaveAction: '保存到后台并返回', composeDiscardAction: '放弃草稿',
};

Page({
  data: { statusBarHeight: 0, issueCode: '', threadId: '', threadAuthor: '', title: '写下你的经历', fieldLabel: '你的经历', copy: fallbackCopy, body: '', previewOpen: false, restored: false, saving: false, error: '' },
  inputChanged: false,
  onLoad(query: Record<string, string | undefined>) {
    this.inputChanged = false;
    const threadId = query.threadId || '';
    const threadAuthor = query.threadAuthor || '';
    const issueCode = query.issueCode || '';
    const localDraft = issueCode ? readLocalDraftEntry(issueCode, threadId) : null;
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, issueCode, threadId, threadAuthor,
      title: threadId ? `回复${threadAuthor || '这段经历'}` : fallbackCopy.composeTitle,
      fieldLabel: threadId ? '你的回应' : fallbackCopy.composeFieldLabel,
      body: localDraft?.body || '', restored: Boolean(localDraft) });
    void this.loadCopy();
    if (issueCode) void this.restoreCloudDraft(localDraft?.updatedAt || '');
  },
  async loadCopy() {
    if (!this.data.issueCode) return;
    try {
      const path = `/content/discussion?issueCode=${encodeURIComponent(this.data.issueCode)}`;
      const result = await request<PublicDiscussion>(path);
      if (!isPublicDiscussion(result)) throw new Error('本期讨论内容格式无效');
      this.setData({ copy: result.content.copy, title: this.data.threadId ? `回复${this.data.threadAuthor || '这段经历'}` : result.content.copy.composeTitle,
        fieldLabel: this.data.threadId ? '你的回应' : result.content.copy.composeFieldLabel });
    } catch { /* Keep the matching built-in copy when the content endpoint is unavailable. */ }
  },
  async restoreCloudDraft(localUpdatedAt: string) {
    const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(this.data.threadId)}`;
    try {
      const remote = await request<CloudContribution | null>(`/discussion/contributions/mine?${query}`);
      if (!remote || typeof remote.body !== 'string') return;
      if (this.inputChanged) return;
      const localTime = Date.parse(localUpdatedAt);
      const remoteTime = Date.parse(remote.updatedAt);
      if (localUpdatedAt && Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) return;
      if (this.data.restored && !localUpdatedAt) return;
      this.setData({ body: remote.body, restored: true, error: '' });
      saveLocalDraft({ issueCode: this.data.issueCode, threadId: this.data.threadId, body: remote.body, updatedAt: remote.updatedAt });
    } catch {
      if (!localUpdatedAt && !this.data.body) this.setData({ error: '暂时无法读取账户草稿，仍可继续编辑并稍后保存。' });
    }
  },
  onInput(event: WechatMiniprogram.CustomEvent) {
    this.inputChanged = true;
    const body = String(event.detail.value || '').slice(0, 2000);
    this.setData({ body, error: '', restored: false });
    if (!this.data.issueCode) return;
    try {
      if (body.trim()) saveLocalDraft({ issueCode: this.data.issueCode, threadId: this.data.threadId, body, updatedAt: new Date().toISOString() });
      else removeLocalDraft(this.data.issueCode, this.data.threadId);
    } catch (caught) {
      this.setData({ error: caught instanceof Error ? caught.message : '本机暂存失败，请先复制保留这段内容。' });
    }
  },
  handleBack() { wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) }); },
  handleMore() {
    wx.showModal({ title: '草稿说明', content: '输入时会暂存在这台设备。选择保存后，经历会加密写入账户并进入运营后台供编辑团队查看和处理，不会自动公开。', showCancel: false });
  },
  togglePreview() { this.setData({ previewOpen: !this.data.previewOpen }); },
  async saveDraft() {
    if (this.data.saving || !this.data.issueCode) return;
    if (!this.data.body.trim()) { this.setData({ error: '先写下一段经历，再保存草稿。' }); return; }
    this.setData({ saving: true, error: '' });
    try {
      await request<CloudContribution>('/discussion/contributions', { method: 'POST', data: { issueCode: this.data.issueCode, threadId: this.data.threadId, body: this.data.body } });
      removeLocalDraft(this.data.issueCode, this.data.threadId);
      wx.showToast({ title: '已保存到后台', icon: 'none' });
      this.handleBack();
    } catch (caught) {
      this.setData({ saving: false, error: apiErrorMessage(caught, '保存到后台失败，请检查网络后重试。') });
    }
  },
  discardDraft() {
    if (this.data.saving) return;
    const discard = async () => {
      this.setData({ saving: true, error: '' });
      try {
        const query = `issueCode=${encodeURIComponent(this.data.issueCode)}&threadId=${encodeURIComponent(this.data.threadId)}`;
        await request<{ deleted: boolean }>(`/discussion/contributions/mine?${query}`, { method: 'DELETE' });
        removeLocalDraft(this.data.issueCode, this.data.threadId);
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
});
