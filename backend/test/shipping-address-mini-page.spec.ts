import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(path: string) {
  const result = ts.transpileModule(readFileSync(resolve(__dirname, '../../../miniprogram', path), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length, 0);
  return result.outputText;
}
const utility: any = {};
runInNewContext(compile('utils/shipping-address.ts'), { exports: utility });
const compiled = compile('pages/addresses/index.ts');
const address = { userName: '测试收件人', telNumber: '13800138000', provinceName: '浙江省', cityName: '杭州市', countyName: '西湖区', detailInfo: '测试路 1 号', postalCode: '', nationalCode: '' };
const id = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const item = (other = {}) => ({ ...address, id, isDefault: true, createdAt: '2026-11-16T00:00:00.000Z', ...other });
const book = (items: any[] = [], version = 0) => ({ items, version, limit: 10 });
const event = (id: string) => ({ currentTarget: { dataset: { id } } });
async function settle() { for (let i = 0; i < 3; i++) await new Promise(setImmediate); }

function harness(initial = book()) {
  let page: any;
  let native: any;
  let handler: (path: string, options: any) => Promise<any> = async () => initial;
  const requests: any[] = [], modals: any[] = [], toasts: any[] = [], storage: any[] = [];
  const app = { globalData: { userId: 'user-1', accessToken: 'token', authGeneration: 0, accountDeleted: false } };
  runInNewContext(compiled, {
    exports: {}, getApp: () => app, Page: (definition: any) => { page = definition; }, console: { warn: () => undefined },
    require: (path: string) => path.endsWith('/shipping-address') ? utility : {
      request: async (path: string, options: any) => { requests.push({ path, options }); return handler(path, options); },
      apiErrorMessage: (error: any, fallback: string) => error.message || fallback,
    },
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 390 }),
      getMenuButtonBoundingClientRect: () => ({ left: 290 }),
      chooseAddress: (options: any) => { native = options; },
      showModal: (options: any) => { modals.push(options); },
      showToast: (options: any) => { toasts.push(options); },
      setStorageSync: (...args: any[]) => { storage.push(args); },
      enableAlertBeforeUnload: () => undefined, disableAlertBeforeUnload: () => undefined,
      hideKeyboard: () => undefined, pageScrollTo: () => undefined, navigateBack: () => undefined, switchTab: () => undefined,
    },
  });
  page.setData = (values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.split('.'); let target = page.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts[parts.length - 1]] = value;
    }
  };
  page.onLoad(); page.onShow();
  return { page, app, requests, modals, toasts, storage, native: () => native,
    respond: (next: typeof handler) => { handler = next; },
    fill: () => { for (const field of ['userName', 'telNumber', 'detailInfo']) page.onFieldInput({ currentTarget: { dataset: { field } }, detail: { value: address[field as keyof typeof address] } }); page.onRegionChange({ detail: { value: ['浙江省', '杭州市', '西湖区'] } }); },
  };
}

test('manual entry validates before sending, prevents duplicate saves and shows a masked confirmation', async () => {
  const h = harness(); await settle();
  assert.equal(h.page.data.bookReady, true); h.page.openEditor();
  await h.page.saveAddress();
  assert.equal(h.page.data.errorField, 'userName'); assert.equal(h.requests.length, 1);
  h.fill(); assert.equal(h.page.data.dirty, true);
  h.page.onFieldInput({ currentTarget: { dataset: { field: 'telNumber' } }, detail: { value: '+++++' } });
  await h.page.saveAddress(); assert.equal(h.page.data.errorField, 'telNumber'); assert.equal(h.requests.length, 1);
  h.fill();
  let release!: (value: any) => void;
  h.respond(() => new Promise(resolve => { release = resolve; }));
  const pending = h.page.saveAddress(); await h.page.saveAddress();
  assert.equal(h.requests.length, 2);
  const sent = h.requests[1];
  assert.equal(sent.options.method, 'POST'); assert.equal(sent.options.data.version, 0);
  assert.equal(sent.options.data.address.telNumber, address.telNumber);
  assert.equal(sent.options.data.isDefault, true);
  release({ ...book([item()], 1), savedId: id }); await pending;
  assert.equal(h.page.data.view, 'success'); assert.equal(h.page.data.saved.maskedPhone, '138****8000');
  assert.equal(h.page.data.form.telNumber, ''); assert.equal(h.page.data.dirty, false);
  h.page.showList(); assert.equal(h.page.data.items.length, 1);
  assert.equal(h.page.data.items[0].telNumber, undefined); assert.equal(h.storage.length, 0);
});

