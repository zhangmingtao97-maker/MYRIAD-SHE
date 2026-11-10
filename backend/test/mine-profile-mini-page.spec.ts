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
const pickerCompiled = ts.transpileModule(readFileSync(resolve(__dirname, '../../../miniprogram/components/avatar-picker/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.equal(pickerCompiled.diagnostics?.length, 0);

function harness(pageName: 'mine' | 'profile' = 'mine') {
  let page: any;
  let nativeValue: string | null = null;
  let pendingUpload: any;
  let requestHandler = async (_path: string, options?: any) => ({ nickname: options?.data?.nickname ?? '原昵称', avatarUrl: 'https://example.com/avatar.jpg', phoneNumber: null });
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
  return { page, app, requests, toasts, native: (value: string) => { nativeValue = value; }, upload: () => pendingUpload, respond: (handler: typeof requestHandler) => { requestHandler = handler; } };
}

async function settle() { for (let i = 0; i < 5; i += 1) await new Promise(setImmediate); }

function pickerHarness(supported = true) {
  let definition: any;
  let pendingImage: any;
  const events: Array<{ name: string; detail: any }> = [];
  runInNewContext(pickerCompiled.outputText, {
    exports: {}, Component: (value: any) => { definition = value; },
    wx: { canIUse: () => supported, chooseImage: (options: any) => { pendingImage = options; } },
  });
  const picker = {
    ...definition.methods,
    data: { ...definition.data }, properties: { visible: false, busy: false },
    setData(values: Record<string, unknown>) { Object.assign(this.data, values); },
    triggerEvent(name: string, detail?: any) { events.push({ name, detail }); },
  };
  const visible = (value: boolean) => {
    picker.properties.visible = value;
    definition.observers.visible.call(picker, value);
  };
  definition.lifetimes.attached.call(picker);
  visible(true);
  return { picker, events, visible, image: () => pendingImage, detach: () => definition.lifetimes.detached.call(picker) };
}

for (const pageName of ['mine', 'profile'] as const) {
  const avatar = (page: any) => pageName === 'mine' ? page.data.accountProfile.avatarUrl : page.data.profile.avatarUrl;

  test(`${pageName}: tapping an avatar opens the sheet immediately even if reading profile failed`, () => {
    const h = harness(pageName);
    h.page.setData({ accountProfileReady: false, profileError: '读取失败', loadError: '读取失败' });
    assert.equal(h.page.data.avatarPickerVisible, false);
    h.page.openAvatarPicker();
    assert.equal(h.page.data.avatarPickerVisible, true);
    assert.equal(h.requests.length, 0);
    assert.equal(h.upload(), undefined);
    h.page.closeAvatarPicker();
    assert.equal(h.page.data.avatarPickerVisible, false);
    assert.equal(h.page.avatarSelection, null);
    assert.equal(h.upload(), undefined);
  });

  test(`${pageName}: a selected avatar closes the sheet, previews, and persists`, async () => {
    const h = harness(pageName);
    h.page.openAvatarPicker();
    h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://picked' } });
    assert.equal(h.page.data.avatarPickerVisible, false);
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
    h.page.openAvatarPicker();
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
    h.page.openAvatarPicker();
    assert.equal(h.page.data.avatarPickerVisible, false);
    assert.match(h.toasts.at(-1)!, /保存/);
    h.page.setData({ [saving]: false });
    h.app.globalData.accessToken = '';
    h.page.openAvatarPicker();
    assert.equal(h.page.data.avatarPickerVisible, false);
    assert.match(h.toasts.at(-1)!, /登录/);
  });

  test(`${pageName}: failed or invalid avatar uploads restore the old image and permit retry`, async () => {
    for (const failure of ['network', 'server', 'invalid-json']) {
      const h = harness(pageName);
      h.page.openAvatarPicker();
      h.page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://picked' } });
      await settle();
      if (failure === 'network') h.upload().fail(new Error('offline'));
      else h.upload().success({ statusCode: failure === 'server' ? 500 : 200, data: 'invalid' });
      await settle();
      assert.equal(avatar(h.page), 'https://example.com/avatar.jpg');
      assert.equal(h.page.data[pageName === 'mine' ? 'profileSaving' : 'saving'], false);
      assert.match(pageName === 'mine' ? h.page.data.profileError : h.toasts.at(-1), /重新选择/);
      h.page.openAvatarPicker();
      assert.equal(h.page.data.avatarPickerVisible, true);
    }
  });

  test(`${pageName}: a late profile read cannot overwrite an avatar being uploaded`, async () => {
    const h = harness(pageName);
    let finish!: (value: any) => void;
    h.respond(() => new Promise((resolve) => { finish = resolve; }));
    const reading = pageName === 'mine' ? h.page.loadAccountProfile() : h.page.loadProfile();
    h.page.openAvatarPicker();
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

test('the sheet forwards the native WeChat avatar and keeps errors inside the sheet', () => {
  const h = pickerHarness();
  h.picker.onWechatAvatar({ detail: {} });
  assert.match(h.picker.data.error, /相册/);
  assert.equal(h.events.length, 0);
  h.picker.onWechatAvatar({ detail: { avatarUrl: 'wxfile://wechat' } });
  assert.equal(h.events[0].name, 'chooseavatar');
  assert.equal(h.events[0].detail.avatarUrl, 'wxfile://wechat');
  h.visible(false);
  h.picker.onWechatAvatar({ detail: { avatarUrl: 'wxfile://late' } });
  assert.equal(h.events.length, 1);
});

test('album and camera actions open only the requested image source', () => {
  for (const source of ['album', 'camera']) {
    const h = pickerHarness();
    h.picker.chooseImage({ currentTarget: { dataset: { source } } });
    assert.equal(h.picker.data.choosing, true);
    assert.equal(h.image().count, 1);
    assert.deepEqual(Array.from(h.image().sourceType), [source]);
    h.image().success({ tempFilePaths: [`wxfile://${source}`] });
    h.image().complete();
    assert.equal(h.events[0].detail.avatarUrl, `wxfile://${source}`);
    assert.equal(h.picker.data.choosing, false);
  }
});

test('canceling image selection keeps the sheet ready for another choice', () => {
  const h = pickerHarness();
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'album' } } });
  h.image().fail({ errMsg: 'chooseImage:fail cancel' });
  h.image().complete();
  assert.equal(h.picker.data.error, '');
  assert.equal(h.picker.data.choosing, false);
  assert.equal(h.picker.properties.visible, true);
  assert.equal(h.events.length, 0);
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'camera' } } });
  assert.deepEqual(Array.from(h.image().sourceType), ['camera']);
});

