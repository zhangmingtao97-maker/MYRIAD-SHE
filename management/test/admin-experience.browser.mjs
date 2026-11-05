import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

// Use an isolated session and intercept every API call; no production records are touched.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, plugins: [vue()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(root, '..')] } } });
await server.listen();
let browser;
try {
  const { createDefaultDiscussionContent } = await server.ssrLoadModule('/src/discussion-content.ts');
  const discussion = createDefaultDiscussionContent();
  const timestamp = '2026-11-04T04:30:00Z';
  const permissions = ['journal', 'practice', 'pages', 'media', 'contributions', 'discussion-reports', 'observations', 'privacy', 'members', 'audit', 'life-cards', 'life-card-views', 'settings'];
  const copy = (richText) => ({ richText, fontSize: 14, color: '#5c493c' });
  const copies = (keys) => Object.fromEntries(keys.split(' ').map((key) => [key, copy('让日常成为新的开始')]));
  const practice = {
    editVersion: 1, title: '实践', titleRichText: '实践', titleFontSize: 12, titleColor: '#8b6b58',
    intro: '从此刻开始，和日常相遇', introRichText: '从此刻开始，和日常相遇', introFontSize: 28, introColor: '#40362f',
    metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58', metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58',
    observationCopy: copies('metaLeft metaRight introTitle introDescription realityContext realityTitle realityDescription realityAction seasonContext seasonTitle seasonDescription seasonGuide seasonAction privacyLabel privacyCopy'),
    sharedPracticeCopy: copies('topbarTitle metaLeft metaRight heroTitle heroIntro onlineNumber onlineContext onlineIssueLabel onlineIssueTheme onlineQuestion onlineCopy onlineAction offlineNumber offlineContext offlineTitle offlineCopy noticeLabel noticeCode rule1Number rule1Title rule1Copy rule2Number rule2Title rule2Copy rule3Number rule3Title rule3Copy rule4Number rule4Title rule4Copy nextAction'),
    entries: ['observation', 'shared-practice', 'daily-goods'].map((key, index) => ({ key, target: key, title: ['此刻观察', '共同实践', '日常之物'][index], description: '从生活的小事开始，寻找自己的节奏。', contextRichText: '一份日常练习', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: ['此刻观察', '共同实践', '日常之物'][index], titleFontSize: 22, titleColor: '#40362f', descriptionRichText: '从生活的小事开始，寻找自己的节奏。', descriptionFontSize: 14, descriptionColor: '#5c493c', enabled: true })),
  };
  const daily = { editVersion: 1, brandName: 'MYRIAD SHE', brandSubtitle: '让日常发生', bagLabel: '购物袋', bagCount: '0', eyebrow: 'DAILY OBJECTS', title: '日常之物', intro: '留在身边的简单物件', previewNote: '预览草稿', supportLabel: '联系支持', products: [{ id: 'notebook', name: '随身记录本', english: 'EVERYDAY NOTES', image: '', price: '68', priceLabel: 'CNY', description: '把今天值得记下的小事留在纸上。', optionDetails: '米白 / A5', dailyUseDetails: '适合日常书写', deliveryDetails: '三个工作日内发出', enabled: true }] };
  const mine = { editVersion: 1, ...Object.fromEntries('title intro observationHeading emptyTitle emptyIntro startButton discussionHeading discussionCount discussionEmptyAction discussionIntro practiceHeading practiceCount practiceEmptyTitle practiceIntro privacyHeading privacyAction'.split(' ').map((key) => [key, '我的日常与观察'])) };
  const about = { editVersion: 1, publishedVersion: 1, publishedAt: timestamp, brandIntro: 'MYRIAD SHE 记录真实的女性经验。', contentSources: '来自日常生活的记录与观察。', contactInfo: '欢迎通过小程序联系我们。' };
  const legal = { editVersion: 1, title: copy('用户协议'), intro: copy('请阅读并了解我们如何提供服务。'), body: copy('<h2>一、服务说明</h2><p>感谢你使用 MYRIAD SHE。我们尊重每一位用户的表达与隐私。</p>'), version: '1.0', effectiveDate: '2026-11-01', updatedDate: '', updateNotes: '', publishedVersion: 1, publishedAt: timestamp, draft: false };
  const issue = {
    id: 'issue-1', code: 'issue-03', label: '第三期', month: '2026 年 11 月', theme: '和自己的节奏相遇', question: '最近，你在哪个瞬间感到松弛？', status: 'draft', editVersion: 1,
    microVoiceTitle: null, microVoiceDuration: null, coverObjectKey: null, microVoiceObjectKey: null, homeMetaRichText: '把目光放回日常', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实', homeCoverCaptionRight: '本期封面', updatedAt: timestamp, publishedVersion: 0,
    ...Object.fromEntries('Theme Question Label Month Code MicroVoiceTitle MicroVoiceDuration HomeMetaRichText HomeMetaFontSize HomeMetaColor HomeCoverCaptionLeft HomeCoverCaptionRight'.split(' ').map((key) => [`published${key}`, null])),
    draftContent: { discussion, sections: [
      { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: '第三期', month: '2026 年 11 月' },
      { id: 'cover-story', type: 'coverStory', order: 1, enabled: true, title: '和自己的节奏相遇', titleFontSize: 60, titleColor: '#59483d', body: '把目光放回日常', bodyFontSize: 24, bodyColor: '#40362f', imageObjectKey: '', altText: '', captionLeft: '人物纪实', captionRight: '本期封面', eyebrow: '本期主题', byline: 'MYRIAD SHE' },
      { id: 'story', type: 'story', order: 2, enabled: true, title: '给生活留一段空白', body: '她开始在清晨散步，也学会慢慢听见自己的声音。', author: 'MYRIAD SHE', imageObjectKey: '' },
      { id: 'audio', type: 'audio', order: 3, enabled: false, title: '第一个普通早晨', tracks: [], audioObjectKey: '', videoObjectKey: '' },
      { id: 'archive', type: 'archive', order: 4, enabled: true, title: '策展档案', entryLabel: 'ISSUE 02', entryTitle: '留住没有答案的时刻' },
    ] },
  };
  const member = { id: 'member-1', nickname: '林间来信', createdAt: timestamp, status: 'active', birthMonth: 5, birthDay: 18, observationCount: 12, phoneMasked: '138****1234', address: { provinceName: '上海市', cityName: '上海市', countyName: '徐汇区', detailInfo: '测试地址' } };
  const cards = Array.from({ length: 8 }, (_, i) => ({ month: 1, day: i + 1, suit: 'heart', rank: String(i + 2), title: ['温柔的力量', '倾听自己的节奏', '从日常开始'][i % 3], summary: '在熟悉的生活里，找到属于自己的力量。', prompt: '今天，有什么事情值得你慢下来？', theme: '自我观察', note: '保持开放，接纳不同的可能。', sourceNote: '用于日常自我观察的提示。' }));
  const employees = [{ id: 'employee-1', username: 'editor', displayName: '内容编辑', role: 'content_editor', status: 'active', wecomUserId: 'editor-test', modulePermissions: null, createdAt: timestamp, lastLoginAt: timestamp }, { id: 'employee-2', username: 'support', displayName: '会员支持', role: 'support_readonly', status: 'disabled', modulePermissions: null, createdAt: timestamp, lastLoginAt: null }];
  const pageData = (items = [], total = items.length) => ({ items, total, limit: 50, offset: 0 });
  const unknown = [];
  const errors = [];
  const requests = [];
  let failDaily = false;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  async function prepare(page, role = 'super_admin', modules = permissions) {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ role }) => {
      localStorage.setItem('myriad_she_admin_token', `test.${btoa(JSON.stringify({ role, name: 'Test Editor' }))}.test`);
      localStorage.setItem('myriad_she_admin_expires_at', String(Date.now() + 3600000));
    }, { role });
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^.*\/api/, '');
      requests.push({ path, method: route.request().method(), query: url.search });
      const send = (json) => route.fulfill({ json });
      if (path === '/admin/me') return send({ id: 'test-admin', username: 'editor', displayName: 'Test Editor', role, permissions: modules });
      if (path === '/content/home') return send({ issue: null, question: '', coverUrl: '', sections: [], microVoice: { title: '', duration: '', url: '', enabled: false } });
      if (path === '/content/issues') return send([issue]);
      if (path === '/content/issues/summary') return send({ draftCount: 1, publishedCount: 0, archivedCount: 0, publishedCode: null, publishedUpdatedAt: null });
      if (path === '/content/practice/manage') return send(practice);
      if (path === '/content/daily-objects/manage') return failDaily ? route.fulfill({ status: 500, json: { message: '测试：读取失败' } }) : send(daily);
      if (path === '/content/mine/manage') return send(mine);
      if (path === '/content/about/manage') return send(about);
      if (path === '/content/discussion/manage') return send({ draftContent: discussion, editVersion: 1, publishedVersion: 0, publishedAt: null, issueStatus: 'draft' });
      if (path === '/content/practice-copy/manage') return send({ copy: { onlineParagraphs: ['和自己的节奏相遇'], rules: [] }, source: 'default' });
      if (/^\/content\/legal-documents\/[^/]+\/manage$/.test(path)) return send({ ...legal, title: copy(path.includes('privacy-policy') ? '隐私政策' : '用户协议') });
      if (path.startsWith('/content/privacy-revisions/')) return send(path.endsWith('about-page') ? [{ version: 1, publishedAt: timestamp, publishedBy: '测试编辑', content: about }] : [{ version: 1, publishedAt: timestamp, publishedBy: '测试编辑', content: legal }]);
      if (path === '/admin/observations/lifecycle') return send({ retentionDays: 90, draftCount: 12, savedCount: 328, realityCount: 200, seasonCount: 140, wellFormedEnvelopeCount: 340, legacyPlaintextCount: 0, invalidEnvelopeCount: 0, staleDraftCount: 2, oldestDraftAt: timestamp });
      if (path === '/admin/observations') return send(pageData());
      if (path === '/admin/privacy-requests') return send({ ...pageData(), summary: { pendingCount: 3, duePendingCount: 1, leasedCount: 0, expiredLeaseCount: 0, failedCount: 0, completedCount: 12, cancelledCount: 1, oldestPendingAt: timestamp, nextDueAt: timestamp } });
      if (path === '/admin/audit-logs') return send({ rows: Array.from({ length: 4 }, (_, i) => ({ id: `audit-${i}`, actorType: 'admin', actorId: 'test-admin', action: 'admin.auth.login_succeeded', resourceType: 'admin_login', resourceId: null, createdAt: timestamp })), total: 4, limit: 50, offset: 0 });
      if (path === '/admin/discussion-contributions') return send(pageData());
      if (path === '/admin/discussion-reports') return send({ ...pageData(), summary: { pending: 0, handled: 0, dismissed: 0 } });
      if (path === '/admin/users') return send(pageData([member]));
      if (path === '/admin/users/member-1') return send({ ...member, openId: 'test-open-id', maskedUnionId: 'test-union-id', privacyRequests: [] });
      if (path === '/admin/system-settings') return send({ store_enabled: { value: true }, maintenance_notice: { value: '' }, support_contact: { value: '联系小程序客服' } });
      if (path === '/admin/employees') return send(employees);
      if (path === '/content/life-cards/manage') return send({ items: cards });
      if (path === '/content/life-card-views/manage') return send({ items: [{ id: 'view-1', nickname: '林间来信', month: 1, day: 1, suit: 'heart', rank: '2', viewedAt: timestamp }], total: 1 });
      if (path === '/content/media/orphans') return send({ items: [], continuationToken: null, hasMore: false, graceHours: 24 });
      if (path === '/content/media/audio') return send({ items: [], continuationToken: null, hasMore: false });
      unknown.push(`${route.request().method()} ${path}`);
      return route.fulfill({ status: 404, json: { message: `Unexpected fixture request: ${path}` } });
    });
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await prepare(page);
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const output = resolve(root, '.test-artifacts');
  await mkdir(output, { recursive: true });
  await page.goto(url);
  await page.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  async function settle() {
    await page.waitForFunction(() => !document.querySelector('.dashboard-shell[aria-busy="true"]'));
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
  }
  async function noOverflow(label) {
    const overflow = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth, offenders: Array.from(document.querySelectorAll('body *')).filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 8).map((el) => `${el.tagName}.${el.className}`) }));
    if (overflow.actual > overflow.width) await page.screenshot({ path: resolve(output, 'admin-overflow.png'), fullPage: true });
    assert.ok(overflow.actual <= overflow.width, `${label}: ${JSON.stringify(overflow)}`);
  }
  async function navigate(label) {
    await page.keyboard.press('Control+k');
    const menu = page.getByRole('dialog', { name: '快速前往' });
    await menu.waitFor();
    await menu.getByRole('combobox').fill(label);
    await menu.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click();
    await menu.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.topbar h1').innerText(), label);
    await settle();
    assert.equal(await page.locator('.topbar h1').evaluate((el) => el === document.activeElement), true, `focus after navigating ${label}: ${await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 600))}`);
  }
  const trigger = page.getByRole('button', { name: /快捷导航/ });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: '快速前往' });
  assert.equal(await menu.getByRole('option').count(), 29);
  assert.equal(await menu.getByRole('combobox').evaluate((el) => el === document.activeElement), true);
  await menu.getByRole('combobox').fill('no-such-page');
  await menu.getByText('没有找到相关页面').waitFor();
  await menu.getByRole('button', { name: '清空搜索' }).click();
  await page.keyboard.press('ArrowDown');
  assert.equal(await menu.getByRole('option').nth(1).getAttribute('aria-selected'), 'true');
  await page.screenshot({ path: resolve(output, 'admin-quick-navigation.png') });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');

  const destinations = ['实践页面', '实践目录', '此刻观察', '共同实践', '日常之物', '期刊列表', '首页策展', '人物故事', '微声音', '本期讨论', '往期策展', '媒体库', '我的页面设置', '关于 MYRIAD SHE', '关于发布历史', '隐私政策', '用户协议', '历史版本', '会员列表', '用户经历审核', '用户举报', '观察记录管理', '隐私申请', '审计日志', '系统设置', '生命牌文案', '生命牌查看', '员工与权限'];
  for (const label of destinations) {
    await navigate(label);
    await noOverflow(`desktop ${label}`);
    if (['首页策展', '实践页面', '会员列表', '系统设置', '员工与权限'].includes(label)) await page.screenshot({ path: resolve(output, `admin-${({ 首页策展: 'editor', 实践页面: 'practice', 会员列表: 'members', 系统设置: 'settings', 员工与权限: 'employees' })[label]}-desktop.png`), fullPage: true });
  }
  // Existing dialogs keep keyboard focus inside and restore the opening control.
  const create = page.getByRole('button', { name: '创建员工账号', exact: true });
  await create.click();
  const staffDialog = page.getByRole('dialog', { name: '创建员工账号' });
  await staffDialog.waitFor();
  await staffDialog.getByRole('button', { name: '取消', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await staffDialog.getByRole('button', { name: '关闭创建员工账号' }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await staffDialog.getByRole('button', { name: '取消', exact: true }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Control+k');
  assert.equal(await menu.count(), 0, 'do not stack command menu over an editor');
  await page.keyboard.press('Escape');
  assert.equal(await create.evaluate((el) => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await navigate('会员列表');
  const detail = page.locator('#member-directory').getByRole('button', { name: '详情', exact: true });
  await detail.click();
  await page.getByRole('dialog', { name: '会员详情' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await detail.evaluate((el) => el === document.activeElement), true);
  await navigate('历史版本');
  await page.locator('.legal-history').getByRole('button', { name: '查看旧版正文', exact: true }).first().click();
  const legalDialog = page.locator('.legal-history-modal');
  await legalDialog.waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await legalDialog.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await legalDialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'history preview must release body scroll');
  // Refresh prompts preserve edits on cancel and discard only after explicit confirmation.
  async function refreshChoice(accept) {
    const dialog = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: '刷新页面', exact: true }).click();
    const prompt = await dialog;
    assert.equal(prompt.type(), 'confirm');
    await (accept ? prompt.accept() : prompt.dismiss());
    await click;
    await page.waitForFunction(() => !document.querySelector('.admin-page-refresh[aria-busy="true"]'));
  }
  await navigate('系统设置');
  const notice = page.getByLabel('维护公告', { exact: true });
  await notice.fill('尚未保存的维护公告');
  await refreshChoice(false);
  assert.equal(await notice.inputValue(), '尚未保存的维护公告');
  await refreshChoice(true);
  assert.equal(await notice.inputValue(), '');
  await navigate('生命牌文案');
  const cardTitle = page.locator('.life-card-form').getByLabel('标题', { exact: true });
  await cardTitle.fill('测试草稿标题');
  assert.equal(await page.locator('.life-card-title').first().innerText(), cards[0].title, 'draft must not mutate the list');
  await refreshChoice(false);
  assert.equal(await cardTitle.inputValue(), '测试草稿标题');
  await refreshChoice(true);
  assert.equal(await cardTitle.inputValue(), cards[0].title);
  await navigate('此刻观察');
  const observationInput = page.locator('#practice-observation-content textarea').first();
  const observationOriginal = await observationInput.inputValue();
  await observationInput.fill('保留观察文案草稿');
  await navigate('会员列表');
  await navigate('此刻观察');
  assert.equal(await observationInput.inputValue(), '保留观察文案草稿');
  await refreshChoice(false);
  assert.equal(await observationInput.inputValue(), '保留观察文案草稿');
  await refreshChoice(true);
  assert.equal(await observationInput.inputValue(), observationOriginal);
  await navigate('日常之物');
  const dailyInput = page.locator('#practice-daily-objects-content').getByLabel('页面标题', { exact: true });
  await dailyInput.fill('保留物品草稿');
  failDaily = true;
  await refreshChoice(true);
  assert.equal(await dailyInput.inputValue(), '保留物品草稿', 'failed reload must retain local draft');
  await page.getByRole('alertdialog').getByRole('button', { name: /知道了|关闭|确认/ }).click();
  failDaily = false;
  await refreshChoice(true);
  assert.equal(await dailyInput.inputValue(), daily.title);
  await page.getByRole('tab', { name: '首页入口', exact: true }).click();
  const dailyEntry = page.locator('#practice-daily-objects-content .practice-entry-field input').first();
  const entryOriginal = await dailyEntry.inputValue();
  await dailyEntry.fill('保留首页入口草稿');
  await refreshChoice(false);
  assert.equal(await dailyEntry.inputValue(), '保留首页入口草稿');
  await refreshChoice(true);
  assert.equal(await dailyEntry.inputValue(), entryOriginal);
  await page.getByRole('tab', { name: '详情页', exact: true }).click();

  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of destinations) {
      await navigate(label);
      await noOverflow(`${width}px ${label}`);
      if (label === '实践页面') assert.equal(await page.locator('#practice-content .practice-savebar').evaluate((el) => getComputedStyle(el).position), 'static', 'stacked editor save bar must not cover fields');
      if (width === 375 && ['会员列表', '实践页面', '员工与权限', '关于 MYRIAD SHE', '生命牌文案'].includes(label)) await page.screenshot({ path: resolve(output, `admin-${({ 会员列表: 'members', 实践页面: 'practice', 员工与权限: 'employees', '关于 MYRIAD SHE': 'about', 生命牌文案: 'life-cards' })[label]}-mobile.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '收起侧边导航', exact: true }).click();
  await page.reload();
  await page.locator('.dashboard-layout.nav-collapsed').waitFor();
  await page.getByRole('button', { name: '展开侧边导航', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await navigate('会员列表');
  assert.equal(await page.locator('#member-directory').evaluate((el) => getComputedStyle(el).animationName), 'none');
  await page.keyboard.press('Control+k');
  assert.equal(await menu.evaluate((el) => getComputedStyle(el).animationName), 'none');
  await page.keyboard.press('Escape');

  const restricted = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prepare(restricted, 'support_readonly', ['members', 'settings']);
  await restricted.goto(url);
  await restricted.locator('#member-directory').waitFor();
  await restricted.keyboard.press('Control+k');
  const limitedMenu = restricted.getByRole('dialog', { name: '快速前往' });
  assert.equal(await limitedMenu.getByRole('option').count(), 2);
  await limitedMenu.getByRole('combobox').fill('员工');
  assert.equal(await limitedMenu.getByRole('option').count(), 0);
  await restricted.close();
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  assert.equal(requests.every((request) => request.method === 'GET'), true, 'navigation and draft tests must not persist data');
  console.log('PASS: 29 authorized destinations, 3 viewport sizes, editor drafts, refresh confirmation/failure, dialogs/focus/scroll, command search/keyboard/permissions, sidebar persistence and reduced motion.');
} finally {
  await browser?.close();
  await server.close();
}