test('failed edits retain the draft; conflict requires reload and uses the new version', async () => {
  const h = harness(book([item()], 2)); await settle(); h.page.openEditor(event(id));
  h.page.onFieldInput({ currentTarget: { dataset: { field: 'detailInfo' } }, detail: { value: '修改后的路 8 号' } });
  h.respond(async () => { throw { statusCode: 503, message: '暂时不可用' }; });
  await h.page.saveAddress();
  assert.equal(h.page.data.view, 'edit'); assert.equal(h.page.data.form.detailInfo, '修改后的路 8 号'); assert.equal(h.page.data.dirty, true);
  h.respond(async () => { throw { statusCode: 409, message: '请重新加载' }; }); await h.page.saveAddress();
  assert.equal(h.page.data.conflict, true); const count = h.requests.length;
  await h.page.saveAddress(); assert.equal(h.requests.length, count);
  h.respond(async () => book([item()], 3)); await h.page.loadAddresses();
  assert.equal(h.page.data.conflict, false); assert.equal(h.page.data.form.detailInfo, '修改后的路 8 号');
  h.respond(async () => ({ ...book([item({ detailInfo: '修改后的路 8 号' })], 4), savedId: id }));
  await h.page.saveAddress();
  assert.equal(h.requests.at(-1).path, `/me/addresses/${id}`);
  assert.equal(h.requests.at(-1).options.data.version, 3); assert.equal(h.page.data.view, 'success');
});

test('setting default and deletion wait for server confirmation and cancellation is harmless', async () => {
  const h = harness(book([item(), item({ id: secondId, isDefault: false })], 4)); await settle();
  h.respond(async () => book([item({ isDefault: false }), item({ id: secondId })], 5));
  await h.page.setDefault(event(secondId));
  assert.equal(h.requests.at(-1).path, `/me/addresses/${secondId}/default`);
  assert.equal(h.page.data.items[0].id, secondId);
  h.page.removeAddress(event(secondId)); h.modals.at(-1).success({ confirm: false });
  assert.equal(h.requests.length, 2);
  h.respond(async () => book([item()], 6));
  h.page.removeAddress(event(secondId)); h.modals.at(-1).success({ confirm: true }); await settle();
  assert.equal(h.requests.at(-1).options.method, 'DELETE'); assert.equal(h.requests.at(-1).options.data.version, 5);
  assert.equal(h.page.data.items.length, 1);
});

test('WeChat declaration errors keep manual entry available; cancel is silent and import needs explicit save', async () => {
  const h = harness(); await settle(); h.page.importWechatAddress();
  h.native().fail({ errMsg: 'chooseAddress:fail api scope is not declared in the privacy agreement', errno: 112 });
  assert.match(h.page.data.importError, /手动填写/); assert.equal(h.page.data.importing, false);
  h.page.openEditor(); h.page.importWechatAddress();
  h.native().fail({ errMsg: 'chooseAddress:fail cancel' }); assert.equal(h.page.data.importError, '');
  h.page.importWechatAddress(); h.native().success({ ...address, errMsg: 'chooseAddress:ok' });
  assert.equal(h.requests.length, 1); assert.equal(h.page.data.form.telNumber, address.telNumber);
  assert.equal(h.page.data.dirty, true);
  h.page.handleBack(); assert.match(h.modals.at(-1).title, /放弃/);
  h.modals.at(-1).success({ confirm: false }); assert.equal(h.page.data.view, 'edit');
});

test('late responses and native callbacks cannot reveal the previous account addresses', async () => {
  const h = harness(); await settle(); h.page.importWechatAddress();
  const staleNative = h.native();
  h.app.globalData.userId = 'user-2'; h.app.globalData.authGeneration++;
  h.page.onShow(); await settle(); staleNative.success(address);
  assert.equal(h.page.data.form.telNumber, ''); assert.equal(h.page.data.view, 'list');
  let release!: (value: any) => void;
  h.respond(() => new Promise(resolve => { release = resolve; }));
  const pending = h.page.loadAddresses(); h.page.onUnload(); release(book([item()], 1)); await pending;
  assert.equal(h.page.data.items.length, 0); assert.equal(h.page.book, null);
});

test('a session replaced during automatic login reloads the new account instead of leaving a loading screen', async () => {
  const h = harness(); await settle();
  let requests = 0;
  h.respond(async () => {
    if (++requests === 1) { h.app.globalData.userId = 'refreshed-account'; return book([item()], 9); }
    return book();
  });
  await h.page.loadAddresses(); await settle();
  assert.equal(requests, 2); assert.equal(h.page.data.loading, false);
  assert.equal(h.page.data.items.length, 0); assert.equal(h.page.book.version, 0);
});
