import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, plugins: [vue(), {
  name: 'legal-document-test-page', configureServer(instance) {
    instance.middlewares.use('/__legal-test', (_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/test/legal-document-harness.ts"></script></html>');
    });
  },
}], server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const copy = (richText) => ({ richText, fontSize: 14, color: '#5c493c' });
  const initial = { title: copy('用户协议'), intro: copy(''), body: copy('<p>原有正文</p>'), version: '1.0', updatedDate: '', effectiveDate: '2026-11-01', updateNotes: '' };
  let state = { ...structuredClone(initial), editVersion: 1, publishedVersion: 1, publishedAt: '2026-10-23T04:00:00Z', draft: false };
  let publications = 0; let staleNextSave = false;
  await page.route('**/mock-api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const send = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname.includes('/privacy-revisions/')) return send([{ version: 1, publishedAt: state.publishedAt, publishedBy: '测试管理员', content: initial }]);
    if (url.pathname.endsWith('/import')) return send({ html: '<h1>导入标题</h1><p><strong>重要条款</strong><u>下划线</u></p><ol><li>第一项</li></ol>', warnings: ['请核对格式。'] });
    if (url.pathname.endsWith('/publish')) { publications += 1; state = { ...state, draft: false, publishedVersion: 2 }; return send(state); }
    if (request.method() === 'PATCH') {
      if (staleNextSave) { staleNextSave = false; return send({ message: '文档已被其他管理员更新' }, 409); }
      state = { ...state, ...request.postDataJSON(), editVersion: state.editVersion + 1, draft: true }; return send(state);
    }
    return send(state);
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__legal-test`);
  const manager = page.locator('section[aria-label="用户协议管理"]');
  await manager.getByLabel('文档标题', { exact: true }).waitFor();
  const original = await manager.getByRole('textbox', { name: '完整正文', exact: true }).innerText();
  await manager.locator('input[type=file]').setInputFiles({ name: '用户协议.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('fixture') });
  await manager.getByRole('button', { name: '取消导入' }).click();
  assert.equal(await manager.getByRole('textbox', { name: '完整正文', exact: true }).innerText(), original);
  await manager.locator('input[type=file]').setInputFiles({ name: '用户协议.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('fixture') });
  await manager.getByRole('button', { name: '用此正文替换本地草稿' }).click();
  assert.match(await manager.getByRole('textbox', { name: '完整正文', exact: true }).innerHTML(), /<strong>重要条款<\/strong><u>下划线<\/u>/);
  assert.equal(await manager.getByRole('button', { name: '发布到小程序' }).isDisabled(), true);
  await page.getByRole('button', { name: '切换隐私政策' }).click();
  await page.getByRole('button', { name: '切换用户协议' }).click();
  assert.match(await manager.getByRole('textbox', { name: '完整正文', exact: true }).innerText(), /重要条款/);
  await manager.getByRole('button', { name: '保存草稿', exact: true }).click();
  await manager.getByText('草稿已保存，发布后才会更新小程序。', { exact: true }).waitFor();
  assert.equal(publications, 0);
  await manager.getByRole('button', { name: '发布到小程序' }).click();
  await manager.getByText('已发布第 2 版，小程序下次打开文档时会读取新版。', { exact: true }).waitFor();
  assert.equal(publications, 1);
  await manager.getByText('查看发布历史与旧版正文', { exact: true }).click();
  await manager.getByRole('button', { name: '查看正文', exact: true }).click();
  await manager.getByRole('button', { name: '将此版本载入草稿' }).click();
  assert.equal(await manager.getByRole('textbox', { name: '完整正文', exact: true }).innerText(), '原有正文');
  staleNextSave = true;
  await manager.getByRole('button', { name: '保存草稿', exact: true }).click();
  await manager.getByText('云端文档已更新，本地内容已保留。请先复制需要保留的文字，再重新载入最新草稿。').waitFor();
  assert.equal(await manager.getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), true);
  await manager.getByRole('button', { name: '重新载入', exact: true }).click();
  await manager.getByLabel('文档标题', { exact: true }).waitFor();
  const effectiveDate = manager.getByLabel('生效日期（发布必填）');
  await effectiveDate.fill('');
  await manager.getByRole('button', { name: '保存草稿', exact: true }).click();
  await manager.getByText('草稿已保存，但生效日期为空，发布前请填写并再次保存。', { exact: true }).waitFor();
  await manager.getByRole('button', { name: '发布到小程序' }).click();
  await manager.getByText('请先填写生效日期并保存草稿，再发布。', { exact: true }).waitFor();
  await effectiveDate.fill('2026-11-01');
  await manager.getByRole('button', { name: '保存草稿', exact: true }).click();
  await manager.getByText('草稿已保存，发布后才会更新小程序。', { exact: true }).waitFor();
  await manager.getByText('预览当前草稿', { exact: true }).click();
  const output = resolve(root, '.test-artifacts'); await mkdir(output, { recursive: true });
  await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; });
  await page.screenshot({ path: resolve(output, 'legal-documents-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout must not overflow');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, 'legal-documents-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('PASS: import preview/cancel, format preservation, navigation draft retention, save/publish, history restore, conflict handling, and mobile layout.');
} finally { await browser.close(); await server.close(); }
