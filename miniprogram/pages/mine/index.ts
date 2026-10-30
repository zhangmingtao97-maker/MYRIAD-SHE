import { apiErrorMessage, request } from '../../utils/request';
import { isObservationListResponse, ObservationListItem } from '../../utils/observation';
import { isMinePageContent } from '../../utils/content';
import type { MinePageContent } from '../../utils/content';
import { readLocalDiscussion, removeLocalContribution } from '../../utils/discussion-storage';
import type { LocalContribution } from '../../utils/discussion-storage';

const app = getApp<IAppOption>();

interface AccountProfile {
  nickname: string;
  avatarUrl: string | null;
  phoneNumber: string | null;
}
interface CloudContribution { id: string; issueCode: string; issueLabel: string; threadId: string; threadAuthor: string | null; body: string; status: 'pending' | 'handled' | 'dismissed'; createdAt: string; updatedAt: string }

const emptyAccountProfile: AccountProfile = { nickname: '', avatarUrl: '', phoneNumber: '' };

function isAccountProfile(value: unknown): value is AccountProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.nickname === 'string'
    && (typeof profile.avatarUrl === 'string' || profile.avatarUrl === null)
    && (typeof profile.phoneNumber === 'string' || profile.phoneNumber === null);
}

function showProfileUploadError(data: string) {
  try {
    const body = JSON.parse(data) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.length <= 180) return body.message;
    if (Array.isArray(body.message)) return body.message.filter((item): item is string => typeof item === 'string').join('；').slice(0, 180);
  } catch {
    // The upload endpoint normally returns a JSON error envelope.
  }
  return '头像暂时无法保存，请稍后重试';
}

function richTextAccessibilityLabel(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function singleLineRichText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '')
    .replace(/<\/?(?:p|div)\b[^>]*>/gi, '');
}

function observationDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '观察记录' : `${date.getMonth() + 1}月${date.getDate()}日`;
}

