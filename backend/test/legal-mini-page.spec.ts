import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(relative: string) {
  const source = readFileSync(resolve(__dirname, '../../../miniprogram', relative), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  return result.outputText;
}
const validators: Record<string, (value: unknown) => boolean> = {};
runInNewContext(compile('utils/content.ts'), { exports: validators });
function content(text = '<h2>最新标题</h2><p><strong>重要条款</strong></p>') {
  const copy = (richText: string) => ({ richText, fontSize: 14, color: '#5c493c' });
  return { editVersion: 1, title: copy('用户协议'), intro: copy(''), body: copy(text), effectiveDate: '2026-11-01', updatedDate: '2026-10-23', version: '1.0', updateNotes: '' };
}

function miniAppHarness(loginResult: Record<string, unknown>) {
  let app: any;
  let loginCalls = 0;
  const navigations: string[] = [];
  const storage = new Map<string, unknown>();
  const requests: Array<{ url: string; data?: unknown; header?: Record<string, string> }> = [];
  class ApiRequestError extends Error {
    constructor(message: string, readonly statusCode = 0, readonly code = 'request_failed') {
      super(message);
    }
  }
  const wx = {
    navigateTo: ({ url }: { url: string }) => { navigations.push(url); },
    login: ({ success }: { success: (value: { code: string }) => void }) => {
      loginCalls += 1;
      success({ code: 'wechat-code' });
    },
    request: (options: { url: string; data?: unknown; header?: Record<string, string>; success: (value: object) => void }) => {
      requests.push({ url: options.url, data: options.data, header: options.header });
      const response = options.url.endsWith('/auth/wechat/login')
        ? loginResult
        : { accessToken: 'user-token', userId: 'user-id', expiresIn: 3600 };
      options.success({ statusCode: 200, data: response, header: { 'content-type': 'application/json' } });
    },
    uploadFile: () => undefined,
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  };
  runInNewContext(compile('app.ts'), {
    exports: {},
    App: (definition: any) => { app = definition; },
    getCurrentPages: () => [],
    wx,
    require: (path: string) => path.endsWith('/env') ? { API_BASE_URL: 'https://api.example.com' } : {
      ApiRequestError,
      apiErrorFromResponse: (_status: number, _data: unknown, _header: unknown, fallback: string) => new ApiRequestError(fallback),
    },
  });
  return { app, storage, requests, navigations, loginCalls: () => loginCalls };
}

test('new users keep a profile challenge without silently signing in with empty details', async () => {
  const harness = miniAppHarness({ needProfile: true, profileToken: 'profile-token', expiresIn: 600 });
  await harness.app.loginWithWechat();
  assert.equal(harness.loginCalls(), 1);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.app.globalData.profileToken, 'profile-token');
  assert.equal(harness.app.globalData.accessToken, '');
  assert.equal(harness.storage.has('myriad_she_access_token'), false);
  await harness.app.completeWechatProfile({ nickname: '真实昵称', phoneCode: 'one-time-phone-code' });
  assert.equal(harness.requests[1]?.header?.Authorization, 'Bearer profile-token');
  assert.equal(JSON.stringify(harness.requests[1]?.data), JSON.stringify({ nickname: '真实昵称', phoneCode: 'one-time-phone-code' }));
  assert.equal(harness.app.globalData.accessToken, 'user-token');
  assert.equal(harness.app.globalData.profileToken, '');
  assert.equal(harness.storage.get('myriad_she_access_token'), 'user-token');
});

test('concurrent login requests share one WeChat session', async () => {
  const harness = miniAppHarness({ needProfile: false, accessToken: 'user-token', userId: 'user-id', expiresIn: 3600 });
  await Promise.all([harness.app.ensureLogin(), harness.app.ensureLogin()]);
  assert.equal(harness.loginCalls(), 1);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.app.globalData.accessToken, 'user-token');
});

test('protected requests stop at pending onboarding without issuing another WeChat code', async () => {
  const h = miniAppHarness({ needProfile: true, profileToken: 'pending-profile', expiresIn: 600 });
  await h.app.loginWithWechat();
  await assert.rejects(h.app.ensureLogin(), /授权手机号登录/);
  assert.equal(h.loginCalls(), 1);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.navigations, ['/pages/login/index']);
});

