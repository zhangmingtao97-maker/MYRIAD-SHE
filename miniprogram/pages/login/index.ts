import { apiErrorMessage, request } from '../../utils/request';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

const app = getApp<IAppOption>();

interface AccountProfile {
  nickname: string;
  avatarUrl: string | null;
  phoneNumber: string | null;
}

Page({
  onLoad() { enableShareMenu(); },
  data: { consentAgreed: false, loggingIn: false, error: '' },
  onConsentChange(event: WechatMiniprogram.CustomEvent<{ value?: string[] }>) {
    const value = event.detail.value;
    this.setData({ consentAgreed: Array.isArray(value) && value.includes('agreed'), error: '' });
  },
  openPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy-policy/index' });
  },
  openUserAgreement() {
    wx.navigateTo({ url: '/pages/privacy-policy/index?type=user-agreement' });
  },
  async onLoginWithPhone(event: WechatMiniprogram.CustomEvent<{ code?: string; errMsg?: string }>) {
    if (!this.data.consentAgreed || this.data.loggingIn || app.globalData.accountDeleted) return;
    const code = String(event.detail.code || '');
    if (!code) {
      this.setData({ error: '请授权手机号后继续登录' });
      return;
    }
    this.setData({ loggingIn: true, error: '' });
    try {
      await app.ensureLogin();
      await request<AccountProfile>('/me/phone-number', { method: 'POST', data: { code } });
      this.setData({ loggingIn: false });
      this.returnToMine();
    } catch (caught) {
      this.setData({ loggingIn: false, error: apiErrorMessage(caught, '暂时无法完成登录，请稍后重试') });
    }
  },
  returnToMine() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/mine/index' }) });
  },
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
