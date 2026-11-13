import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(resolve(__dirname, '../../../miniprogram/pages/mine/index.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.equal(compiled.diagnostics?.length, 0);
const profileCompiled = ts.transpileModule(readFileSync(resolve(__dirname, '../../../miniprogram/pages/profile/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.equal(profileCompiled.diagnostics?.length, 0);

function harness(pageName: 'mine' | 'profile' = 'mine') {
  let page: any;
  let nativeValue: string | null = null;
  let pendingUpload: any;
  let requestHandler: (path: string, options?: any) => Promise<Record<string, unknown>> = async (_path, options) => ({ nickname: options?.data?.nickname ?? '原昵称', avatarUrl: 'https://example.com/avatar.jpg', phoneNumber: null });
  const requests: Array<{ path: string; options: any }> = [];
  const toasts: string[] = [];
  const app = { globalData: { userId: 'user-1', accessToken: 'test-token', authGeneration: 0, accountDeleted: false, apiBaseUrl: 'https://example.com/api', requestTimeoutMs: 8000 }, ensureLogin: async () => undefined };
  runInNewContext(pageName === 'mine' ? compiled.outputText : profileCompiled.outputText, {
    exports: {}, getApp: () => app, Page: (definition: any) => { page = definition; }, setTimeout, clearTimeout,
    wx: {
      showToast: ({ title }: { title: string }) => { toasts.push(title); }, hideKeyboard: () => undefined,
      uploadFile: (options: any) => { pendingUpload = options; },
      createSelectorQuery: () => ({ select: () => ({ fields: (_options: unknown, callback: (value: unknown) => void) => ({ exec: () => callback(nativeValue === null ? null : { value: nativeValue }) }) }) }),
    },
    require: (path: string) => path.endsWith('/request') ? {
      request: async (url: string, options: any) => { requests.push({ path: url, options }); return requestHandler(url, options); },
      apiErrorMessage: (_error: unknown, fallback: string) => fallback,
    } : {},
  });
  page.setData = (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.split('.');
      let target = page.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts[parts.length - 1]] = value;
    }
  };
  page.accountProfileUserId = app.globalData.userId;
  page.accountProfileSavedNickname = '原昵称';
  page.nicknameDraft = '原昵称';
  page.setData({ isLoggedIn: true, accountProfileReady: true, nicknameEditingValue: '原昵称', accountProfile: { nickname: '原昵称', avatarUrl: 'https://example.com/avatar.jpg', phoneNumber: null } });
  if (pageName === 'profile') page.setData({ loading: false, profile: { nickname: '原昵称', avatarUrl: 'https://example.com/avatar.jpg', phoneNumber: null } });
  return { page, app, requests, toasts, native: (value: string) => { nativeValue = value; }, upload: () => pendingUpload, respond: (handler: (path: string, options?: any) => Promise<Record<string, unknown>>) => { requestHandler = handler; } };
}

async function settle() { for (let i = 0; i < 5; i += 1) await new Promise(setImmediate); }

test('profile setup exposes an empty native nickname field and saves the native WeChat avatar under the signed-in account', async () => {
  const h = harness('profile');
  h.page.setData({ setup: true });
  h.respond(async () => ({ nickname: '微信用户AB12', avatarUrl: null, phoneNumber: null }));
  await h.page.loadProfile();
  assert.equal(h.page.data.editingNickname, true);
  assert.equal(h.page.data.nicknameEditingValue, '');
  assert.equal(h.page.nicknameDraft, '');
  h.page.prepareAvatarSelection();
  h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://wechat-avatar' } });
  await settle();
  assert.equal(h.upload().url, 'https://example.com/api/me/profile/avatar');
  assert.equal(h.upload().header.Authorization, 'Bearer test-token');
  h.upload().success({ statusCode: 200, data: JSON.stringify({ nickname: '微信用户AB12', avatarUrl: 'https://example.com/saved-avatar.png', phoneNumber: null }) });
  await settle();
  assert.equal(h.page.data.profile.avatarUrl, 'https://example.com/saved-avatar.png');
  assert.equal(h.page.data.nicknameEditingValue, '');
});

for (const pageName of ['mine', 'profile'] as const) {
  const avatar = (page: any) => pageName === 'mine' ? page.data.accountProfile.avatarUrl : page.data.profile.avatarUrl;

  test(`${pageName}: the native chooser gesture captures the account without rerendering or starting an upload`, () => {
    const h = harness(pageName);
    let renders = 0;
    const setData = h.page.setData;
    h.page.setData = (values: Record<string, unknown>) => { renders += 1; setData(values); };
    h.page.prepareAvatarSelection();
    assert.equal(renders, 0, 'the native open-type gesture must not mount an intervening dialog');
    assert.equal(h.page.avatarSelection.userId, h.app.globalData.userId);
    assert.equal(h.requests.length, 0);
    assert.equal(h.upload(), undefined);
    h.page.onAvatarError({ detail: { errMsg: 'chooseAvatar:fail cancel' } });
    assert.equal(h.page.avatarSelection, null);
    assert.equal(h.toasts.length, 0);
    assert.equal(h.upload(), undefined);
  });

  test(`${pageName}: native privacy errors leave an actionable message and allow another attempt`, () => {
    const h = harness(pageName);
    h.page.prepareAvatarSelection();
    h.page.onAvatarError({ detail: { errMsg: 'chooseAvatar:fail privacy permission is not authorized' } });
    assert.equal(h.page.avatarSelection, null);
    assert.match(h.toasts.at(-1)!, /隐私授权/);
    h.page.prepareAvatarSelection();
    assert.equal(h.page.avatarSelection.userId, h.app.globalData.userId);
  });

  test(`${pageName}: a native avatar selection previews and persists`, async () => {
    const h = harness(pageName);
    h.page.prepareAvatarSelection();
    h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://picked' } });
    assert.equal(h.page.avatarSelection, null);
    assert.equal(avatar(h.page), 'wxfile://picked');
    await settle();
    assert.equal(h.upload().filePath, 'wxfile://picked');
    h.upload().success({ statusCode: 200, data: JSON.stringify({ nickname: '原昵称', avatarUrl: 'https://example.com/new.jpg', phoneNumber: null }) });
    await settle();
    assert.equal(avatar(h.page), 'https://example.com/new.jpg');
    assert.equal(h.page.data[pageName === 'mine' ? 'profileSaving' : 'saving'], false);
    assert.ok(h.toasts.includes('头像已更新'));
  });

  test(`${pageName}: an account change while choosing rejects the image and explains why`, async () => {
    const h = harness(pageName);
    h.page.prepareAvatarSelection();
    h.app.globalData.userId = 'user-2';
    h.app.globalData.authGeneration += 1;
    h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://old-account' } });
    await settle();
    assert.equal(h.upload(), undefined);
    assert.equal(avatar(h.page), 'https://example.com/avatar.jpg');
    assert.match(h.toasts.at(-1)!, /登录状态/);
  });

  test(`${pageName}: saving and signed-out states give feedback instead of silently ignoring a tap`, () => {
    const h = harness(pageName);
    const saving = pageName === 'mine' ? 'profileSaving' : 'saving';
    h.page.setData({ [saving]: true });
    h.page.prepareAvatarSelection();
    assert.equal(h.page.avatarSelection, null);
    assert.match(h.toasts.at(-1)!, /保存/);
    h.page.setData({ [saving]: false });
    h.app.globalData.accessToken = '';
    h.page.prepareAvatarSelection();
    assert.equal(h.page.avatarSelection, null);
    assert.match(h.toasts.at(-1)!, /登录/);
  });

  test(`${pageName}: failed or invalid avatar uploads restore the old image and permit retry`, async () => {
    for (const failure of ['network', 'server', 'invalid-json']) {
      const h = harness(pageName);
      h.page.prepareAvatarSelection();
      h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://picked' } });
      await settle();
      if (failure === 'network') h.upload().fail(new Error('offline'));
      else h.upload().success({ statusCode: failure === 'server' ? 500 : 200, data: 'invalid' });
      await settle();
      assert.equal(avatar(h.page), 'https://example.com/avatar.jpg');
      assert.equal(h.page.data[pageName === 'mine' ? 'profileSaving' : 'saving'], false);
      assert.match(pageName === 'mine' ? h.page.data.profileError : h.toasts.at(-1), /重新选择/);
      h.page.prepareAvatarSelection();
      assert.equal(h.page.avatarSelection.userId, h.app.globalData.userId);
    }
  });

  test(`${pageName}: a late profile read cannot overwrite an avatar being uploaded`, async () => {
    const h = harness(pageName);
    let finish!: (value: any) => void;
    h.respond(() => new Promise((resolve) => { finish = resolve; }));
    const reading = pageName === 'mine' ? h.page.loadAccountProfile() : h.page.loadProfile();
    h.page.prepareAvatarSelection();
    h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://picked' } });
    finish({ nickname: '旧昵称', avatarUrl: 'https://example.com/stale.jpg', phoneNumber: null });
    await reading;
    assert.equal(avatar(h.page), 'wxfile://picked');
    await settle();
    h.upload().success({ statusCode: 200, data: JSON.stringify({ nickname: '原昵称', avatarUrl: 'https://example.com/new.jpg', phoneNumber: null }) });
    await settle();
    assert.equal(avatar(h.page), 'https://example.com/new.jpg');
  });
}

test('typed nickname saves automatically only after WeChat review, without rewriting the focused input', async () => {
  const h = harness();
  h.page.onNicknameFocus();
  h.page.onNicknameInput({ detail: { value: ' 自己输入的名字 ' } });
  assert.equal(h.page.data.nicknameEditingValue, '原昵称');
  h.page.onNicknameBlur({ detail: { value: ' 自己输入的名字 ' } });
  assert.equal(h.requests.length, 0);
  h.page.onNicknameReview({ detail: { pass: true } });
  await settle();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.data.nickname, '自己输入的名字');
  assert.equal(h.page.data.accountProfile.nickname, '自己输入的名字');
  assert.equal(h.page.data.nicknameEditingValue, '自己输入的名字');
  assert.equal(h.page.data.profileSaving, false);
});

test('WeChat nickname autofill reads the native value even when input/change events did not fire', async () => {
  const h = harness();
  h.native('微信昵称');
  h.page.onNicknameFocus();
  h.page.onNicknameReview({ detail: { pass: true } });
  await settle();
  assert.equal(h.requests.length, 1);
  assert.equal(h.page.data.accountProfile.nickname, '微信昵称');
});

test('failed or timed-out nickname review cannot persist the nickname', async () => {
  for (const detail of [{ pass: false }, { pass: true, timeout: true }]) {
    const h = harness();
    h.page.onNicknameInput({ detail: { value: '待审核名字' } });
    h.page.onNicknameReview({ detail });
    await settle();
    assert.equal(h.requests.length, 0);
    assert.match(h.page.data.profileError, /校验/);
  }
});

test('nickname save failure restores the saved nickname and leaves a visible retry message', async () => {
  const h = harness();
  h.respond(async () => { throw new Error('offline'); });
  await h.page.commitNickname('新昵称');
  assert.equal(h.page.data.accountProfile.nickname, '原昵称');
  assert.equal(h.page.data.nicknameEditingValue, '原昵称');
  assert.match(h.page.data.profileError, /重试/);
  assert.equal(h.page.data.profileSaving, false);
});

test('avatar selection previews immediately and a failed upload restores the saved avatar', async () => {
  const h = harness();
  const upload = h.page.uploadAvatar('user-1', 'wxfile://selected-avatar');
  assert.equal(h.page.data.accountProfile.avatarUrl, 'wxfile://selected-avatar');
  await settle();
  h.upload().fail(new Error('offline'));
  await upload;
  assert.equal(h.page.data.accountProfile.avatarUrl, 'https://example.com/avatar.jpg');
  assert.match(h.page.data.profileError, /重新选择/);
});

test('a reviewed nickname waits for the avatar upload and both changes persist', async () => {
  const h = harness();
  const upload = h.page.uploadAvatar('user-1', 'wxfile://selected-avatar');
  await settle();
  h.native('微信昵称');
  h.page.onNicknameReview({ detail: { pass: true } });
  await settle();
  assert.equal(h.requests.length, 0);
  h.upload().success({ statusCode: 200, data: JSON.stringify({ nickname: '原昵称', avatarUrl: 'https://example.com/avatar.jpg', phoneNumber: null }) });
  await upload;
  await settle();
  assert.equal(h.requests.length, 1);
  assert.equal(h.page.data.accountProfile.nickname, '微信昵称');
  assert.equal(h.page.data.profileSaving, false);
});

test('a nickname save response cannot overwrite a different account', async () => {
  const h = harness();
  let finish!: (value: any) => void;
  h.respond(() => new Promise((resolve) => { finish = resolve; }));
  const saving = h.page.commitNickname('新昵称');
  h.app.globalData.authGeneration += 1;
  h.page.accountProfileUserId = 'user-2';
  h.page.setData({ accountProfile: { nickname: '另一个账户', avatarUrl: null, phoneNumber: null } });
  finish({ nickname: '旧账户返回值', avatarUrl: null, phoneNumber: null });
  await saving;
  assert.equal(h.page.data.accountProfile.nickname, '另一个账户');
});

test('profile binds a WeChat phone number directly without returning to login', async () => {
  const h = harness('profile');
  h.respond(async (path) => {
    if (path !== '/me/phone-number') throw new Error('unexpected request');
    return { nickname: '原昵称', avatarUrl: 'https://example.com/avatar.jpg', phoneNumber: '+8613800138000' };
  });
  await h.page.onGetPhoneNumber({ detail: { errMsg: 'getPhoneNumber:ok', code: 'phone-code' } });
  assert.deepEqual(h.requests.map((entry) => entry.path), ['/me/phone-number']);
  assert.equal(JSON.stringify(h.requests[0]?.options), JSON.stringify({ method: 'POST', data: { code: 'phone-code' } }));
  assert.equal(h.page.data.profile.phoneNumber, '+8613800138000');
  assert.equal(h.page.data.saving, false);
  assert.equal(h.toasts.at(-1), '手机号已绑定');
});
