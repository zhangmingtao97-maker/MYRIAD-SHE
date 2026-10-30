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
    require: (path: string) => path.endsWith('/content') ? validators : { request, apiErrorMessage: (_error: unknown, fallback: string) => fallback },
  });
  page.setData = function(value) { Object.assign(this.data, value); };
  return { page, getTitle: () => title };
}

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