test('creating a new account still requires explicit profile completion', async () => {
  const harness = miniAppHarness({ needProfile: true, profileToken: 'new-account-token', expiresIn: 600 });
  harness.app.globalData.accountDeleted = true;
  harness.storage.set('myriad_she_account_deleted', true);
  await harness.app.createNewAccount();
  assert.equal(harness.app.globalData.accountDeleted, false);
  assert.equal(harness.app.globalData.accessToken, '');
  assert.equal(harness.app.globalData.profileToken, 'new-account-token');
  assert.equal(harness.storage.get('myriad_she_account_deleted'), undefined);
  assert.equal(harness.storage.has('myriad_she_access_token'), false);
});
interface PageInstance {
  data: { documentKey: string; label: string; content: ReturnType<typeof content> | null; error: string; bodyNodes: string; loading: boolean };
  requestGeneration: number;
  setData(value: object): void;
  onLoad(options: object): void; onHide(): void; load(): Promise<void>;
}
function pageHarness(request: (path: string) => Promise<unknown>) {
  let page!: PageInstance; let title = '';
  runInNewContext(compile('pages/privacy-policy/index.ts'), {
    exports: {}, Page: (definition: PageInstance) => { page = definition; },
    wx: { getWindowInfo: () => ({ statusBarHeight: 24 }), setNavigationBarTitle: (value: { title: string }) => { title = value.title; } },
    require: (path: string) => path.endsWith('/content') ? validators
      : path.endsWith('/share') ? { enableShareMenu: () => undefined }
      : { request, apiErrorMessage: (_error: unknown, fallback: string) => fallback },
  });
  page.setData = function(value) { Object.assign(this.data, value); };
  return { page, getTitle: () => title };
}

function phoneLoginHarness() {
  let page: any;
  const codes: string[] = [];
  const navigations: string[] = [];
  let failure = false;
  let finish: (() => void) | null = null;
  const app = {
    globalData: { accountDeleted: false, accessToken: '' },
    loginWithWechat: async (code: string) => {
      codes.push(code);
      if (failure) throw new Error('offline');
      if (finish) await new Promise<void>(resolve => { finish = resolve; });
      app.globalData.accessToken = 'phone-user-token';
    },
  };
  runInNewContext(compile('pages/login/index.ts'), {
    exports: {}, Page: (definition: any) => { page = definition; }, getApp: () => app,
    wx: {
      getPrivacySetting: (options: any) => options.success({ needAuthorization: true, privacyContractName: '《真实平台指引》' }),
      navigateBack: () => navigations.push('back'), switchTab: () => navigations.push('mine'),
    },
    require: (path: string) => path.endsWith('/share') ? { enableShareMenu: () => undefined }
      : { apiErrorMessage: (_error: unknown, fallback: string) => fallback },
  });
  page.setData = (value: object) => Object.assign(page.data, value);
  return { page, codes, navigations, app, fail: () => { failure = true; }, defer: () => { finish = () => undefined; }, finish: () => finish?.() };
}

test('phone authorization alone signs in without a profile dialog or selected avatar', async () => {
  const h = phoneLoginHarness(); h.page.onLoad();
  assert.equal(h.page.data.privacyContractName, '《真实平台指引》');
  h.page.onAgreePrivacyAuthorization();
  assert.equal(h.codes.length, 0, 'privacy agreement alone cannot sign in');
  await h.page.onGetPhoneNumber({ detail: { code: 'phone-code', errMsg: 'getPhoneNumber:ok' } });
  assert.deepEqual(h.codes, ['phone-code']);
  assert.deepEqual(h.navigations, ['back']);
  assert.equal(h.app.globalData.accessToken, 'phone-user-token');
  assert.equal(h.page.data.loggingIn, false);
});

test('denied or missing phone authorization never attempts login', async () => {
  const h = phoneLoginHarness();
  for (const detail of [{ errMsg: 'getPhoneNumber:fail user deny' }, { code: 'ignored', errMsg: 'getPhoneNumber:fail cancel' }, {}]) {
    await h.page.onGetPhoneNumber({ detail });
    assert.equal(h.codes.length, 0);
    assert.match(h.page.data.loginError, /未完成手机号授权/);
  }
});

