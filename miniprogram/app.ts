import { ApiRequestError, apiErrorFromResponse } from './utils/api-error';
import { API_BASE_URL } from './utils/env';

const maxAccessTokenLength = 16_384;
const maxProfileTokenLength = 16_384;
const maxUserIdLength = 64;
const maxSessionSeconds = 30 * 24 * 60 * 60;
const maxProfileSessionSeconds = 1_800;

interface WechatLoginSession {
  needProfile: false;
  accessToken: string;
  userId: string;
  expiresIn: number;
}

interface WechatProfileChallenge {
  needProfile: true;
  profileToken: string;
  expiresIn: number;
}

type WechatLoginResult = WechatLoginSession | WechatProfileChallenge;

function saveWechatSession(app: IAppOption, result: WechatLoginSession) {
  const expiresAt = Date.now() + Math.max(60, result.expiresIn) * 1000;
  app.globalData.accessToken = result.accessToken;
  app.globalData.accessTokenExpiresAt = expiresAt;
  app.globalData.userId = result.userId;
  app.globalData.profileToken = '';
  app.globalData.profileTokenExpiresAt = 0;
  wx.setStorageSync('myriad_she_access_token', result.accessToken);
  wx.setStorageSync('myriad_she_access_token_expires_at', expiresAt);
  wx.setStorageSync('myriad_she_user_id', result.userId);
}

async function applyWechatLoginResult(app: IAppOption, result: WechatLoginResult) {
  if (!result.needProfile) {
    saveWechatSession(app, result);
    return;
  }
  app.globalData.profileToken = result.profileToken;
  app.globalData.profileTokenExpiresAt = Date.now() + Math.max(60, result.expiresIn) * 1000;
  // The challenge only permits avatar upload/profile completion. It is not a
  // logged-in session; keep it until the user submits their selected details.
}

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

