import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

// Exercise the real app with deterministic API fixtures; never use a live admin session.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, plugins: [vue()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(root, '..')] } } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const permissions = ['journal', 'contributions', 'observations', 'members', 'privacy', 'audit'];
  const timestamp = '2026-11-04T04:30:00Z';
  let memberTotal = 1286;
  let slowRefresh = false;
  let failRefresh = false;
  let emptyAudit = false;
  const pageData = (items = [], total = 0) => ({ items, total, limit: 50, offset: 0 });
  const requests = [];
  await page.addInitScript(() => {
    localStorage.setItem('myriad_she_admin_token', `test.${btoa(JSON.stringify({ role: 'super_admin', name: 'Test Editor' }))}.test`);
    localStorage.setItem('myriad_she_admin_expires_at', String(Date.now() + 3600000));
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api/, '');
    requests.push(path);
    if (slowRefresh) await new Promise((done) => setTimeout(done, 350));
    const send = (json) => route.fulfill({ json });
    if (failRefresh && path === '/content/home') return route.fulfill({ status: 500, json: { message: 'Test refresh failure' } });
    if (path === '/admin/me') return send({ id: 'test-admin', username: 'editor', displayName: 'Test Editor', role: 'super_admin', permissions });
    if (path === '/content/home') return send({ issue: null, question: '', coverUrl: '', sections: [], microVoice: { title: '', duration: '', url: '', enabled: false } });
    if (path === '/content/issues') return send([]);
    if (path === '/content/issues/summary') return send({ draftCount: 0, publishedCount: 0, archivedCount: 0, publishedCode: null, publishedUpdatedAt: null });
    if (path === '/admin/observations/lifecycle') return send({ retentionDays: 90, draftCount: 12, savedCount: 328, realityCount: 200, seasonCount: 140, wellFormedEnvelopeCount: 340, legacyPlaintextCount: 0, invalidEnvelopeCount: 0, staleDraftCount: 2, oldestDraftAt: timestamp });
    if (path === '/admin/observations') return send(pageData([], 328));
    if (path === '/admin/privacy-requests') return send({ ...pageData(), summary: { pendingCount: 3, duePendingCount: 1, leasedCount: 0, expiredLeaseCount: 0, failedCount: 0, completedCount: 12, cancelledCount: 1, oldestPendingAt: timestamp, nextDueAt: timestamp } });
    if (path === '/admin/audit-logs') return send({ rows: emptyAudit ? [] : Array.from({ length: 6 }, (_, i) => ({ id: `audit-${i}`, actorType: 'admin', actorId: 'test-admin', action: ['admin.auth.login_succeeded', 'member.listed', 'audit.logs.viewed'][i % 3], resourceType: ['admin_login', 'users', 'audit_logs'][i % 3], resourceId: null, createdAt: timestamp })), total: emptyAudit ? 0 : 2458, limit: 50, offset: 0 });
    if (path === '/admin/discussion-contributions') return send(pageData());
    if (path === '/admin/users') return send(pageData([{ id: 'member-1', nickname: 'Test Member', createdAt: timestamp, status: 'active' }], memberTotal));
    return route.fulfill({ status: 404, json: { message: `Unexpected fixture request: ${path}` } });
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(url);
  const overview = page.locator('#overview-panel');
  await overview.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.animated-number > [aria-hidden=true]')[2]?.textContent === '1,286');
  assert.equal(await overview.locator('.overview-metric').count(), 6);
  assert.equal(await overview.locator('.overview-chip.granted').count(), 6);
  assert.equal(await overview.locator('.overview-list li').count(), 6);
  const output = resolve(root, '.test-artifacts');
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
  await page.screenshot({ path: resolve(output, 'dashboard-desktop.png'), fullPage: true });

  // Hover feedback should finish at its target and remain keyboard-accessible.
  const card = overview.locator('.overview-metric').first();
  await card.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.overview-metric')).transform === 'matrix(1, 0, 0, 1, 0, -4)');
  await card.getByRole('button').focus();
  assert.equal(await card.getByRole('button').evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');

  memberTotal = 1298; slowRefresh = true;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.getByRole('button', { name: '同步中…', exact: true }).waitFor();
  assert.equal(await overview.getByRole('button', { name: '同步中…', exact: true }).isDisabled(), true);
  assert.equal(await overview.getAttribute('aria-busy'), 'true');
  await page.waitForFunction(() => document.querySelectorAll('.animated-number > [aria-hidden=true]')[2]?.textContent === '1,298');
  slowRefresh = false;
  await overview.getByRole('button', { name: '打开会员列表' }).click();
  await page.locator('#member-directory').waitFor();
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await overview.waitFor();
  await overview.getByRole('button', { name: '全部记录' }).click();
  await page.waitForFunction(() => !document.querySelector('#overview-panel'));
  assert.ok(requests.includes('/admin/audit-logs'));
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await overview.waitFor();

  for (const width of [1280, 1024, 768, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      await page.screenshot({ path: resolve(output, 'dashboard-overflow.png'), fullPage: true });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
  }
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
  await page.waitForFunction(() => document.querySelectorAll('.animated-number > [aria-hidden=true]')[2]?.textContent === '1,298');
  await page.screenshot({ path: resolve(output, 'dashboard-mobile.png'), fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await overview.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  assert.equal(await overview.locator('.overview-metric').first().evaluate((el) => getComputedStyle(el).animationName), 'none');
  assert.equal(await overview.locator('.animated-number > [aria-hidden=true]').nth(2).innerText(), '1,298');
  emptyAudit = true; memberTotal = 0;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.getByText('还没有操作记录，新的动态会出现在这里。').waitFor();
  assert.equal(await overview.locator('.animated-number > [aria-hidden=true]').nth(2).innerText(), '0');
  failRefresh = true;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.getByText('数据同步未完成，请重试', { exact: true }).waitFor();
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  failRefresh = false;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: dashboard metrics, authorization, timeline, hover/focus, refresh/loading/retry, navigation, 5 responsive widths, zero states, and reduced motion.');
} finally {
  await browser?.close();
  await server.close();
}
