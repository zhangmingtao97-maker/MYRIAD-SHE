import { apiErrorMessage, request } from '../../utils/request';

const app = getApp<IAppOption>();

interface AccountProfile { nickname: string; avatarUrl: string | null; phoneNumber: string | null }

function isAccountProfile(value: unknown): value is AccountProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.nickname === 'string'
    && (typeof profile.avatarUrl === 'string' || profile.avatarUrl === null)
    && (typeof profile.phoneNumber === 'string' || profile.phoneNumber === null);
}

Page({
  data: { statusBarHeight: 0, loading: true, saving: false, editingNickname: false, loadError: '', profile: { nickname: '', avatarUrl: '', phoneNumber: '' } as AccountProfile },
  nicknameDraft: '',
  onLoad() { this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); },
  onShow() {
    if (app.globalData.accountDeleted || !app.globalData.accessToken) { wx.navigateBack({ delta: 1 }); return; }
    void this.loadProfile();
  },
  async loadProfile() {
    this.setData({ loading: true, loadError: '' });
    try {
      const profile = await request<AccountProfile>('/me/profile');
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.nicknameDraft = profile.nickname;
      this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null }, loading: false });
    } catch (caught) {
      this.setData({ loading: false, loadError: apiErrorMessage(caught, '暂时无法读取个人资料') });
    }
  },
  editNickname() {
    if (this.data.saving) return;
    this.nicknameDraft = this.data.profile.nickname;
    this.setData({ editingNickname: true });
  },
  onNicknameInput(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.nicknameDraft = String(event.detail?.value || '').slice(0, 32);
  },
  async saveNickname(event: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const nickname = String(event.detail?.value ?? this.nicknameDraft).trim().slice(0, 32);
    this.setData({ editingNickname: false });
    if (!nickname || nickname === this.data.profile.nickname) return;
    this.setData({ saving: true });
    try {
      const profile = await request<AccountProfile>('/me/profile', { method: 'PATCH', data: { nickname } });
      if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
      this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null }, saving: false });
    } catch (caught) {
      this.setData({ saving: false });
      wx.showToast({ title: apiErrorMessage(caught, '昵称暂时无法保存'), icon: 'none' });
      void this.loadProfile();
    }
  },
  onChooseAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
    const filePath = String(event.detail?.avatarUrl || '');
    if (!filePath || this.data.saving) return;
    this.setData({ saving: true });
    wx.uploadFile({ url: `${app.globalData.apiBaseUrl}/me/profile/avatar`, filePath, name: 'avatar', timeout: app.globalData.requestTimeoutMs, header: { Authorization: `Bearer ${app.globalData.accessToken}` }, success: (result) => {
      try {
        if (result.statusCode < 200 || result.statusCode >= 300) throw new Error('头像暂时无法保存');
        const profile: unknown = JSON.parse(result.data);
        if (!isAccountProfile(profile)) throw new Error('账号资料格式无效');
        this.setData({ profile: { nickname: profile.nickname, avatarUrl: profile.avatarUrl || null, phoneNumber: profile.phoneNumber || null }, saving: false });
      } catch (error) { this.setData({ saving: false }); wx.showToast({ title: apiErrorMessage(error, '头像暂时无法保存'), icon: 'none' }); }
    }, fail: (error) => { this.setData({ saving: false }); wx.showToast({ title: apiErrorMessage(error, '头像暂时无法保存'), icon: 'none' }); } });
  },
  showPhone() { wx.showToast({ title: this.data.profile.phoneNumber ? '手机号已绑定' : '请返回登录页绑定手机号', icon: 'none' }); },
  showUnavailable() { wx.showToast({ title: '该功能将逐步开放', icon: 'none' }); },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }); },
  openAgreement() { wx.navigateTo({ url: '/pages/privacy-policy/index?type=user-agreement' }); },
  openPrivacyPolicy() { wx.navigateTo({ url: '/pages/privacy-policy/index' }); },
  logout() {
    wx.showModal({ title: '退出登录', content: '退出后仍会保留云端记录，确定退出吗？', confirmText: '退出', success: ({ confirm }) => {
      if (!confirm) return;
      wx.removeStorageSync('myriad_she_access_token'); wx.removeStorageSync('myriad_she_access_token_expires_at'); wx.removeStorageSync('myriad_she_user_id');
      app.globalData.accessToken = ''; app.globalData.accessTokenExpiresAt = 0; app.globalData.userId = ''; app.globalData.authGeneration += 1;
      wx.switchTab({ url: '/pages/mine/index' });
    } });
  },
  handleBack() { wx.navigateBack({ delta: 1 }); },
});