test('native chooser failures explain the fallback and camera permission errors allow retry', () => {
  const h = pickerHarness();
  h.picker.onWechatError({ detail: { errMsg: 'chooseAvatar:fail' } });
  assert.match(h.picker.data.error, /相册/);
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'camera' } } });
  h.image().fail({ errMsg: 'chooseImage:fail auth deny' });
  h.image().complete();
  assert.match(h.picker.data.error, /相机权限/);
  assert.equal(h.picker.data.choosing, false);
  assert.equal(h.events.length, 0);
});

test('closing and reopening the sheet ignores the previous image selection callback', () => {
  const h = pickerHarness();
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'album' } } });
  const oldSelection = h.image();
  h.picker.close();
  assert.equal(h.events[0].name, 'close');
  h.visible(false);
  h.visible(true);
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'camera' } } });
  oldSelection.success({ tempFilePaths: ['wxfile://stale'] });
  oldSelection.complete();
  assert.equal(h.events.length, 1);
  assert.equal(h.picker.data.choosing, true);
  h.image().success({ tempFilePaths: ['wxfile://current'] });
  h.image().complete();
  assert.equal(h.events[1].detail.avatarUrl, 'wxfile://current');
});

test('a client without WeChat avatar support can still select a local image', () => {
  const h = pickerHarness(false);
  assert.equal(h.picker.data.supportsWechatAvatar, false);
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'album' } } });
  h.image().success({ tempFilePaths: ['wxfile://local'] });
  assert.equal(h.events[0].detail.avatarUrl, 'wxfile://local');
});

test('detached sheets ignore outstanding native image callbacks', () => {
  const h = pickerHarness();
  h.picker.chooseImage({ currentTarget: { dataset: { source: 'album' } } });
  h.detach();
  h.image().success({ tempFilePaths: ['wxfile://late'] });
  assert.equal(h.events.length, 0);
});

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
