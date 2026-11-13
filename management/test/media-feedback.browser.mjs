import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const pending = new Map();
const received = [];
const server = await createServer({ root, configFile: false, plugins: [vue(), {
  name: 'media-upload-fixture',
  configureServer(server) {
    server.middlewares.use('/motion-upload', (req, res) => {
      received.push(req.headers);
      req.resume();
      req.on('end', () => pending.set(req.url, res));
    });
  },
}], server: { host: '127.0.0.1', port: 0 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/media-feedback-harness.html`);
  await page.waitForFunction(() => window.motionHarness);
  const label = () => page.locator('.save-state').innerText();
  assert.match(await label(), /未保存/);
  assert.equal(await page.locator('.save-state').evaluate((node) => getComputedStyle(node, '::before').content), 'none');
  await page.evaluate(() => { window.motionHarness.state.saving = true; });
  assert.match(await label(), /正在保存/);
  await page.evaluate(() => { Object.assign(window.motionHarness.state, { saving: false, dirty: false }); });
  assert.match(await label(), /已与云端同步/);
  await page.evaluate(() => { window.motionHarness.state.conflict = true; });
  assert.match(await label(), /版本已更新/);
  await page.evaluate(() => { window.motionHarness.state.conflict = false; });

  await page.evaluate(() => { void window.motionHarness.upload('/motion-upload/success'); });
  await page.waitForFunction(() => window.motionHarness.items[0]?.phase === 'confirming', null, { timeout: 4000 }).catch(async (error) => {
    throw new Error(`${error.message}; state=${JSON.stringify(await page.evaluate(() => window.motionHarness.state))}; pending=${[...pending.keys()]}; requests=${received.length}`);
  });
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
  assert.match(await page.locator('.media-upload-item p').last().innerText(), /等待确认/);
  assert.ok(pending.has('/success'));
  pending.get('/success').writeHead(200).end();
  await page.waitForFunction(() => window.motionHarness.state.result === 'complete');
  assert.match(await page.locator('.media-upload-item p').last().innerText(), /上传完成/);
  assert.equal(received[0].authorization, undefined, 'storage upload must not receive the admin token');
  assert.equal(received[0]['content-type'], 'audio/mpeg');
  const output = resolve(root, '.codex-artifacts/motion');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'upload-complete.png'), animations: 'disabled' });

  await page.evaluate(() => { void window.motionHarness.upload('/motion-upload/reject'); });
  await page.waitForFunction(() => window.motionHarness.items[0]?.phase === 'confirming');
  pending.get('/reject').writeHead(503).end();
  await page.waitForFunction(() => window.motionHarness.items[0]?.phase === 'error');
  assert.match(await page.locator('.media-upload-item p').last().innerText(), /503/);

  await page.evaluate(() => { void window.motionHarness.upload('/motion-upload/timeout', 150); });
  await page.waitForFunction(() => /超时/.test(window.motionHarness.state.result));
  await page.evaluate(() => { void window.motionHarness.upload('/motion-upload/cancel'); });
  await page.waitForFunction(() => window.motionHarness.items[0]?.phase === 'confirming');
  await page.evaluate(() => window.motionHarness.cancel());
  await page.waitForFunction(() => /取消/.test(window.motionHarness.state.result));
  await page.locator('.media-upload-status').waitFor({ state: 'hidden' });
  await page.evaluate(() => { void window.motionHarness.upload('/motion-upload/mobile-error'); });
  await page.waitForFunction(() => window.motionHarness.items[0]?.phase === 'confirming');
  pending.get('/mobile-error').writeHead(503).end();
  await page.waitForFunction(() => window.motionHarness.items[0]?.phase === 'error');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.motionHarness.state.saving = true; window.motionHarness.state.conflict = false; });
  assert.equal(await page.locator('.save-state-dot').evaluate((node) => getComputedStyle(node).animationName), 'none');
  await page.setViewportSize({ width: 375, height: 812 });
  const rect = await page.locator('.media-upload-status').boundingBox();
  assert.ok(rect.x >= 0 && rect.x + rect.width <= 375);
  await page.screenshot({ path: resolve(output, 'upload-mobile-error.png'), animations: 'disabled' });
  await page.evaluate(() => { Object.assign(window.motionHarness.state, { saving: false, dirty: false, savedAt: '2026-11-13T08:30:00Z', hasDraft: true }); });
  assert.match(await page.locator('.publication-status').innerText(), /本次保存.*草稿待发布/s);
  const requests = [];
  let onlineFailure = false;
  await page.route('**/content/practice', async (route) => {
    requests.push(route.request().url());
    if (onlineFailure) return route.fulfill({ status: 503, json: { message: '暂时无法读取线上内容' } });
    return route.fulfill({ json: { title: '线上实践', titleRichText: '线上实践', entries: [], editVersion: 1 } });
  });
  await page.getByRole('button', { name: '查看线上内容' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByText('线上实践', { exact: true }).waitFor({ timeout: 5000 }).catch(async (error) => { throw new Error(`${error.message}; dialog=${await page.getByRole('dialog').innerText()}`); });
  assert.equal(requests.length, 1);
  await page.screenshot({ path: resolve(output, 'published-preview-mobile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: '查看线上内容' }).evaluate((node) => node === document.activeElement), true);
  onlineFailure = true;
  await page.getByRole('button', { name: '查看线上内容' }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  onlineFailure = false;
  await page.getByRole('button', { name: '重新读取' }).click();
  await page.getByRole('dialog').getByText('线上实践', { exact: true }).waitFor({ timeout: 5000 }).catch(async (error) => { throw new Error(`${error.message}; dialog=${await page.getByRole('dialog').innerText()}`); });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: '查看线上内容' }).evaluate((node) => node === document.activeElement), true);
  await page.route('**/content/archive/issue-02', (route) => route.fulfill({ json: {
    issue: { code: 'issue-02', label: '第二期', month: '2026-11', theme: '线上期刊主题', question: '本期问题', labelRichText: '', monthRichText: '', themeRichText: '', questionRichText: '', microVoiceTitle: null, microVoiceDuration: null, homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '', homeCoverCaptionRightRichText: '', homeBackgroundUrl: '' },
    question: '本期问题', coverUrl: '', microVoice: { title: '', duration: '', url: '', enabled: false }, sections: [], publishedVersion: 7,
    modules: [{ id: 'issue-meta', type: 'issueMeta', enabled: true, order: 0, title: '线上期刊主题' }],
  } }));
  await page.evaluate(() => { window.motionHarness.state.previewKind = 'issue'; window.motionHarness.state.previewIssueCode = 'issue-02'; });
  await page.getByRole('button', { name: '查看线上内容' }).click();
  await page.getByRole('dialog').getByText('以下内容直接读取已发布版本 · v7。', { exact: true }).waitFor();
  await page.getByRole('dialog').locator('.phone-preview').waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: upload composable progress/acknowledgement, HTTP failure, timeout/cancellation, session cleanup, credentials, save/publication status, live preview/retry/focus, mobile layout and reduced motion.');
} finally {
  pending.forEach((response) => response.destroy());
  await browser?.close();
  await server.close();
}
