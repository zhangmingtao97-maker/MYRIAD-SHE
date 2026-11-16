import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(relative: string) {
  const result = ts.transpileModule(readFileSync(resolve(__dirname, '../../../miniprogram', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length, 0);
  return result.outputText;
}

function harness(route = 'pages/home/index', activeTab = -1) {
  let definition: any;
  let navigation: any;
  let fallback: any;
  runInNewContext(compile('components/app-tab-bar/index.ts'), {
    exports: {}, Component: (value: any) => { definition = value; },
    getCurrentPages: () => [{ route }],
    wx: { switchTab: (options: any) => { navigation = options; }, reLaunch: (options: any) => { fallback = options; } },
  });
  const component = {
    ...definition.methods, properties: { activeTab }, data: { ...definition.data },
    setData(values: object) { Object.assign(this.data, values); },
  };
  definition.lifetimes.attached.call(component);
  return {
    component, navigation: () => navigation, fallback: () => fallback,
    route(value: string) { route = value; definition.pageLifetimes.show.call(component); },
    active(value: number) { component.properties.activeTab = value; definition.properties.activeTab.observer.call(component); },
    tap(index: number) { component.switchTab({ currentTarget: { dataset: { index } } }); },
  };
}

test('standalone navigation derives its selection from the visible page, including nested sections', () => {
  const h = harness();
  for (const [route, selected] of [
    ['pages/home/index', 0], ['pages/practice/index', 1], ['pages/mine/index', 2],
    ['pages/observation/index', 1], ['pages/season-intro/index', 1],
    ['pages/archive/index', 0], ['pages/story-detail/index', 0],
  ] as const) {
    h.route(route);
    assert.equal(h.component.data.selected, selected, route);
  }
});

test('native tab hosts control selection even when route callbacks arrive before the page stack updates', () => {
  const h = harness('pages/home/index', 2);
  assert.equal(h.component.data.selected, 2);
  h.active(1);
  assert.equal(h.component.data.selected, 1);
  h.route('pages/home/index');
  assert.equal(h.component.data.selected, 1);
});

test('late navigation callbacks cannot highlight an old destination after returning home', () => {
  const h = harness('pages/home/index', 0);
  h.tap(2);
  assert.equal(h.navigation().url, '/pages/mine/index');
  assert.equal(h.component.data.selected, 0, 'a pending switch must retain the visible selection');
  h.active(2);
  h.route('pages/mine/index');
  h.active(0);
  h.route('pages/home/index');
  h.navigation().success();
  assert.equal(h.component.data.selected, 0);
});

test('failed navigation keeps the visible selection until the fallback actually opens its page', () => {
  const h = harness();
  h.tap(1);
  h.navigation().fail();
  assert.equal(h.fallback().url, '/pages/practice/index');
  assert.equal(h.component.data.selected, 0);
  h.route('pages/practice/index');
  h.fallback().complete();
  assert.equal(h.component.data.selected, 1);
});

test('a tab recreated after a popup closes restores its host selection immediately', () => {
  assert.equal(harness('pages/mine/index', 2).component.data.selected, 2);
  assert.equal(harness('pages/practice/index', 1).component.data.selected, 1);
});

test('page selection updates the native host with its method receiver and tolerates a missing host', () => {
  const exports: { syncActiveTab?: (page: unknown, selected: number) => void } = {};
  runInNewContext(compile('utils/tab-bar.ts'), { exports });
  const host = { data: { selected: 0 }, setData(values: object) { Object.assign(this.data, values); } };
  const page = { host, getTabBar() { return this.host; } };
  for (const selected of [0, 1, 2]) {
    exports.syncActiveTab!(page, selected);
    assert.equal(host.data.selected, selected);
  }
  assert.doesNotThrow(() => exports.syncActiveTab!({}, 0));
  assert.doesNotThrow(() => exports.syncActiveTab!({ getTabBar: () => undefined }, 0));
});
