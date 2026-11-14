import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

// Exercise the real app with deterministic API fixtures; never use a live admin session.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, cacheDir: resolve(root, '.test-artifacts/vite-dashboard'), plugins: [vue()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(root, '..')] } } });
await server.listen();
let browser;
try {
  const { createDefaultDiscussionContent } = await server.ssrLoadModule('/src/discussion-content.ts');
  const timestamp = '2026-11-04T04:30:00Z';
  const publishedQuestion = '线上首页正在展示的问题';
  const draftQuestion = '草稿里尚未发布的新问题';
  const publishedIssue = {
    id: 'issue-02', code: 'issue-02', label: 'ISSUE 02', labelRichText: '', month: 'Sep 2026', monthRichText: '', theme: '手指一根一根松开', themeRichText: '',
    question: draftQuestion, questionRichText: '', status: 'published', editVersion: 2,
    microVoiceTitle: null, microVoiceDuration: null, coverObjectKey: null, microVoiceObjectKey: null,
    homeBackgroundObjectKey: null, homeMetaRichText: '把目光放回日常', homeMetaFontSize: 16,
    homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '本期封面', homeCoverCaptionRightRichText: '',
    updatedAt: timestamp, publishedVersion: 1,
    publishedTheme: '手指一根一根松开', publishedQuestion, publishedLabelRichText: '', publishedMonthRichText: '', publishedThemeRichText: '', publishedQuestionRichText: '', publishedLabel: 'ISSUE 02', publishedMonth: 'Sep 2026',
    publishedCode: 'issue-02', publishedMicroVoiceTitle: null, publishedMicroVoiceDuration: null,
    publishedHomeMetaRichText: '把目光放回日常', publishedHomeMetaFontSize: 16, publishedHomeMetaColor: '#40362f',
    publishedHomeCoverCaptionLeft: '人物纪实', publishedHomeCoverCaptionLeftRichText: '', publishedHomeCoverCaptionRight: '本期封面', publishedHomeCoverCaptionRightRichText: '',
    draftContent: {
      discussion: createDefaultDiscussionContent(),
      sections: [{ id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: 'ISSUE 02', month: 'Sep 2026' }],
    },
  };
  const publishedHome = {
    issue: {
      code: 'issue-02', label: 'ISSUE 02', labelRichText: '', month: 'Sep 2026', monthRichText: '', theme: '手指一根一根松开', themeRichText: '', question: publishedQuestion, questionRichText: '',
      microVoiceTitle: null, microVoiceDuration: null, homeMetaRichText: '把目光放回日常', homeMetaFontSize: 16,
      homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '本期封面', homeCoverCaptionRightRichText: '', homeBackgroundUrl: '',
    },
    question: publishedQuestion, coverUrl: '', sections: [],
    microVoice: { title: '', duration: '', url: '', enabled: false }, publishedVersion: 1,
  };
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const permissions = ['journal', 'contributions', 'observations', 'members', 'privacy', 'audit', 'discussion-reports'];
  let memberTotal = 1286;
  let slowRefresh = false;
  let failRefresh = false;
  let emptyAudit = false;
  let failMembers = false;
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
    if (path === '/admin/notifications/unread-count') return send({ unreadCount: 0 });
    if (path === '/content/home') return send(publishedHome);
    if (path === '/content/archive/issue-02') return send(publishedHome);
    if (path === '/content/issues') return send([publishedIssue]);
    if (path === '/content/issues/summary') return send({ draftCount: 0, publishedCount: 1, archivedCount: 0, publishedCode: 'issue-02', publishedUpdatedAt: timestamp });
    if (path === '/admin/observations/lifecycle') return send({ retentionDays: 90, draftCount: 12, savedCount: 328, realityCount: 200, seasonCount: 140, wellFormedEnvelopeCount: 340, legacyPlaintextCount: 0, invalidEnvelopeCount: 0, staleDraftCount: 2, oldestDraftAt: timestamp });
    if (path === '/admin/observations') return send(pageData([], 328));
    if (path === '/admin/privacy-requests') return send({ ...pageData(), summary: { pendingCount: 3, duePendingCount: 1, leasedCount: 0, expiredLeaseCount: 0, failedCount: 0, completedCount: 12, cancelledCount: 1, oldestPendingAt: timestamp, nextDueAt: timestamp } });
    if (path === '/admin/audit-logs') return send({ rows: emptyAudit ? [] : Array.from({ length: 6 }, (_, i) => ({ id: `audit-${i}`, actorType: 'admin', actorId: 'test-admin', action: ['admin.auth.login_succeeded', 'member.listed', 'audit.logs.viewed'][i % 3], resourceType: ['admin_login', 'users', 'audit_logs'][i % 3], resourceId: null, createdAt: timestamp })), total: emptyAudit ? 0 : 2458, limit: 50, offset: 0 });
    if (path === '/admin/discussion-contributions') return send({ ...pageData(), summary: { pending: 0, published: 0, hidden: 0, rejected: 0 } });
    if (path === '/admin/discussion-reports') return send({ ...pageData(), summary: { pending: 2, handled: 0, dismissed: 0 } });
    if (failMembers && path === '/admin/users') return route.fulfill({ status: 500, json: { message: 'Test member read failure' } });
    if (path === '/admin/users') return send(pageData([{ id: 'member-1', nickname: 'Test Member', createdAt: timestamp, status: 'active' }], memberTotal));
    return route.fulfill({ status: 404, json: { message: `Unexpected fixture request: ${path}` } });
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(url);
  const overview = page.locator('#overview-panel');
  await overview.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#overview-panel')?.getAttribute('aria-busy') === 'false');
  assert.equal(await overview.locator('.editorial-metric').count(), 4);
  assert.match(await overview.locator('[data-metric="members"] strong').innerText(), /1,286/);
  assert.equal(await overview.locator('.editorial-task').count(), 3);
  assert.match(await overview.locator('.editorial-task').first().innerText(), /隐私申请[\s\S]*1 条已到处理时间[\s\S]*3/);
  assert.equal(await overview.locator('.editorial-primary').count(), 1);
  assert.equal(await page.getByRole('button', { name: '刷新数据', exact: true }).count(), 1);
  const output = resolve(root, '.test-artifacts');
  await mkdir(output, { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
  await page.screenshot({ path: resolve(output, 'dashboard-desktop.png'), fullPage: true });

  // Quiet rows keep a stable position while remaining keyboard-accessible.
  const card = overview.locator('.editorial-metric').first();
  await card.hover();
  assert.equal(await card.evaluate((el) => getComputedStyle(el).transform), 'none');
  await card.focus();
  assert.equal(await card.evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');

  await overview.getByRole('button', { name: '查看线上版本', exact: true }).click();
  const publishedPreview = page.getByRole('dialog', { name: '小程序线上内容' });
  await publishedPreview.getByText('v1', { exact: false }).waitFor();
  assert.ok(requests.includes('/content/archive/issue-02'));
  await publishedPreview.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await overview.getByRole('button', { name: '查看线上版本', exact: true }).evaluate(el => el === document.activeElement), true);

  memberTotal = 1298; slowRefresh = true;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.getByRole('button', { name: '同步中…', exact: true }).waitFor();
  assert.equal(await overview.getByRole('button', { name: '同步中…', exact: true }).isDisabled(), true);
  assert.equal(await overview.getAttribute('aria-busy'), 'true');
  await page.waitForFunction(() => document.querySelector('#overview-panel')?.getAttribute('aria-busy') === 'false' && document.querySelector('[data-metric="members"] strong')?.textContent.includes('1,298'));
  slowRefresh = false;
  await overview.locator('[data-metric="members"]').click();
  await page.locator('#member-directory').waitFor();
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await overview.waitFor();
  await overview.locator('[data-metric="audit"]').click();
  await page.locator('#audit-logs').waitFor();
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
  assert.match(await overview.locator('[data-metric="members"] strong').innerText(), /1,298/);
  await page.screenshot({ path: resolve(output, 'dashboard-mobile.png'), fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await overview.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#overview-panel')?.getAttribute('aria-busy') === 'false');
  assert.equal(await overview.locator('.editorial-metric').first().evaluate((el) => getComputedStyle(el).animationName), 'none');
  assert.match(await overview.locator('[data-metric="members"] strong').innerText(), /1,298/);
  emptyAudit = true; memberTotal = 0;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#overview-panel')?.getAttribute('aria-busy') === 'false' && document.querySelector('[data-metric="members"] strong')?.textContent === '0位');
  assert.equal(await overview.locator('[data-metric="audit"] strong').textContent(), '0条');
  failMembers = true;
  const failedMemberRead = page.waitForResponse(response => response.url().includes('/admin/users') && response.status() === 500);
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await failedMemberRead;
  await page.waitForFunction(() => document.querySelector('#overview-panel')?.getAttribute('aria-busy') === 'false');
  assert.match(await overview.locator('[data-metric="members"]').innerText(), /暂未读取，点击查看/);
  assert.equal(await overview.locator('[data-metric="members"] strong').textContent(), '—位');
  failMembers = false;
  await overview.locator('[data-metric="audit"]').click();
  await page.locator('#audit-logs .audit-empty-state').getByText('当前筛选条件下没有操作记录').waitFor();
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await overview.waitFor();
  failRefresh = true;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.getByText('数据同步未完成，请重试', { exact: true }).waitFor();
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  failRefresh = false;
  await overview.getByRole('button', { name: '刷新数据', exact: true }).click();
  await overview.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();

  await page.setViewportSize({ width: 1440, height: 900 });
  await overview.getByRole('button', { name: '继续编辑', exact: false }).click();
  const editor = page.locator('#journal-module-workspace [contenteditable="true"]').first();
  await editor.waitFor();
  await editor.fill('保留在内存中的未保存草稿');
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await overview.locator('.editorial-draft-note').waitFor();
  await overview.getByRole('button', { name: '继续编辑', exact: false }).click();
  assert.equal(await editor.innerText(), '保留在内存中的未保存草稿');
  await page.getByRole('button', { name: '工作台', exact: true }).click();

  // A published snapshot may differ from the current draft. The dashboard must
  // compare homepage fields with published* fields and keep the issue list usable.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Control+k');
  const quickNavigation = page.getByRole('dialog', { name: '快速前往' });
  await quickNavigation.waitFor();
  await quickNavigation.getByRole('combobox').fill('期刊列表');
  await quickNavigation.getByRole('option').filter({ has: page.getByText('期刊列表', { exact: true }) }).click();
  await quickNavigation.waitFor({ state: 'detached' });
  await page.locator('#journal-list .issue-list-item').waitFor();
  assert.equal(await page.locator('#journal-list .issue-list-item').count(), 1);
  assert.match(await page.locator('#journal-list .issue-list-item').innerText(), /ISSUE 02/);
  assert.equal(await page.getByText('期刊列表、生命周期摘要与首页发布内容不一致，请刷新后核实').count(), 0);
  // Restricted accounts should neither see journal actions nor request journal data.
  permissions.splice(permissions.indexOf('journal'), 1);
  const requestStart = requests.length;
  await page.reload();
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await overview.waitFor();
  await page.waitForFunction(() => document.querySelector('#overview-panel')?.getAttribute('aria-busy') === 'false');
  assert.equal(await overview.locator('.editorial-current, .editorial-recent').count(), 0);
  assert.equal(await overview.locator('.editorial-metric').count(), 3);
  assert.equal(requests.slice(requestStart).some(path => path.startsWith('/content/')), false);
  assert.deepEqual(errors, []);
  console.log('PASS: editorial workbench, published snapshot preview/focus return, draft retention, task queue, real/unknown/zero metrics, refresh/loading/retry, journal and audit navigation, 5 responsive widths and reduced motion.');
} finally {
  await browser?.close();
  await server.close();
}
