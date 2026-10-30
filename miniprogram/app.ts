import { apiErrorFromResponse } from './utils/api-error';
import { API_BASE_URL } from './utils/env';

const maxAccessTokenLength = 16_384;
const maxUserIdLength = 64;
const maxSessionSeconds = 30 * 24 * 60 * 60;

function boundedStorageText(key: string, maximum: number) {
  const value = wx.getStorageSync(key);
  return typeof value === 'string' && value.length > 0 && value.length <= maximum ? value : '';
}

function storageExpiry(key: string) {
  const stored = wx.getStorageSync(key);
  if (typeof stored !== 'number') return 0;
  const value = stored;
  const now = Date.now();
  return Number.isSafeInteger(value) && value > now && value <= now + maxSessionSeconds * 1000 ? value : 0;
}

App<IAppOption>({
  globalData: { apiBaseUrl: API_BASE_URL, requestTimeoutMs: 8000, accessToken: '', accessTokenExpiresAt: 0, userId: '', accountDeleted: false, authGeneration: 0, loginPromise: null },
  onLaunch() {
    this.globalData.accessToken = boundedStorageText('myriad_she_access_token', maxAccessTokenLength);
    this.globalData.accessTokenExpiresAt = storageExpiry('myriad_she_access_token_expires_at');
    this.globalData.userId = boundedStorageText('myriad_she_user_id', maxUserIdLength);
    this.globalData.accountDeleted = wx.getStorageSync('myriad_she_account_deleted') === true;
    if (this.globalData.accountDeleted) {
      this.globalData.accessToken = '';
      this.globalData.accessTokenExpiresAt = 0;
      this.globalData.userId = '';
      wx.removeStorageSync('myriad_she_access_token');
      wx.removeStorageSync('myriad_she_access_token_expires_at');
      wx.removeStorageSync('myriad_she_user_id');
    }
  },
  ensureLogin(force = false) {
    if (this.globalData.accountDeleted) return Promise.reject(new Error('当前微信身份对应的账户已删除，请先确认是否创建新账户。'));
    const freshEnough = this.globalData.accessTokenExpiresAt > Date.now() + 60_000;
    if (!force && this.globalData.accessToken && this.globalData.userId && freshEnough) return Promise.resolve();
    if (this.globalData.loginPromise) return this.globalData.loginPromise;

    const authGeneration = this.globalData.authGeneration;

    this.globalData.accessToken = '';
    this.globalData.accessTokenExpiresAt = 0;
    this.globalData.userId = '';
    wx.removeStorageSync('myriad_she_access_token');
    wx.removeStorageSync('myriad_she_access_token_expires_at');
    wx.removeStorageSync('myriad_she_user_id');

    const loginPromise = new Promise<void>((resolve, reject) => {
      wx.login({
        success: ({ code }) => {
          if (!code) { reject(new Error('微信登录凭证为空')); return; }
          wx.request({
            url: `${this.globalData.apiBaseUrl}/auth/wechat/login`,
            method: 'POST',
            timeout: this.globalData.requestTimeoutMs,
            enableHttp2: false,
            header: { 'content-type': 'application/json' },
            data: { code },
            success: ({ statusCode, data, header }) => {
              if (statusCode < 200 || statusCode >= 300) {
                reject(apiErrorFromResponse(statusCode, data, header, '微信登录失败'));
                return;
              }
              const result = data as { accessToken?: unknown; userId?: unknown; expiresIn?: unknown };
              if (typeof result?.accessToken !== 'string' || !result.accessToken || result.accessToken.length > maxAccessTokenLength
                || typeof result.userId !== 'string' || !result.userId || result.userId.length > maxUserIdLength
                || typeof result.expiresIn !== 'number' || !Number.isSafeInteger(result.expiresIn) || result.expiresIn <= 0 || result.expiresIn > maxSessionSeconds) {
                reject(apiErrorFromResponse(statusCode, data, header, '微信登录服务返回无效数据'));
                return;
              }
              if (authGeneration !== this.globalData.authGeneration || this.globalData.accountDeleted) {
                reject(new Error('账户状态已变化，请重新操作'));
                return;
              }
              const expiresAt = Date.now() + Math.max(60, result.expiresIn) * 1000;
              this.globalData.accessToken = result.accessToken;
              this.globalData.accessTokenExpiresAt = expiresAt;
              this.globalData.userId = result.userId;
              wx.setStorageSync('myriad_she_access_token', result.accessToken);
              wx.setStorageSync('myriad_she_access_token_expires_at', expiresAt);
              wx.setStorageSync('myriad_she_user_id', result.userId);
              resolve();
            },
            fail: reject,
          });
        },
        fail: reject,
      });
    }).finally(() => {
      if (this.globalData.authGeneration === authGeneration) this.globalData.loginPromise = null;
    });

    this.globalData.loginPromise = loginPromise;
    return loginPromise;
  },
  markAccountDeleted() {
    this.globalData.authGeneration += 1;
    this.globalData.accountDeleted = true;
    this.globalData.loginPromise = null;
    this.globalData.accessToken = '';
    this.globalData.accessTokenExpiresAt = 0;
    this.globalData.userId = '';
    wx.setStorageSync('myriad_she_account_deleted', true);
    wx.removeStorageSync('myriad_she_access_token');
    wx.removeStorageSync('myriad_she_access_token_expires_at');
    wx.removeStorageSync('myriad_she_user_id');
  },
  async createNewAccount() {
    if (!this.globalData.accountDeleted) throw new Error('当前账户状态不需要重新创建');
    this.globalData.authGeneration += 1;
    this.globalData.accountDeleted = false;
    this.globalData.loginPromise = null;
    wx.removeStorageSync('myriad_she_account_deleted');
    try {
      await this.ensureLogin(true);
    } catch (error) {
      this.markAccountDeleted();
      throw error;
    }
  },
});

export {};
