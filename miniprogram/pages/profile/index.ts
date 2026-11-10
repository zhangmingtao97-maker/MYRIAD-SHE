import { apiErrorMessage, request } from '../../utils/request';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
import { ensurePrivacyAuthorized } from '../../utils/privacy-authorization';
import { clearCloudPreferenceCaches } from '../../utils/cloud-preference';

const app = getApp<IAppOption>();

interface ShippingAddress { userName: string; telNumber: string; provinceName: string; cityName: string; countyName: string; detailInfo: string; postalCode?: string; nationalCode?: string }
interface AccountProfile { nickname: string; avatarUrl: string | null; phoneNumber: string | null; address?: ShippingAddress | null }

function isShippingAddress(value: unknown): value is ShippingAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const address = value as Record<string, unknown>;
  return typeof address.userName === 'string'
    && typeof address.telNumber === 'string'
    && typeof address.provinceName === 'string'
    && typeof address.cityName === 'string'
    && typeof address.countyName === 'string'
    && typeof address.detailInfo === 'string'
    && (typeof address.postalCode === 'string' || address.postalCode === undefined)
    && (typeof address.nationalCode === 'string' || address.nationalCode === undefined);
}

function isAccountProfile(value: unknown): value is AccountProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.nickname === 'string'
    && (typeof profile.avatarUrl === 'string' || profile.avatarUrl === null)
    && (typeof profile.phoneNumber === 'string' || profile.phoneNumber === null)
    && (profile.address === undefined || profile.address === null || isShippingAddress(profile.address));
}