test('phone login failure permits retry and deleted accounts cannot log in', async () => {
  const h = phoneLoginHarness(); h.fail();
  await h.page.onGetPhoneNumber({ detail: { code: 'phone-code' } });
  assert.equal(h.page.data.loggingIn, false);
  assert.match(h.page.data.loginError, /重新授权/);
  assert.equal(h.navigations.length, 0);
  h.app.globalData.accountDeleted = true;
  await h.page.onGetPhoneNumber({ detail: { code: 'another-code' } });
  assert.equal(h.codes.length, 1);
  assert.match(h.page.data.loginError, /账户已删除/);
});

test('duplicate phone events are ignored and unloaded pages never navigate', async () => {
  const h = phoneLoginHarness(); h.defer();
  const pending = h.page.onGetPhoneNumber({ detail: { code: 'phone-code' } });
  await h.page.onGetPhoneNumber({ detail: { code: 'duplicate-code' } });
  assert.deepEqual(h.codes, ['phone-code']);
  h.page.onUnload(); h.finish(); await pending;
  assert.equal(h.navigations.length, 0);
});

test('phone consent is forwarded with a fresh WeChat login code in one request', async () => {
  const h = miniAppHarness({ needProfile: false, accessToken: 'user-token', userId: 'user-id', expiresIn: 3600 });
  await h.app.loginWithWechat('phone-code');
  assert.equal(JSON.stringify(h.requests[0]?.data), JSON.stringify({ code: 'wechat-code', phoneCode: 'phone-code' }));
  assert.equal(h.storage.get('myriad_she_access_token'), 'user-token');
});

test('a background login cannot swallow a later explicit phone authorization', async () => {
  const h = miniAppHarness({ needProfile: false, accessToken: 'user-token', userId: 'user-id', expiresIn: 3600 });
  await Promise.all([h.app.loginWithWechat(), h.app.loginWithWechat('phone-code')]);
  assert.equal(h.requests.length, 2);
  assert.equal(JSON.stringify(h.requests[1]?.data), JSON.stringify({ code: 'wechat-code', phoneCode: 'phone-code' }));
});

test('mini-program validates long legal bodies and optional introductions', () => {
  assert.equal(validators.isPrivacyPolicyContent(content('<p>' + '条款'.repeat(20_000) + '</p>')), true);
  assert.equal(validators.isPrivacyPolicyContent(content('x'.repeat(200_001))), false);
  assert.equal(validators.isPrivacyPolicyContent({ ...content(), version: 'invalid' }), false);
});

test('agreement link reads the published agreement, formats Word headings and refreshes on reopen', async () => {
  const paths: string[] = []; let calls = 0;
  const { page, getTitle } = pageHarness(async (path) => { paths.push(path); return content(`<h2>第 ${++calls} 版</h2><p><strong>条款</strong></p>`); });
  page.onLoad({ type: 'user-agreement' });
  assert.equal(getTitle(), '用户协议');
  await page.load();
  assert.equal(paths[0], '/content/user-agreement');
  assert.match(page.data.bodyNodes, /<h2 style="[^"]*">第 1 版<\/h2>/);
  assert.match(page.data.bodyNodes, /<strong>条款<\/strong>/);
  page.onHide(); await page.load();
  assert.match(page.data.bodyNodes, /第 2 版/);
});

test('failed legal reads show a retry state without substituting a built-in document', async () => {
  const { page } = pageHarness(async () => { throw new Error('offline'); });
  page.onLoad({}); await page.load();
  assert.equal(page.data.documentKey, 'privacy-policy');
  assert.equal(page.data.content, null); assert.equal(page.data.loading, false);
  assert.match(page.data.error, /重试/);
});

test('a response arriving after leaving the page cannot overwrite its state', async () => {
  let finish!: (value: unknown) => void;
  const { page } = pageHarness(() => new Promise((resolve) => { finish = resolve; }));
  page.onLoad({ type: 'user-agreement' });
  const loading = page.load(); page.onHide(); finish(content()); await loading;
  assert.equal(page.data.content, null);
});
