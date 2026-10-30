import { ApiRequestError, apiErrorFromResponse } from './api-error';

const app = getApp<IAppOption>();
const maxAccessTokenLength = 16_384;

export { ApiRequestError } from './api-error';

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.message) return error.message;
  if (error && typeof error === 'object') {
    const errMsg = (error as { errMsg?: unknown }).errMsg;
    if (typeof errMsg === 'string' && errMsg.length > 0 && errMsg.length <= 240) return `${fallback}（${errMsg}）`;
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0 && message.length <= 240) return `${fallback}（${message}）`;
  }
  return fallback;
}

export function request<T>(path: string, options: WechatMiniprogram.RequestOption = {}) {
  const requiresLogin = path.startsWith('/observations') || path.startsWith('/me/') || path.startsWith('/discussion/contributions');
  return send<T>(path, options, requiresLogin, false);
}

async function send<T>(path: string, options: WechatMiniprogram.RequestOption, requiresLogin: boolean, retried: boolean, rejectedToken?: string, expectedGeneration?: number): Promise<T> {
  const requestGeneration = requiresLogin ? (expectedGeneration ?? app.globalData.authGeneration) : app.globalData.authGeneration;
  if (requiresLogin) {
    const tokenWasReplaced = rejectedToken && app.globalData.accessToken && app.globalData.accessToken !== rejectedToken;
    try {
      await app.ensureLogin(Boolean(rejectedToken) && !tokenWasReplaced);
    } catch (error) {
      if (app.globalData.accountDeleted) wx.switchTab({ url: '/pages/mine/index' });
      throw error;
    }
    if (requestGeneration !== app.globalData.authGeneration) {
      throw new ApiRequestError('登录状态已变化，请重试', 401, 'auth_generation_changed');
    }
  }
  const storedToken = wx.getStorageSync('myriad_she_access_token');
  const accessToken = typeof app.globalData.accessToken === 'string' && app.globalData.accessToken.length > 0 && app.globalData.accessToken.length <= maxAccessTokenLength
    ? app.globalData.accessToken
    : typeof storedToken === 'string' && storedToken.length > 0 && storedToken.length <= maxAccessTokenLength
      ? storedToken
      : '';
  const timeoutMs = options.timeout ?? app.globalData.requestTimeoutMs;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let task: WechatMiniprogram.RequestTask | undefined;
    const finish = (callback: (value: never) => void, value: unknown) => {
      if (settled) return false;
      settled = true;
      clearTimeout(watchdog);
      callback(value as never);
      return true;
    };
    const watchdog = setTimeout(() => {
      if (finish(reject, new ApiRequestError('请求超时，请检查手机网络和服务连接后重试。', 0, 'request_timeout'))) task?.abort();
    }, timeoutMs);

    try {
      task = wx.request({
        ...options,
        url: `${app.globalData.apiBaseUrl}${path}`,
        timeout: timeoutMs,
        // Keep production requests compatible with older WeChat base libs.
        enableHttp2: false,
        header: { ...options.header, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        success: (result) => {
          if (requiresLogin && requestGeneration !== app.globalData.authGeneration) {
            finish(reject, new ApiRequestError('登录状态已变化，请重试', 401, 'auth_generation_changed'));
            return;
          }
          if (result.statusCode >= 200 && result.statusCode < 300) finish(resolve, result.data as T);
          else {
            const body = result.data as { code?: unknown; message?: string | string[] };
            const message = Array.isArray(body?.message) ? body.message.join('；') : body?.message;
            const parsedError = apiErrorFromResponse(result.statusCode, result.data, result.header, `请求失败：${result.statusCode}`);
            if (result.statusCode === 401 && requiresLogin && (body?.code === 'account_deleted' || message === '用户账户已删除，请重新登录')) {
              const requestStillOwnsSession = requestGeneration === app.globalData.authGeneration
                && (!accessToken || app.globalData.accessToken === accessToken);
              if (requestStillOwnsSession) {
                app.markAccountDeleted();
                wx.switchTab({ url: '/pages/mine/index' });
              }
              finish(reject, parsedError);
              return;
            }
            if (result.statusCode === 401 && requiresLogin && !retried) {
              if (requestGeneration !== app.globalData.authGeneration) {
                finish(reject, parsedError);
                return;
              }
              settled = true;
              clearTimeout(watchdog);
              void send<T>(path, options, true, true, accessToken, requestGeneration).then(resolve, reject);
              return;
            }
            finish(reject, parsedError);
          }
        },
        fail: (error) => finish(reject, error),
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}