Page({
  data: { statusBarHeight: 0, isLoggedIn: false, loggingIn: false, accountProfileReady: false, profileSaving: false, editingNickname: false, profileError: '', accountProfile: { ...emptyAccountProfile } as AccountProfile, observationCount: 0, discussionExpanded: false, localContributionCount: 0, localContributions: [] as LocalContribution[], cloudContributionCount: 0, cloudContributions: [] as CloudContribution[], cloudContributionsLoading: false, cloudContributionsError: '', minePage: { title: '把正在经历的，留在自己这里。', intro: '观察记录保存在你的云端账户上。讨论中的发言由你另行选择，个人观察不会自动公开。', observationHeading: '我的观察', emptyTitle: '还没有观察记录。', emptyIntro: '从一件真实发生的事开始，或借四时气韵换一个角度。', startButton: '开始第一次观察', discussionHeading: '我参与的讨论', discussionCount: '0 条已保存经历', discussionEmptyAction: '还没有留下发言', discussionIntro: '本期讨论独立于个人观察。示例装载的发言不会计入你的参与。', practiceHeading: '线下实践', practiceCount: '0 次', practiceEmptyTitle: '尚未参加共同实践', practiceIntro: '活动开放并真实参与后，会记录在这里。', privacyHeading: '选择与隐私', privacyAction: '通知与隐私' } as MinePageContent, minePageAccessibility: { startButton: '开始第一次观察', privacyAction: '通知与隐私' }, observations: [] as ObservationListItem[], loading: false, loadingMore: false, hasMore: false, offset: 0, pageSize: 30, error: '', moreError: '', accountDeleted: false, creatingNewAccount: false, newAccountError: '' },
  requestGeneration: 0,
  minePageRequestGeneration: 0,
  discussionRequestGeneration: 0,
  knownAuthGeneration: 0,
  observationsLoadInFlight: false,
  newAccountConfirmationOpen: false,
  accountProfileUserId: '',
  accountProfileRequestGeneration: 0,
  accountProfileSavedNickname: '',
  nicknameDraft: '',
  nicknameDirty: false,
  onLoad() { this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); },
  onShow() {
    this.syncLocalDiscussions();
    void this.loadMinePageContent();
    if (app.globalData.accountDeleted) {
      this.accountProfileUserId = '';
      this.accountProfileSavedNickname = '';
      this.nicknameDraft = '';
      this.nicknameDirty = false;
      this.accountProfileRequestGeneration += 1;
      this.observationsLoadInFlight = false;
      this.requestGeneration += 1;
      this.discussionRequestGeneration += 1;
      this.setData({ accountDeleted: true, isLoggedIn: false, accountProfileReady: false, editingNickname: false, accountProfile: { ...emptyAccountProfile }, observationCount: 0, observations: [], cloudContributions: [], cloudContributionCount: 0, loading: false, loadingMore: false, hasMore: false, error: '', moreError: '' });
      return;
    }
    const authChanged = this.knownAuthGeneration !== app.globalData.authGeneration;
    this.knownAuthGeneration = app.globalData.authGeneration;
    if (!this.hasSession()) {
      this.accountProfileUserId = '';
      this.accountProfileSavedNickname = '';
      this.nicknameDraft = '';
      this.nicknameDirty = false;
      this.accountProfileRequestGeneration += 1;
      this.observationsLoadInFlight = false;
      this.requestGeneration += 1;
      this.discussionRequestGeneration += 1;
      this.setData({ isLoggedIn: false, accountDeleted: false, accountProfileReady: false, editingNickname: false, profileError: '', accountProfile: { ...emptyAccountProfile }, observations: [], observationCount: 0, cloudContributions: [], cloudContributionCount: 0, cloudContributionsLoading: false, loading: false, loadingMore: false, offset: 0, hasMore: false, error: '', moreError: '' });
      return;
    }
    const userId = app.globalData.userId;
    if (this.accountProfileUserId !== userId || authChanged) {
      this.accountProfileSavedNickname = '';
      this.nicknameDraft = '';
      this.nicknameDirty = false;
      this.setData({ accountProfile: { ...emptyAccountProfile }, accountProfileReady: false, editingNickname: false });
    }
    this.accountProfileUserId = userId;
    this.setData({ isLoggedIn: true, accountDeleted: false, profileError: '' });
    void this.loadAccountProfile();
    void this.loadCloudContributions();
    this.loadObservations(authChanged);
  },
  onHide() {
    // The list is ordinary page-read work. Invalidate it while hidden so a
    // response from the previous view cannot repaint stale account data.
    this.requestGeneration += 1;
    this.minePageRequestGeneration += 1;
    this.discussionRequestGeneration += 1;
    this.accountProfileRequestGeneration += 1;
    this.observationsLoadInFlight = false;
  },
  hasSession() {
    return Boolean(app.globalData.accessToken && app.globalData.userId);
  },
  openLogin() {
    if (app.globalData.accountDeleted) return;
    wx.navigateTo({ url: '/pages/login/index' });
  },
  openProfile() {
    if (!this.hasSession() || app.globalData.accountDeleted) {
      this.openLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/profile/index' });
  },
  async loadAccountProfile() {
    const userId = this.accountProfileUserId;
    if (!userId || !app.globalData.accessToken) return;
    const generation = ++this.accountProfileRequestGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.setData({ accountProfileReady: false, profileError: '' });
    try {
      const profile = await request<AccountProfile>('/me/profile');
      if (generation !== this.accountProfileRequestGeneration || authGeneration !== app.globalData.authGeneration || userId !== this.accountProfileUserId) return;
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.accountProfileSavedNickname = profile.nickname.slice(0, 32);
      if (!this.nicknameDirty) this.nicknameDraft = this.accountProfileSavedNickname;
      const nickname = this.nicknameDirty ? this.nicknameDraft : this.accountProfileSavedNickname;
      this.setData({ accountProfile: { nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null }, accountProfileReady: true });
    } catch (caught) {
      if (generation !== this.accountProfileRequestGeneration || authGeneration !== app.globalData.authGeneration) return;
      this.setData({ accountProfileReady: false, profileError: apiErrorMessage(caught, '暂时无法读取账号资料') });
    }
  },
  onRetryProfile() {
    void this.loadAccountProfile();
  },
  editNickname() {
    if (!this.accountProfileUserId || !this.data.accountProfileReady || this.data.profileSaving || app.globalData.accountDeleted) return;
    this.nicknameDraft = this.accountProfileSavedNickname;
    this.nicknameDirty = false;
    this.setData({ editingNickname: true, 'accountProfile.nickname': this.accountProfileSavedNickname });
  },
  onNicknameInput(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    if (!this.accountProfileUserId || app.globalData.accountDeleted) return;
    this.nicknameDirty = true;
    this.nicknameDraft = String(event.detail.value || '').slice(0, 32);
    this.setData({ 'accountProfile.nickname': this.nicknameDraft });
  },
  async onNicknameChange(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const userId = this.accountProfileUserId;
    const value = typeof event.detail?.value === 'string' ? event.detail.value : this.nicknameDirty ? this.nicknameDraft : this.data.accountProfile.nickname;
    const nickname = String(value || '').trim().slice(0, 32);
    if (!userId || app.globalData.accountDeleted) {
      this.setData({ editingNickname: false });
      return;
    }
    if (this.data.profileSaving) return;
    if (nickname === this.accountProfileSavedNickname) {
      this.nicknameDirty = false;
      this.nicknameDraft = this.accountProfileSavedNickname;
      this.setData({ accountProfile: { ...this.data.accountProfile, nickname: this.accountProfileSavedNickname }, editingNickname: false });
      return;
    }
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      this.nicknameDirty = false;
      this.nicknameDraft = this.accountProfileSavedNickname;
      this.setData({ 'accountProfile.nickname': this.accountProfileSavedNickname, editingNickname: false });
      return;
    }
    this.setData({ profileSaving: true, editingNickname: false });
    try {
      const profile = await request<AccountProfile>('/me/profile', { method: 'PATCH', data: { nickname } });
      if (userId !== this.accountProfileUserId || !isAccountProfile(profile)) return;
      this.accountProfileSavedNickname = profile.nickname;
      this.nicknameDraft = profile.nickname;
      this.nicknameDirty = false;
      this.setData({ accountProfile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null }, accountProfileReady: true });
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (caught) {
      this.nicknameDirty = false;
      this.nicknameDraft = this.accountProfileSavedNickname;
      this.setData({ 'accountProfile.nickname': this.accountProfileSavedNickname });
      wx.showToast({ title: apiErrorMessage(caught, '昵称暂时无法保存'), icon: 'none' });
      void this.loadAccountProfile();
    } finally {
      if (userId === this.accountProfileUserId) this.setData({ profileSaving: false });
    }
  },
  onChooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    const userId = this.accountProfileUserId;
    const tempFilePath = String(event.detail.avatarUrl || '');
    if (!userId || !tempFilePath || !this.data.accountProfileReady || app.globalData.accountDeleted) return;
    void this.uploadAvatar(userId, tempFilePath);
  },
  async uploadAvatar(userId: string, filePath: string) {
    this.setData({ profileSaving: true });
    try {
      await app.ensureLogin();
      const result = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
        wx.uploadFile({
          url: `${app.globalData.apiBaseUrl}/me/profile/avatar`,
          filePath,
          name: 'avatar',
          timeout: app.globalData.requestTimeoutMs,
          header: { Authorization: `Bearer ${app.globalData.accessToken}` },
          success: resolve,
          fail: reject,
        });
      });
      if (userId !== this.accountProfileUserId) return;
      if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(showProfileUploadError(result.data));
      const profile: unknown = JSON.parse(result.data);
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.accountProfileSavedNickname = profile.nickname;
      if (!this.nicknameDirty) this.nicknameDraft = profile.nickname;
      const nickname = this.nicknameDirty ? this.nicknameDraft : profile.nickname;
      this.setData({ accountProfile: { nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null } });
    } catch (caught) {
      if (userId === this.accountProfileUserId) wx.showToast({ title: apiErrorMessage(caught, '头像暂时无法保存'), icon: 'none' });
    } finally {
      if (userId === this.accountProfileUserId) this.setData({ profileSaving: false });
    }
  },
  async loadMinePageContent() {
    const generation = ++this.minePageRequestGeneration;
    try {
      const content = await request<MinePageContent>('/content/mine', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.minePageRequestGeneration || !isMinePageContent(content)) return;
      this.setData({ minePage: { ...content, observationHeading: singleLineRichText(content.observationHeading), discussionCount: `${this.data.cloudContributionCount} 条已保存经历` }, minePageAccessibility: { startButton: richTextAccessibilityLabel(content.startButton), privacyAction: richTextAccessibilityLabel(content.privacyAction) } });
    } catch {
      if (generation !== this.minePageRequestGeneration) return;
      // Keep the readable built-in copy when public content is temporarily unavailable.
    }
  },
  loadObservations(force = false) {
    if (app.globalData.accountDeleted) return;
    if (this.observationsLoadInFlight && !force) return;
    this.observationsLoadInFlight = true;
    const generation = ++this.requestGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.knownAuthGeneration = authGeneration;
    this.setData({ loading: true, loadingMore: false, error: '', moreError: '', offset: 0, observations: [] });
    request<{ items: ObservationListItem[]; total: number; limit: number; offset: number }>(`/observations?limit=${this.data.pageSize}&offset=0`)
      .then((result) => {
        if (generation !== this.requestGeneration || authGeneration !== app.globalData.authGeneration) return;
        if (!isObservationListResponse(result)) throw new Error('观察列表格式无效');
        this.setData({ observations: result.items.map((item) => ({ ...item, updatedAtLabel: observationDateLabel(item.updatedAt) })), observationCount: result.total, offset: result.items.length, hasMore: result.items.length < result.total, loading: false });
      })
      .catch((caught) => {
        if (generation !== this.requestGeneration || authGeneration !== app.globalData.authGeneration) return;
        if (app.globalData.accountDeleted) {
          this.setData({ accountDeleted: true, observationCount: 0, observations: [], loading: false, loadingMore: false, hasMore: false, error: '', moreError: '' });
          return;
        }
        this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法连接云端，请检查网络后重试。') });
      })
      .finally(() => {
        // Do not let an older account request clear the newer request's flag.
        if (generation === this.requestGeneration) this.observationsLoadInFlight = false;
      });
  },
  loadMore() {
    if (app.globalData.accountDeleted || this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    const generation = this.requestGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.setData({ loadingMore: true, moreError: '' });
    request<{ items: ObservationListItem[]; total: number }>(`/observations?limit=${this.data.pageSize}&offset=${this.data.offset}`)
      .then((result) => {
        if (generation !== this.requestGeneration || authGeneration !== app.globalData.authGeneration) return;
        if (!isObservationListResponse(result)) throw new Error('观察列表格式无效');
        const knownIds = new Set(this.data.observations.map((item) => item.id));
        const newItems = result.items.filter((item) => !knownIds.has(item.id));
        const offset = this.data.offset + result.items.length;
        this.setData({ observations: [...this.data.observations, ...newItems.map((item) => ({ ...item, updatedAtLabel: observationDateLabel(item.updatedAt) }))], observationCount: result.total, offset, hasMore: offset < result.total, loadingMore: false });
      })
      .catch((caught) => {
        if (generation !== this.requestGeneration || authGeneration !== app.globalData.authGeneration) return;
        if (app.globalData.accountDeleted) {
          this.setData({ accountDeleted: true, observationCount: 0, observations: [], loading: false, loadingMore: false, hasMore: false, moreError: '' });
          return;
        }
        this.setData({ loadingMore: false, moreError: apiErrorMessage(caught, '加载失败，请重试。') });
      });
  },
  openRecord(event: WechatMiniprogram.CustomEvent) {
    const { id, status } = event.currentTarget.dataset;
    const url = status === 'draft' ? `/pages/observation/index?id=${id}` : `/pages/observation-detail/index?id=${id}`;
    wx.navigateTo({ url });
  },
  openAllObservations() {
    wx.navigateTo({ url: '/pages/observation-list/index' });
  },
  toggleDiscussionIntro() {
    this.setData({ discussionExpanded: !this.data.discussionExpanded });
  },
  syncLocalDiscussions() {
    const contributions = readLocalDiscussion().contributions.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    this.setData({ localContributionCount: contributions.length, localContributions: contributions });
  },
  async loadCloudContributions() {
    const generation = ++this.discussionRequestGeneration;
    this.setData({ cloudContributionsLoading: true, cloudContributionsError: '' });
    try {
      const result = await request<CloudContribution[]>('/discussion/contributions');
      if (!Array.isArray(result) || result.some((item) => !item || typeof item.id !== 'string' || typeof item.body !== 'string'
        || typeof item.issueCode !== 'string' || typeof item.issueLabel !== 'string'
        || !['pending', 'handled', 'dismissed'].includes(item.status))) throw new Error('已保存经历列表格式无效');
      if (generation !== this.discussionRequestGeneration) return;
      this.setData({ cloudContributions: result, cloudContributionCount: result.length, minePage: { ...this.data.minePage, discussionCount: `${result.length} 条已保存经历` } });
    } catch (caught) {
      if (generation !== this.discussionRequestGeneration) return;
      this.setData({ cloudContributionsError: apiErrorMessage(caught, '暂时无法读取已保存经历。') });
    } finally {
      if (generation === this.discussionRequestGeneration) this.setData({ cloudContributionsLoading: false });
    }
  },
  deleteCloudContribution(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    const item = this.data.cloudContributions.find((entry) => entry.id === id);
    if (!item) return;
    wx.showModal({ title: '删除已保存经历', content: '删除后，这段经历会从你的账户和运营审核列表中永久移除。', confirmText: '删除经历', confirmColor: '#663124', success: ({ confirm }) => {
      if (!confirm) return;
      const query = `issueCode=${encodeURIComponent(item.issueCode)}&threadId=${encodeURIComponent(item.threadId)}`;
      void request<{ deleted: boolean }>(`/discussion/contributions/mine?${query}`, { method: 'DELETE' }).then((result) => {
        if (!result.deleted) throw new Error('这段经历已不存在');
        this.loadCloudContributions();
        wx.showToast({ title: '已删除', icon: 'none' });
      }).catch((caught) => this.setData({ cloudContributionsError: apiErrorMessage(caught, '删除失败，请稍后重试。') }));
    } });
  },
  openLocalDiscussion(event: WechatMiniprogram.CustomEvent) {
    const issueCode = String(event.currentTarget.dataset.issueCode || '');
    wx.navigateTo({ url: issueCode ? `/pages/discussion/index?issueCode=${encodeURIComponent(issueCode)}` : '/pages/discussion/index' });
  },
  deleteLocalDiscussion(event: WechatMiniprogram.CustomEvent) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!this.data.localContributions.some((item) => item.id === id)) return;
    wx.showModal({ title: '删除本机发言', content: '只删除这台设备保存的这段经历，不会影响已发布的示例内容。', confirmText: '删除', success: ({ confirm }) => {
      if (!confirm) return;
      removeLocalContribution(id);
      this.syncLocalDiscussions();
    } });
  },
  openCurrentDiscussion() {
    wx.navigateTo({ url: '/pages/discussion/index' });
  },
  createNewAccount() {
    if (!app.globalData.accountDeleted || this.data.creatingNewAccount || this.newAccountConfirmationOpen) return;
    this.newAccountConfirmationOpen = true;
    wx.showModal({
      title: '创建新的云端账户',
      content: '原账户及其云端数据已删除且无法恢复。继续后将使用当前微信身份创建一个全新的空账户。',
      confirmText: '创建新账户',
      success: async ({ confirm }) => {
        this.newAccountConfirmationOpen = false;
        if (!confirm || !app.globalData.accountDeleted) return;
        this.setData({ creatingNewAccount: true, newAccountError: '' });
        try {
          await app.createNewAccount();
          this.knownAuthGeneration = app.globalData.authGeneration;
          this.accountProfileUserId = app.globalData.userId;
          this.setData({ accountDeleted: false, isLoggedIn: true, accountProfileReady: false, accountProfile: { ...emptyAccountProfile }, creatingNewAccount: false });
          void this.loadAccountProfile();
          void this.loadCloudContributions();
          // An old-account read may still be in flight but must not block the
          // first read for the newly created account.
          this.loadObservations(true);
        } catch (caught) {
          this.setData({ creatingNewAccount: false, newAccountError: apiErrorMessage(caught, '暂时无法创建新账户，请检查网络后重试。') });
        }
      },
      fail: () => { this.newAccountConfirmationOpen = false; },
    });
  },
  startObservation() { wx.navigateTo({ url: '/pages/observation/index' }); },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
});