function readNativeInputValue(selector: string) {
  return new Promise<string | null>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(value);
    };
    timeout = setTimeout(() => finish(null), 240);
    wx.createSelectorQuery()
      .select(selector)
      .fields({ properties: ['value'] }, (result) => {
        if (!result) {
          finish(null);
          return;
        }
        const value = (result as { value?: unknown }).value;
        finish(typeof value === 'string' ? value : null);
      })
      .exec();
  });
}
Page({
  data: { statusBarHeight: 0, avatarPickerVisible: false, loading: true, saving: false, editingNickname: false, nicknameEditingValue: '', nicknameFocusRequested: false, loadError: '', profile: { nickname: '', avatarUrl: '', phoneNumber: '' } as AccountProfile },
  nicknameDraft: '',
  nicknameDirty: false,
  nicknameEditorOpening: false,
  nicknameCommitInFlight: false,
  avatarSelection: null as { userId: string; authGeneration: number } | null,
  profileRequestGeneration: 0,
  onLoad() { enableShareMenu(); this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); },
  onShow() {
    if (app.globalData.accountDeleted || !app.globalData.accessToken) { this.closeAvatarPicker(); wx.navigateBack({ delta: 1 }); return; }
    if (this.avatarSelection && (this.avatarSelection.userId !== app.globalData.userId || this.avatarSelection.authGeneration !== app.globalData.authGeneration)) this.closeAvatarPicker();
    void this.loadProfile();
  },
  async loadProfile() {
    if (this.data.saving) return;
    const generation = ++this.profileRequestGeneration;
    const userId = app.globalData.userId;
    const authGeneration = app.globalData.authGeneration;
    this.setData({ loading: true, loadError: '' });
    try {
      const profile = await request<AccountProfile>('/me/profile');
      if (generation !== this.profileRequestGeneration || userId !== app.globalData.userId || authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) return;
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.nicknameDraft = profile.nickname;
      this.nicknameDirty = false;
      this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null, address: profile.address || null }, loading: false });
    } catch (caught) {
      if (generation !== this.profileRequestGeneration || userId !== app.globalData.userId || authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) return;
      this.setData({ loading: false, loadError: apiErrorMessage(caught, '暂时无法读取个人资料') });
    }
  },
  async editNickname() {
    if (this.data.saving || this.nicknameEditorOpening || app.globalData.accountDeleted || !app.globalData.accessToken) return;
    this.nicknameEditorOpening = true;
    try {
      const authorized = await ensurePrivacyAuthorized();
      if (!authorized) {
        wx.showToast({ title: '需同意隐私授权', icon: 'none' });
        return;
      }
      if (this.data.saving || app.globalData.accountDeleted || !app.globalData.accessToken) return;
      this.nicknameDraft = this.data.profile.nickname;
      this.nicknameDirty = false;
      this.setData({ editingNickname: true, nicknameEditingValue: this.data.profile.nickname, nicknameFocusRequested: true });
    } finally {
      this.nicknameEditorOpening = false;
    }
  },
  onNicknameInput(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.syncNicknameDraft(event.detail?.value);
  },
  onNicknameChange(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.syncNicknameDraft(event.detail?.value);
  },
  onNicknameBlur(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.syncNicknameDraft(event.detail?.value);
  },
  onNicknameConfirm(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.syncNicknameDraft(event.detail?.value);
  },
  onNicknameReview(event: WechatMiniprogram.CustomEvent<{ pass?: boolean; timeout?: boolean }>) {
    if (event.detail?.timeout || event.detail?.pass === false) return;
    // 微信审核通过时才选择昵称。写入原生输入框有延迟，因此短暂轮询后自动保存。
    setTimeout(() => { void this.autoSaveSelectedNickname(); }, 120);
  },
  async autoSaveSelectedNickname() {
    if (!this.data.editingNickname || this.data.saving || this.nicknameCommitInFlight) return;
    const savedNickname = this.data.profile.nickname;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!this.data.editingNickname || this.data.saving || this.nicknameCommitInFlight) return;
      const nativeValue = await readNativeInputValue('#profileNicknameInput');
      const candidates = [nativeValue, this.nicknameDraft]
        .filter((value) => typeof value === 'string' && Boolean(value.trim())) as string[];
      const selected = candidates.map((value) => value.trim()).find((value) => value !== savedNickname);
      if (selected) {
        await this.commitNickname(selected);
        return;
      }
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 80));
    }
  },
  syncNicknameDraft(value: unknown) {
    if (typeof value !== 'string') return;
    this.nicknameDraft = value;
    this.nicknameDirty = value.trim() !== this.data.profile.nickname;
    // value 是原生输入框的“初始内容”。输入期间不要回写，否则微信昵称候选会被重置。
  },
  onNicknameSaveTap() {
    if (!this.data.editingNickname || this.data.saving || this.nicknameCommitInFlight) return;
    // 等 form submit 先处理；若部分真机未触发表单提交，再由按钮点击兜底保存。
    setTimeout(() => { void this.saveNicknameFromDraft(); }, 0);
  },
  async saveNicknameFromDraft() {
    if (!this.data.editingNickname || this.data.saving || this.nicknameCommitInFlight) return;
    let nickname = this.nicknameDraft;
    if (!nickname.trim()) {
      nickname = (await readNativeInputValue('#profileNicknameInput')) || '';
    }
    if (!this.data.editingNickname || this.data.saving || this.nicknameCommitInFlight) return;
    await this.commitNickname(nickname);
  },
  async onNicknameSubmit(event: WechatMiniprogram.CustomEvent<{ value?: Record<string, string> }>) {
    if (this.data.saving || this.nicknameCommitInFlight || !this.data.editingNickname) return;
    const submitted = event.detail?.value?.nickname;
    if (typeof submitted === 'string' && submitted.trim()) {
      await this.commitNickname(submitted);
      return;
    }
    await this.saveNicknameFromDraft();
  },
  async commitNickname(rawValue: unknown) {
    if (this.data.saving || this.nicknameCommitInFlight) return;
    const nickname = String(typeof rawValue === 'string' ? rawValue : '').trim().slice(0, 32);
    if (!nickname) {
      if (this.data.profile.nickname) {
        this.nicknameDirty = false;
        this.nicknameDraft = this.data.profile.nickname;
        this.setData({ editingNickname: false });
        return;
      }
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    this.nicknameDraft = nickname;
    this.nicknameDirty = true;
    if (nickname === this.data.profile.nickname) {
      this.nicknameDirty = false;
      this.setData({ editingNickname: false });
      return;
    }
    const previousNickname = this.data.profile.nickname;
    this.nicknameCommitInFlight = true;
    this.setData({ 'profile.nickname': nickname, editingNickname: false, saving: true });
    try {
      const profile = await request<AccountProfile>('/me/profile', { method: 'PATCH', data: { nickname } });
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.nicknameDraft = profile.nickname;
      this.nicknameDirty = false;
      this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null, address: profile.address || null }, saving: false });
    } catch (caught) {
      this.nicknameDirty = false;
      this.nicknameDraft = previousNickname;
      this.setData({ 'profile.nickname': previousNickname, saving: false });
      wx.showToast({ title: apiErrorMessage(caught, '昵称暂时无法保存'), icon: 'none' });
      void this.loadProfile();
    } finally {
      this.nicknameCommitInFlight = false;
    }
  },
  openAvatarPicker() {
    if (this.data.saving) {
      wx.showToast({ title: '资料正在保存，请稍候', icon: 'none' });
      return;
    }
    if (!app.globalData.accessToken || !app.globalData.userId || app.globalData.accountDeleted) {
      wx.showToast({ title: '请先登录后更换头像', icon: 'none' });
      return;
    }
    this.avatarSelection = { userId: app.globalData.userId, authGeneration: app.globalData.authGeneration };
    this.setData({ avatarPickerVisible: true });
  },
  closeAvatarPicker() {
    this.avatarSelection = null;
    this.setData({ avatarPickerVisible: false });
  },
  onChooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    const selection = this.avatarSelection;
    const filePath = String(event.detail?.avatarUrl || '');
    this.closeAvatarPicker();
    if (!selection || selection.userId !== app.globalData.userId || selection.authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) {
      wx.showToast({ title: '登录状态已变化，请重新选择头像', icon: 'none' });
      return;
    }
    if (!filePath || this.data.saving) {
      wx.showToast({ title: this.data.saving ? '资料正在保存，请稍候' : '没有选到头像，请重试', icon: 'none' });
      return;
    }
    void this.uploadAvatar(filePath);
  },
  async uploadAvatar(filePath: string) {
    if (this.data.saving) return;
    const userId = app.globalData.userId;
    const authGeneration = app.globalData.authGeneration;
    if (!userId || !app.globalData.accessToken || app.globalData.accountDeleted) return;
    const previousAvatarUrl = this.data.profile.avatarUrl;
    this.profileRequestGeneration += 1;
    this.setData({ saving: true, loading: false, 'profile.avatarUrl': filePath });
    try {
      await app.ensureLogin();
      if (userId !== app.globalData.userId || authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) return;
      const result = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
        wx.uploadFile({ url: `${app.globalData.apiBaseUrl}/me/profile/avatar`, filePath, name: 'avatar', timeout: app.globalData.requestTimeoutMs, header: { Authorization: `Bearer ${app.globalData.accessToken}` }, success: resolve, fail: reject });
      });
      if (userId !== app.globalData.userId || authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) return;
      if (result.statusCode < 200 || result.statusCode >= 300) throw new Error('头像暂时无法保存');
      const profile: unknown = JSON.parse(result.data);
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null, address: profile.address || null } });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (error) {
      if (userId !== app.globalData.userId || authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) return;
      this.setData({ 'profile.avatarUrl': previousAvatarUrl });
      wx.showToast({ title: apiErrorMessage(error, '头像暂时无法保存，请重新选择后重试'), icon: 'none' });
    } finally {
      if (userId === app.globalData.userId && authGeneration === app.globalData.authGeneration) this.setData({ saving: false });
    }
  },
  chooseAddress() {
    if (this.data.saving) return;
    wx.chooseAddress({
      success: (result) => { void this.saveAddress({ userName: result.userName, telNumber: result.telNumber, provinceName: result.provinceName, cityName: result.cityName, countyName: result.countyName, detailInfo: result.detailInfo, postalCode: result.postalCode || '', nationalCode: result.nationalCode || '' }); },
      fail: (error) => {
        if (String(error.errMsg || '').includes('cancel')) return;
        wx.showToast({ title: '暂时无法读取微信收货地址', icon: 'none' });
      },
    });
  },
  async saveAddress(address: ShippingAddress) {
    this.setData({ saving: true });
    try {
      const profile = await request<AccountProfile>('/me/profile/address', { method: 'PATCH', data: { address } });
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null, address: profile.address || null }, saving: false });
      wx.showToast({ title: '收货地址已保存', icon: 'success' });
    } catch (caught) {
      this.setData({ saving: false });
      wx.showToast({ title: apiErrorMessage(caught, '收货地址暂时无法保存'), icon: 'none' });
    }
  },
  showPhone() { wx.showToast({ title: this.data.profile.phoneNumber ? '手机号已绑定' : '请返回登录页绑定手机号', icon: 'none' }); },
  showUnavailable() { wx.showToast({ title: '该功能将逐步开放', icon: 'none' }); },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
  openAgreement() { wx.navigateTo({ url: '/pages/privacy-policy/index?type=user-agreement' }); },
  openPrivacyPolicy() { wx.navigateTo({ url: '/pages/privacy-policy/index' }); },
  logout() {
    wx.showModal({ title: '退出登录', content: '退出后仍会保留云端记录，确定退出吗？', confirmText: '退出', success: ({ confirm }) => {
      if (!confirm) return;
      clearCloudPreferenceCaches();
      wx.removeStorageSync('myriad_she_access_token'); wx.removeStorageSync('myriad_she_access_token_expires_at'); wx.removeStorageSync('myriad_she_user_id');
      app.globalData.accessToken = ''; app.globalData.accessTokenExpiresAt = 0; app.globalData.userId = ''; app.globalData.authGeneration += 1;
      wx.switchTab({ url: '/pages/mine/index' });
    } });
  },
  handleBack() { wx.navigateBack({ delta: 1 }); },
  onShareAppMessage() {
    return shareCard({
      title: 'MYRIAD SHE｜写给自己的私人档案馆',
      path: '/pages/home/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: 'MYRIAD SHE｜写给自己的私人档案馆',
      query: {},
    });
  },
});