function requestWechatLogin(code: string, authGeneration: number, app: IAppOption, phoneCode?: string): Promise<WechatLoginResult> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}/auth/wechat/login`,
      method: 'POST',
      timeout: app.globalData.loginTimeoutMs,
      enableHttp2: false,
      header: { 'content-type': 'application/json' },
      data: { code, ...(phoneCode ? { phoneCode } : {}) },
      success: ({ statusCode, data, header }) => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(apiErrorFromResponse(statusCode, data, header, '微信登录失败'));
          return;
        }
        const result = data as {
          needProfile?: unknown;
          accessToken?: unknown;
          userId?: unknown;
          profileToken?: unknown;
          expiresIn?: unknown;
        };
        if (typeof result?.expiresIn !== 'number' || !Number.isSafeInteger(result.expiresIn) || result.expiresIn <= 0) {
          reject(apiErrorFromResponse(statusCode, data, header, '微信登录服务返回无效数据'));
          return;
        }
        if (authGeneration !== app.globalData.authGeneration || app.globalData.accountDeleted) {
          reject(new Error('账户状态已变化，请重新操作'));
          return;
        }
        if (result.needProfile === true) {
          if (typeof result.profileToken !== 'string' || !result.profileToken
            || result.profileToken.length > maxProfileTokenLength || result.expiresIn > maxProfileSessionSeconds) {
            reject(apiErrorFromResponse(statusCode, data, header, '微信登录服务返回无效数据'));
            return;
          }
          resolve({ needProfile: true, profileToken: result.profileToken, expiresIn: result.expiresIn });
          return;
        }
        if (typeof result.accessToken !== 'string' || !result.accessToken || result.accessToken.length > maxAccessTokenLength
          || typeof result.userId !== 'string' || !result.userId || result.userId.length > maxUserIdLength
          || result.expiresIn > maxSessionSeconds) {
          reject(apiErrorFromResponse(statusCode, data, header, '微信登录服务返回无效数据'));
          return;
        }
        resolve({ needProfile: false, accessToken: result.accessToken, userId: result.userId, expiresIn: result.expiresIn });
      },
      fail: (error) => {
        const errMsg = error && typeof error === 'object' && typeof (error as { errMsg?: unknown }).errMsg === 'string'
          ? (error as { errMsg: string }).errMsg
          : '';
        const timedOut = /timeout/i.test(errMsg);
        reject(new ApiRequestError(timedOut ? '微信登录超时，请检查网络后重试。' : '微信登录失败，请检查网络后重试。', 0, timedOut ? 'login_timeout' : 'login_request_failed'));
      },
    });
  });
}

App<IAppOption>({
  globalData: { apiBaseUrl: API_BASE_URL, requestTimeoutMs: 8000, loginTimeoutMs: 15000, accessToken: '', accessTokenExpiresAt: 0, userId: '', profileToken: '', profileTokenExpiresAt: 0, accountDeleted: false, authGeneration: 0, loginPromise: null },
  onLaunch() {
    this.globalData.accessToken = boundedStorageText('myriad_she_access_token', maxAccessTokenLength);
    this.globalData.accessTokenExpiresAt = storageExpiry('myriad_she_access_token_expires_at');
    this.globalData.userId = boundedStorageText('myriad_she_user_id', maxUserIdLength);
    this.globalData.accountDeleted = wx.getStorageSync('myriad_she_account_deleted') === true;
    this.globalData.profileToken = '';
    this.globalData.profileTokenExpiresAt = 0;
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
    if (this.globalData.profileToken && this.globalData.profileTokenExpiresAt > Date.now()) {
      const pages = getCurrentPages();
      if (pages[pages.length - 1]?.route !== 'pages/login/index') wx.navigateTo({ url: '/pages/login/index' });
      return Promise.reject(new ApiRequestError('请先授权手机号登录，再继续操作', 401, 'profile_required'));
    }
    return this.loginWithWechat().then(() => {
      if (!this.globalData.accessToken) {
        wx.navigateTo({ url: '/pages/login/index' });
        throw new ApiRequestError('请先授权手机号登录，再继续操作', 401, 'profile_required');
      }
    });
  },
  loginWithWechat(phoneCode?: string): Promise<void> {
    if (this.globalData.accountDeleted) return Promise.reject(new Error('当前微信身份对应的账户已删除，请先确认是否创建新账户。'));
    if (this.globalData.loginPromise) {
      // Do not discard explicit phone consent during a background identity check.
      return phoneCode ? this.globalData.loginPromise.catch(() => undefined).then(() => this.loginWithWechat(phoneCode)) : this.globalData.loginPromise;
    }

    const authGeneration = this.globalData.authGeneration;
    this.globalData.accessToken = '';
    this.globalData.accessTokenExpiresAt = 0;
    this.globalData.userId = '';
    this.globalData.profileToken = '';
    this.globalData.profileTokenExpiresAt = 0;
    wx.removeStorageSync('myriad_she_access_token');
    wx.removeStorageSync('myriad_she_access_token_expires_at');
    wx.removeStorageSync('myriad_she_user_id');

    const loginPromise = new Promise<WechatLoginResult>((resolve, reject) => {
      wx.login({
        success: ({ code }) => {
          if (!code) { reject(new Error('微信登录凭证为空')); return; }
          requestWechatLogin(code, authGeneration, this, phoneCode).then(resolve, reject);
        },
        fail: reject,
      });
    }).then((result) => applyWechatLoginResult(this, result)).finally(() => {
      if (this.globalData.authGeneration === authGeneration) this.globalData.loginPromise = null;
    });

    this.globalData.loginPromise = loginPromise;
    return loginPromise;
  },
  uploadProfileAvatar(filePath: string) {
    if (!this.globalData.profileToken || this.globalData.profileTokenExpiresAt <= Date.now()) {
      return Promise.reject(new Error('登录资料已过期，请重新微信登录'));
    }
    const profileToken = this.globalData.profileToken;
    const authGeneration = this.globalData.authGeneration;
    return new Promise<string>((resolve, reject) => {
      wx.uploadFile({
        url: `${this.globalData.apiBaseUrl}/auth/wechat/profile/avatar`,
        filePath,
        name: 'avatar',
        timeout: this.globalData.requestTimeoutMs,
        header: { Authorization: `Bearer ${profileToken}` },
        success: ({ statusCode, data, header }) => {
          if (authGeneration !== this.globalData.authGeneration || profileToken !== this.globalData.profileToken || this.globalData.accountDeleted) {
            reject(new Error('账户状态已变化，请重新操作'));
            return;
          }
          let parsed: unknown = {};
          try { parsed = JSON.parse(data); } catch { /* A failed upload may not return JSON. */ }
          if (statusCode < 200 || statusCode >= 300) {
            reject(apiErrorFromResponse(statusCode, parsed, header, '头像上传失败，请重新选择'));
            return;
          }
          const avatarObjectKey = (parsed as { avatarObjectKey?: unknown })?.avatarObjectKey;
          if (typeof avatarObjectKey !== 'string' || !avatarObjectKey || avatarObjectKey.length > 1_024) {
            reject(new Error('头像服务返回无效数据'));
            return;
          }
          resolve(avatarObjectKey);
        },
        fail: () => reject(new ApiRequestError('头像上传失败，请检查网络后重试', 0, 'avatar_upload_failed')),
      });
    });
  },
  completeWechatProfile(input: { nickname?: string; phoneCode?: string }) {
    if (!this.globalData.profileToken || this.globalData.profileTokenExpiresAt <= Date.now()) {
      return Promise.reject(new Error('登录资料已过期，请重新微信登录'));
    }
    const authGeneration = this.globalData.authGeneration;
    const profileToken = this.globalData.profileToken;
    return new Promise<void>((resolve, reject) => {
      wx.request({
        url: `${this.globalData.apiBaseUrl}/auth/wechat/profile`,
        method: 'POST',
        timeout: this.globalData.loginTimeoutMs,
        enableHttp2: false,
        header: { 'content-type': 'application/json', Authorization: `Bearer ${profileToken}` },
        data: input,
        success: ({ statusCode, data, header }) => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(apiErrorFromResponse(statusCode, data, header, '资料暂时无法保存，请重试'));
            return;
          }
          const result = data as { accessToken?: unknown; userId?: unknown; expiresIn?: unknown };
          if (typeof result?.accessToken !== 'string' || !result.accessToken || result.accessToken.length > maxAccessTokenLength
            || typeof result.userId !== 'string' || !result.userId || result.userId.length > maxUserIdLength
            || typeof result.expiresIn !== 'number' || !Number.isSafeInteger(result.expiresIn)
            || result.expiresIn <= 0 || result.expiresIn > maxSessionSeconds) {
            reject(apiErrorFromResponse(statusCode, data, header, '微信登录服务返回无效数据'));
            return;
          }
          if (authGeneration !== this.globalData.authGeneration || profileToken !== this.globalData.profileToken || this.globalData.accountDeleted) {
            reject(new Error('账户状态已变化，请重新操作'));
            return;
          }
          const expiresAt = Date.now() + Math.max(60, result.expiresIn) * 1000;
          this.globalData.accessToken = result.accessToken;
          this.globalData.accessTokenExpiresAt = expiresAt;
          this.globalData.userId = result.userId;
          this.globalData.profileToken = '';
          this.globalData.profileTokenExpiresAt = 0;
          wx.setStorageSync('myriad_she_access_token', result.accessToken);
          wx.setStorageSync('myriad_she_access_token_expires_at', expiresAt);
          wx.setStorageSync('myriad_she_user_id', result.userId);
          resolve();
        },
        fail: (error) => {
          const errMsg = error && typeof error === 'object' && typeof (error as { errMsg?: unknown }).errMsg === 'string'
            ? (error as { errMsg: string }).errMsg
            : '';
          const timedOut = /timeout/i.test(errMsg);
          reject(new ApiRequestError(timedOut ? '保存资料超时，请检查网络后重试。' : '保存资料失败，请检查网络后重试。', 0, timedOut ? 'profile_timeout' : 'profile_request_failed'));
        },
      });
    });
  },
  markAccountDeleted() {
    this.globalData.authGeneration += 1;
    this.globalData.accountDeleted = true;
    this.globalData.loginPromise = null;
    this.globalData.accessToken = '';
    this.globalData.accessTokenExpiresAt = 0;
    this.globalData.userId = '';
    this.globalData.profileToken = '';
    this.globalData.profileTokenExpiresAt = 0;
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
    await this.loginWithWechat();
  },
});

export {};
