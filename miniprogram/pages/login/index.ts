import { apiErrorMessage } from '../../utils/request';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
import { openWechatPrivacyContract } from '../../utils/privacy-authorization';

const app = getApp<IAppOption>();

Page({
  data: { privacyReady: false, privacyContractName: '《小程序用户隐私保护指引》', loggingIn: false, loginError: '' },
  loginGeneration: 0,
  onLoad() {
    enableShareMenu();
    wx.getPrivacySetting({
      success: (result) => this.setData({ privacyReady: true, privacyContractName: result.privacyContractName || '《小程序用户隐私保护指引》' }),
      fail: () => this.setData({ privacyReady: true }),
    });
  },
  onUnload() { this.loginGeneration += 1; },
  // Privacy agreement alone must never create a session. The coupled native
  // button separately emits the phone authorization result from this gesture.
  onAgreePrivacyAuthorization() {},
  async onGetPhoneNumber(event: WechatMiniprogram.CustomEvent<{ code?: string; errMsg?: string }>) {
    if (this.data.loggingIn) return;
    const phoneCode = event.detail?.code;
    if (!phoneCode || /deny|cancel|fail/i.test(event.detail?.errMsg || '')) {
      this.setData({ loginError: '未完成手机号授权。你可以重试，或返回浏览公开内容。' });
      return;
    }
    if (app.globalData.accountDeleted) {
      this.setData({ loginError: '账户已删除，请先在“我的”页面确认是否创建新账户。' });
      return;
    }
    const generation = ++this.loginGeneration;
    this.setData({ loggingIn: true, loginError: '' });
    try {
      await app.loginWithWechat(phoneCode);
      if (generation !== this.loginGeneration || app.globalData.accountDeleted) return;
      if (!app.globalData.accessToken) throw new Error('手机号登录未完成，请重新授权登录。');
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/mine/index' }) });
    } catch (error) {
      if (generation === this.loginGeneration) this.setData({ loginError: apiErrorMessage(error, '登录失败，请重新授权手机号后重试。') });
    } finally {
      if (generation === this.loginGeneration) this.setData({ loggingIn: false });
    }
  },
  openPrivacyPolicy() { wx.navigateTo({ url: '/pages/privacy-policy/index' }); },
  openUserAgreement() { wx.navigateTo({ url: '/pages/privacy-policy/index?type=user-agreement' }); },
  openWechatPrivacyContract() { openWechatPrivacyContract(); },
  onShareAppMessage() {
    return shareCard({ title: 'MYRIAD SHE｜写给自己的私人档案馆', path: '/pages/home/index', query: {} });
  },
  onShareTimeline() {
    return shareTimelineCard({ title: 'MYRIAD SHE｜写给自己的私人档案馆', query: {} });
  },
});
