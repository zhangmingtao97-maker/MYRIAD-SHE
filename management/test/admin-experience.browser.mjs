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
  const auditFixtures = [
    { id: 'audit-0', actorType: 'admin', actorId: 'admin-001', action: 'admin.auth.login_succeeded', resourceType: 'admin_login', resourceId: null, metadata: { ip: '192.168.1.10' }, createdAt: '2026-11-04T04:30:00Z' },
    { id: 'audit-1', actorType: 'user', actorId: 'user-001', action: 'observation.saved', resourceType: 'observation', resourceId: 'observation-001', metadata: { method: 'reality' }, createdAt: '2026-11-04T03:20:00Z' },
    { id: 'audit-2', actorType: 'admin', actorId: 'admin-001', action: 'discussion_restriction.created', resourceType: 'discussion_user_restriction', resourceId: 'restriction-001', metadata: { userId: 'user-002', reason: '测试原因' }, createdAt: '2026-11-04T02:10:00Z' },
    { id: 'audit-3', actorType: 'user', actorId: 'user-003', action: 'privacy.deletion.requested', resourceType: 'privacy_request', resourceId: 'privacy-001', metadata: null, createdAt: '2026-11-04T01:00:00Z' },
  ];
  const permissions = ['journal', 'practice', 'pages', 'media', 'contributions', 'discussion-reports', 'observations', 'privacy', 'members', 'audit', 'life-cards', 'life-card-views', 'settings'];
  const copy = (richText) => ({ richText, fontSize: 14, color: '#5c493c' });
  const copies = (keys) => Object.fromEntries(keys.split(' ').map((key) => [key, copy('让日常成为新的开始')]));
  const practice = {
    editVersion: 1, title: '实践', titleRichText: '实践', titleFontSize: 12, titleColor: '#8b6b58',
    intro: '从此刻开始，和日常相遇', introRichText: '从此刻开始，和日常相遇', introFontSize: 32, introColor: '#40362f',
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
    id: 'issue-1', code: 'issue-03', label: '第三期', labelRichText: '', month: '2026 年 11 月', monthRichText: '', theme: '和自己的节奏相遇', themeRichText: '', question: '最近，你在哪个瞬间感到松弛？', questionRichText: '', status: 'draft', editVersion: 1,
    microVoiceTitle: null, microVoiceDuration: null, coverObjectKey: null, microVoiceObjectKey: null, homeBackgroundObjectKey: null, homeMetaRichText: '把目光放回日常', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '本期封面', homeCoverCaptionRightRichText: '', updatedAt: timestamp, publishedVersion: 0,
    ...Object.fromEntries('Theme Question Label Month Code LabelRichText MonthRichText ThemeRichText QuestionRichText MicroVoiceTitle MicroVoiceDuration HomeMetaRichText HomeMetaFontSize HomeMetaColor HomeCoverCaptionLeft HomeCoverCaptionLeftRichText HomeCoverCaptionRight HomeCoverCaptionRightRichText'.split(' ').map((key) => [`published${key}`, null])),
    draftContent: { discussion, sections: [
      { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: '第三期', month: '2026 年 11 月' },
      { id: 'cover-story', type: 'coverStory', order: 1, enabled: true, title: '和自己的节奏相遇', titleFontSize: 60, titleColor: '#59483d', body: '把目光放回日常', bodyFontSize: 24, bodyColor: '#40362f', imageObjectKey: '', altText: '', captionLeft: '人物纪实', captionRight: '本期封面', eyebrow: '本期主题', byline: 'MYRIAD SHE' },
      { id: 'story', type: 'story', order: 2, enabled: true, title: '给生活留一段空白', body: '她开始在清晨散步，也学会慢慢听见自己的声音。', author: 'MYRIAD SHE', imageObjectKey: '' },
      { id: 'audio', type: 'audio', order: 3, enabled: true, title: '第一个普通早晨', tracks: [{ id: 'voice-01', title: '第一个普通早晨', duration: '02:12', mediaType: 'audio', audioObjectKey: '', videoObjectKey: '', detailTitle: '第一个普通早晨', description: '', quote: '', subtitle: '', transcript: '', actions: [{ id: 'action-share', label: '分享给朋友 ↗', kind: 'share' }] }], audioObjectKey: '', videoObjectKey: '', actions: [{ id: 'action-share', label: '分享给朋友 ↗', kind: 'share' }], linkType: 'web', linkLabel: '公众号 →', linkUrl: 'https://mp.weixin.qq.com/s/example' },
      { id: 'archive', type: 'archive', order: 4, enabled: true, title: '策展档案', entryLabel: 'ISSUE 02', entryTitle: '留住没有答案的时刻' },
      { id: 'question', type: 'question', order: 5, enabled: true, eyebrow: '', eyebrowRichText: '', title: '最近，你在哪个瞬间感到松弛？', body: '从一件日常的小事说起。' },
    ] },
  };
  const member = { id: 'member-1', nickname: '林间来信', createdAt: timestamp, status: 'active', birthMonth: 5, birthDay: 18, observationCount: 12, phoneMasked: '138****1234', address: { provinceName: '上海市', cityName: '上海市', countyName: '徐汇区', detailInfo: '测试地址' } };
  const cards = Array.from({ length: 8 }, (_, i) => ({ month: 1, day: i + 1, suit: 'heart', rank: String(i + 2), title: ['温柔的力量', '倾听自己的节奏', '从日常开始'][i % 3], summary: '在熟悉的生活里，找到属于自己的力量。', prompt: '今天，有什么事情值得你慢下来？', theme: '自我观察', note: '保持开放，接纳不同的可能。', sourceNote: '用于日常自我观察的提示。' }));
  const employees = [{ id: 'employee-1', username: 'editor', displayName: '内容编辑', role: 'content_editor', status: 'active', wecomUserId: 'editor-test', modulePermissions: null, createdAt: timestamp, lastLoginAt: timestamp }, { id: 'employee-2', username: 'support', displayName: '会员支持', role: 'support_readonly', status: 'disabled', modulePermissions: null, createdAt: timestamp, lastLoginAt: null }];
  const moduleStates = {
    modules: [
      { moduleId: 'content', label: '内容与期刊', category: '内容', state: 'online', previousState: null, reason: null, updatedBy: null, updatedAt: timestamp, lastActivityAt: null, events24h: 0, legalNextStates: ['maintenance', 'degraded', 'disabled'] },
      { moduleId: 'community', label: '社区与讨论', category: '用户', state: 'maintenance', previousState: 'online', reason: '计划维护', updatedBy: 'admin:test', updatedAt: timestamp, lastActivityAt: timestamp, events24h: 1, legalNextStates: ['online', 'disabled'] },
      { moduleId: 'shop', label: '日常之物', category: '业务', state: 'degraded', previousState: 'online', reason: '支付能力受限', updatedBy: 'admin:test', updatedAt: timestamp, lastActivityAt: timestamp, events24h: 1, legalNextStates: ['online', 'maintenance', 'disabled'] },
      { moduleId: 'database', label: '数据库', category: '基础设施', state: 'disabled', previousState: 'maintenance', reason: '等待迁移完成', updatedBy: 'admin:test', updatedAt: timestamp, lastActivityAt: timestamp, events24h: 1, legalNextStates: ['maintenance'] },
    ],
    events: [
      { id: 'event-1', moduleId: 'community', previousState: 'online', nextState: 'maintenance', reason: '计划维护', actorId: 'admin:test', metadata: { ticket: 'OPS-1' }, createdAt: timestamp },
    ],
    summary: { online: 1, maintenance: 1, degraded: 1, disabled: 1 },
    generatedAt: timestamp,
  };
  const notificationItems = [
    { id: '00000000-0000-4000-8000-000000000101', eventType: 'observation.saved', title: '收到新的观察记录', content: '有用户完成并保存了一条观察记录。', resourceType: 'observation', resourceId: '00000000-0000-4000-8000-000000000201', createdAt: '2026-11-04T04:30:00Z', isRead: false },
    { id: '00000000-0000-4000-8000-000000000102', eventType: 'user.created', title: '有新用户加入', content: '一位用户已完成首次登录。', resourceType: 'user', resourceId: '00000000-0000-4000-8000-000000000202', createdAt: '2026-11-03T04:30:00Z', isRead: true },
  ];
  let fixtureUnreadCount = 100;
  let fixtureFirstRead = false;
  let fixtureAllRead = false;
  const pageData = (items = [], total = items.length) => ({ items, total, limit: 50, offset: 0 });
  const discussionContributionSummary = { pending: 2, published: 3, hidden: 1, rejected: 1 };
  const discussionContributionItems = [
    'pending', 'pending', 'published', 'published', 'published', 'hidden', 'rejected',
  ].map((publicationStatus, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    revision: 1,
    issueCode: 'issue-03',
    issueLabel: '第三期',
    threadId: index % 2 ? '00000000-0000-4000-8000-000000000101' : '',
    threadAuthor: index % 2 ? '原楼作者' : null,
    publicationStatus,
    userId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
    nickname: `读者${index + 1}`,
    publishedAt: ['published', 'hidden'].includes(publicationStatus) ? timestamp : null,
    featuredAt: index === 2 ? timestamp : null,
    featuredOrder: index === 2 ? 1 : 0,
    bodyPreview: `测试讨论内容 ${index + 1}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const discussionRestrictionSummary = { active: 1, scheduled: 1, expired: 1, revoked: 1 };
  const discussionRestrictionItems = ['active', 'scheduled', 'expired', 'revoked'].map((effectiveStatus, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 201).padStart(12, '0')}`,
    userId: `00000000-0000-4000-8000-${String(index + 301).padStart(12, '0')}`,
    nickname: `受限读者${index + 1}`,
    reason: index % 2 ? '多次发布与主题无关的内容' : '测试限制原因',
    startsAt: timestamp,
    endsAt: effectiveStatus === 'active' ? null : timestamp,
    createdBy: 'test-admin',
    createdAt: timestamp,
    revokedAt: effectiveStatus === 'revoked' ? timestamp : null,
    revokedBy: effectiveStatus === 'revoked' ? 'test-admin' : null,
    effectiveStatus,
  }));
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
      let body = null;
      try { body = route.request().postDataJSON(); } catch {}
      requests.push({ path, method: route.request().method(), query: url.search, body });
      const send = (json) => route.fulfill({ json });
      if (path === '/admin/me') return send({ id: 'test-admin', username: 'editor', displayName: 'Test Editor', role, permissions: modules });
      if (path === '/admin/notifications/unread-count') return send({ unreadCount: fixtureUnreadCount });
      if (path === '/admin/notifications') {
        return send({
          items: notificationItems.map((item, index) => ({ ...item, isRead: item.isRead || fixtureAllRead || (index === 0 && fixtureFirstRead) })),
          total: 100,
          unreadCount: fixtureUnreadCount,
          limit: 30,
          offset: 0,
        });
      }
      if (path === '/admin/notifications/read-all') {
        fixtureUnreadCount = 0;
        fixtureAllRead = true;
        return send({ read: true, updated: 100, unreadCount: 0 });
      }
      if (/^\/admin\/notifications\/[0-9a-f-]{36}\/read$/.test(path)) {
        fixtureUnreadCount = Math.max(0, fixtureUnreadCount - 1);
        fixtureFirstRead = true;
        return send({ read: true, unreadCount: fixtureUnreadCount });
      }
      if (path === '/content/home') return send({ issue: null, question: '', coverUrl: '', sections: [], microVoice: { title: '', duration: '', url: '', enabled: false } });
      if (path === '/content/issues/issue-1' && route.request().method() === 'PATCH') {
        Object.assign(issue, { draftContent: route.request().postDataJSON().draftContent, editVersion: issue.editVersion + 1 });
        return send(issue);
      }
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
      if (path === '/admin/audit-logs') {
        const actorType = url.searchParams.get('actorType') || '';
        const action = url.searchParams.get('action') || '';
        const rows = auditFixtures.filter((entry) => (!actorType || entry.actorType === actorType) && (!action || entry.action === action));
        return send({ rows, total: rows.length, limit: 50, offset: 0 });
      }
      if (path === '/admin/discussion-contributions') {
        const publicationStatus = url.searchParams.get('publicationStatus') || '';
        const limit = Number(url.searchParams.get('limit')) || 50;
        const offset = Number(url.searchParams.get('offset')) || 0;
        const items = discussionContributionItems.filter((item) => !publicationStatus || item.publicationStatus === publicationStatus);
        return send({ items: items.slice(offset, offset + limit), total: items.length, limit, offset, summary: discussionContributionSummary });
      }
      if (path === '/admin/discussion-restrictions') {
        const status = url.searchParams.get('status') || '';
        const limit = Number(url.searchParams.get('limit')) || 50;
        const offset = Number(url.searchParams.get('offset')) || 0;
        const items = discussionRestrictionItems.filter((item) => !status || item.effectiveStatus === status);
        return send({ items: items.slice(offset, offset + limit), total: items.length, limit, offset, summary: discussionRestrictionSummary });
      }
      if (path === '/admin/discussion-reports') return send({ ...pageData(), summary: { pending: 0, handled: 0, dismissed: 0 } });
      if (path === '/admin/users') return send(pageData([member]));
      if (path === '/admin/users/member-1') return send({ ...member, openId: 'test-open-id', maskedUnionId: 'test-union-id', privacyRequests: [] });
      if (path === '/admin/system-settings') return send({ store_enabled: { value: true }, maintenance_notice: { value: '' }, support_contact: { value: '联系小程序客服' } });
      if (path === '/admin/module-states') return send(moduleStates);
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
  const notificationTrigger = page.locator('.admin-notification-trigger');
  const notificationBadge = notificationTrigger.locator('.admin-notification-badge');
  await notificationBadge.filter({ hasText: '99+' }).waitFor();
  const notificationBox = await notificationTrigger.boundingBox();
  const avatarBox = await page.locator('.account-avatar-button').boundingBox();
  assert.ok(notificationBox && avatarBox && notificationBox.x < avatarBox.x, 'notification button should sit left of the account avatar');
  await notificationTrigger.click();
  const notificationPanel = page.locator('.admin-notification-panel');
  await notificationPanel.waitFor();
  await notificationPanel.locator('.admin-notification-item').first().waitFor();
  assert.equal(await notificationPanel.locator('.admin-notification-item').count(), 2);
  assert.equal(await notificationPanel.locator('.admin-notification-item svg').count(), 0, 'notification items should not use decorative arrows');
  const firstNotification = notificationPanel.locator('.admin-notification-item').first();
  await firstNotification.click();
  await notificationBadge.filter({ hasText: /^99$/ }).waitFor();
  assert.equal(await firstNotification.evaluate((el) => el.classList.contains('is-read')), true);
  await notificationPanel.getByRole('button', { name: '全部已读', exact: true }).click();
  await notificationBadge.waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await notificationPanel.waitFor({ state: 'detached' });
  await notificationTrigger.click();
  await notificationPanel.waitFor();
  await page.locator('.admin-notification-backdrop').click({ position: { x: 8, y: 8 } });
  await notificationPanel.waitFor({ state: 'detached' });
  const workspaceAccount = page.getByRole('button', { name: /管理工作空间/ });
  await workspaceAccount.click();
  const workspaceMenu = page.getByRole('menu', { name: '管理工作空间账号菜单' });
  await workspaceMenu.waitFor();
  assert.equal(await workspaceAccount.getAttribute('aria-expanded'), 'true');
  await page.screenshot({ path: resolve(output, 'admin-sidebar-account-menu.png') });
  await workspaceMenu.getByRole('menuitem', { name: '个人资料' }).click();
  const profileDialog = page.getByRole('dialog', { name: '个人资料' });
  await profileDialog.waitFor();
  await profileDialog.getByRole('button', { name: '关闭个人资料' }).click();
  await profileDialog.waitFor({ state: 'detached' });
  const trigger = page.getByRole('button', { name: /快捷导航/ });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: '快速前往' });
  assert.equal(await menu.getByRole('option').count(), 30);
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

  const destinations = ['实践页面', '实践目录', '此刻观察', '共同实践', '日常之物', '期刊列表', '首页策展', '人物故事', '微声音', '本期讨论', '往期策展', '媒体库', '我的页面设置', '关于 MYRIAD SHE', '关于发布历史', '隐私政策', '用户协议', '历史版本', '会员列表', '讨论管理', '用户举报', '观察记录管理', '隐私申请', '操作记录', '系统设置', '模块状态机', '生命牌文案', '生命牌查看', '员工与权限'];
  for (const label of destinations) {
    await navigate(label);
    await noOverflow(`desktop ${label}`);
    if (['首页策展', '实践页面', '会员列表', '操作记录', '系统设置', '模块状态机', '员工与权限'].includes(label)) await page.screenshot({ path: resolve(output, `admin-${({ 首页策展: 'editor', 实践页面: 'practice', 会员列表: 'members', 操作记录: 'audit', 系统设置: 'settings', 模块状态机: 'module-states', 员工与权限: 'employees' })[label]}-desktop.png`), fullPage: true });
  }
  await navigate('模块状态机');
  const stateMachinePage = page.locator('#module-state-machine');
  await stateMachinePage.locator('.module-state-table tbody tr').first().waitFor();
  assert.equal(await stateMachinePage.locator('.module-state-table tbody tr').count(), 4, 'module state table should render every module');
  const maintenanceFilter = stateMachinePage.getByRole('button', { name: /^维护中 1 个/ });
  await maintenanceFilter.click();
  assert.equal(await maintenanceFilter.getAttribute('aria-pressed'), 'true');
  assert.equal(await stateMachinePage.locator('.module-state-table tbody tr').count(), 1, 'summary card should filter the table by state');
  assert.match(await stateMachinePage.locator('#module-list-title').innerText(), /维护中\s*1 个/);
  await maintenanceFilter.click();
  assert.equal(await stateMachinePage.locator('.module-state-table tbody tr').count(), 4, 'clicking the active summary card should clear the filter');
  assert.equal(await stateMachinePage.getByRole('button', { name: '调整状态', exact: true }).count(), 4, 'super admins should see transitions allowed by the backend');
  await stateMachinePage.getByRole('button', { name: '调整状态', exact: true }).first().click();
  const transitionDialog = page.getByRole('dialog', { name: '调整模块状态' });
  await transitionDialog.waitFor();
  await transitionDialog.getByLabel('变更原因').fill('   ');
  await transitionDialog.getByRole('button', { name: '确认调整', exact: true }).click();
  await transitionDialog.getByRole('alert').filter({ hasText: '请填写状态变更原因。' }).waitFor();
  await page.keyboard.press('Escape');
  await transitionDialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'closing the transition dialog should restore body scrolling');
  await page.screenshot({ path: resolve(output, 'admin-module-states-desktop.png'), fullPage: true });
  await navigate('操作记录');
  const auditPage = page.locator('#audit-logs');
  const auditItems = auditPage.locator('.audit-log-item');
  await auditItems.first().waitFor();
  assert.equal(await auditItems.count(), 4, 'audit page should render every fixture record');
  assert.match(await auditPage.locator('.audit-result-summary').innerText(), /共 4 条操作记录/, 'audit count should be expressed in plain language');
  const auditSummaryText = await auditItems.allInnerTexts();
  assert.match(auditSummaryText.join('\n'), /管理员成功登录后台/);
  assert.match(auditSummaryText.join('\n'), /用户保存了观察记录/);
  assert.match(auditSummaryText.join('\n'), /管理员新增了用户投稿限制/);
  assert.match(auditSummaryText.join('\n'), /用户申请了删除账号/);
  assert.ok(auditSummaryText.every((text) => !/admin\.auth|observation\.saved|discussion_restriction\.created|privacy\.deletion\.requested/.test(text)), 'technical action codes must stay hidden by default');
  assert.equal(await auditPage.locator('.audit-detail-grid').count(), 0, 'technical details should stay collapsed by default');

  const auditActionSelect = auditPage.locator('.audit-action-filter select');
  const auditOptionLabels = await auditActionSelect.locator('option').allTextContents();
  assert.ok(auditOptionLabels.includes('申请了删除账号'), 'audit action filter should use Chinese labels');
  assert.ok(auditOptionLabels.slice(1).every((label) => !/[a-z_]+\.[a-z_]/.test(label)), 'audit action filter must not expose backend codes');
  const auditGroups = await auditActionSelect.locator('optgroup').evaluateAll((groups) => groups.map((group) => group.getAttribute('label')));
  for (const category of ['内容发布', '讨论管理', '会员操作', '观察记录', '账户与权限', '隐私与安全', '系统设置']) assert.ok(auditGroups.includes(category), `audit action filter should include ${category}`);

  const firstAuditToggle = auditItems.first().locator('.audit-detail-toggle');
  await firstAuditToggle.click();
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'true');
  await auditItems.first().getByText('admin.auth.login_succeeded', { exact: true }).waitFor();
  await firstAuditToggle.press('Enter');
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'false', 'Enter should collapse technical details');
  await firstAuditToggle.press('Enter');
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'true', 'Enter should reopen technical details');
  await firstAuditToggle.press('Space');
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'false', 'Space should collapse technical details');

  const auditActorSelect = auditPage.locator('.audit-filters select').first();
  await auditActorSelect.selectOption('admin');
  await auditActionSelect.selectOption('privacy.deletion.requested');
  await auditPage.getByRole('button', { name: '筛选', exact: true }).click();
  await auditPage.locator('.audit-empty-state').waitFor();
  assert.match(await auditPage.locator('.audit-empty-state').innerText(), /当前筛选条件下没有操作记录/);
  const latestAuditRequest = [...requests].reverse().find((request) => request.path === '/admin/audit-logs');
  assert.ok(latestAuditRequest?.query.includes('actorType=admin'));
  assert.ok(latestAuditRequest?.query.includes('action=privacy.deletion.requested'));

  await auditPage.getByRole('button', { name: '重置', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#audit-logs .audit-log-item').length === 4);
  assert.equal(await auditActorSelect.inputValue(), '');
  assert.equal(await auditActionSelect.inputValue(), '');
  await noOverflow('1440px audit records');
  await page.screenshot({ path: resolve(output, 'admin-audit-records-desktop.png'), fullPage: true });

  await navigate('讨论管理');
  const discussionSection = page.locator('#discussion-contributions');
  const contentTab = discussionSection.getByRole('tab', { name: '内容管理', exact: true });
  const restrictionsTab = discussionSection.getByRole('tab', { name: '用户限制', exact: true });
  const discussionToolbar = discussionSection.locator('.discussion-management-toolbar');
  const toolbarTabsBox = await discussionToolbar.locator('.discussion-management-tabs').boundingBox();
  const toolbarRefreshBox = await discussionToolbar.getByRole('button', { name: '刷新', exact: true }).boundingBox();
  assert.ok(toolbarTabsBox && toolbarRefreshBox, 'discussion toolbar controls should be visible');
  assert.ok(toolbarRefreshBox.x >= toolbarTabsBox.x + toolbarTabsBox.width, 'discussion refresh should sit to the right of the tabs');
  assert.ok(Math.abs((toolbarTabsBox.y + toolbarTabsBox.height / 2) - (toolbarRefreshBox.y + toolbarRefreshBox.height / 2)) <= 2, 'discussion refresh should be vertically aligned with the tabs');
  assert.equal(await contentTab.getAttribute('aria-selected'), 'true', 'discussion management should open on content moderation');
  let latestContentRequest = [...requests].reverse().find((request) => request.path === '/admin/discussion-contributions');
  assert.ok(latestContentRequest?.query.includes('publicationStatus=pending'), 'content moderation should default to the pending queue');
  const contentSummary = discussionSection.locator('[aria-label="发布状态概览"]');
  await contentSummary.getByRole('button', { name: /^全部 7$/ }).waitFor();
  assert.match((await contentSummary.getByRole('button', { name: /^全部/ }).innerText()).replace(/\s+/g, ' '), /^全部 7$/, 'content total should sum every publication status');
  assert.equal(await discussionSection.locator('.discussion-contribution-row').count(), 2, 'pending queue should show pending fixtures only');
  assert.equal(await discussionSection.locator('.discussion-contribution-row-actions button svg').count(), 0, 'discussion action buttons should not use decorative arrows');
  const discussionActionBoxes = await discussionSection.locator('.discussion-contribution-row-actions button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height, borderStyle: getComputedStyle(button).borderStyle };
  }));
  assert.ok(discussionActionBoxes.length > 0 && discussionActionBoxes.every((box) => box.height >= 42), 'discussion actions should keep a usable touch height');
  assert.ok(discussionActionBoxes.every((box) => box.borderStyle === 'solid'), 'discussion action buttons should use one consistent border style');
  await contentSummary.getByRole('button', { name: /^全部/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('#discussion-contributions .discussion-contribution-row').length === 7);
  latestContentRequest = [...requests].reverse().find((request) => request.path === '/admin/discussion-contributions');
  assert.equal(latestContentRequest?.query.includes('publicationStatus='), false, 'viewing all discussion content should clear the publication filter');
  await noOverflow('1440px discussion content');

  await restrictionsTab.click();
  await discussionSection.locator('#discussion-restriction-form').waitFor();
  const restrictionReasonBox = await discussionSection.locator('#discussion-restriction-form textarea').boundingBox();
  assert.ok(restrictionReasonBox && restrictionReasonBox.height <= 56, 'restriction reason should use a compact single-line height by default');
  const restrictionRequest = [...requests].reverse().find((request) => request.path === '/admin/discussion-restrictions');
  assert.ok(restrictionRequest?.query.includes('status=active'), 'restriction view should default to active restrictions');
  const restrictionSummary = discussionSection.locator('[aria-label="用户限制状态概览"]');
  await restrictionSummary.getByRole('button', { name: /^全部 4$/ }).waitFor();
  assert.match((await restrictionSummary.getByRole('button', { name: /^全部/ }).innerText()).replace(/\s+/g, ' '), /^全部 4$/, 'restriction total should sum every restriction status');
  assert.equal(await discussionSection.locator('.discussion-restriction-row').count(), 1, 'active restrictions should be shown by default');
  assert.equal(await discussionSection.locator('.discussion-restriction-row button svg').count(), 0, 'restriction actions should not use decorative arrows');
  await restrictionSummary.getByRole('button', { name: /^全部/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('#discussion-contributions .discussion-restriction-row').length === 4);
  await noOverflow('1440px discussion restrictions');

  await navigate('微声音');
  await page.locator('.issue-module-picker button').filter({ hasText: '微声音' }).click();
  const actionEditor = page.locator('.issue-audio-actions-editor');
  assert.equal(await actionEditor.getAttribute('open'), '', 'micro voice action editor should be expanded by default');
  const audioModuleCard = page.locator('[data-issue-module="audio"]');
  assert.equal(await audioModuleCard.getByText('兼容旧配置').count(), 0, 'legacy micro voice link editor should be removed');
  assert.equal(await audioModuleCard.locator('.issue-module-link-editor').count(), 0, 'audio module should only expose action editors');
  const migratedActionRow = actionEditor.locator('.issue-audio-action-row').nth(1);
  assert.equal(await migratedActionRow.getByLabel('操作类型').inputValue(), 'web');
  assert.equal(await migratedActionRow.getByLabel('按钮文字', { exact: true }).innerText(), '公众号');
  assert.equal(await migratedActionRow.getByLabel('网站链接（HTTPS）').inputValue(), 'https://mp.weixin.qq.com/s/example');
  await actionEditor.getByRole('button', { name: '＋ 添加操作模块' }).click();
  const actionRows = actionEditor.locator('.issue-audio-action-row');
  assert.equal(await actionRows.count(), 3, 'legacy link should be merged before adding another action');
  await actionRows.nth(2).getByLabel('小程序页面路径').fill('/pages/story-detail/index?id=story');
  const removeButtonBoxes = await actionRows.locator(':scope > button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, left: box.left };
  }));
  assert.equal(removeButtonBoxes.length, 3, 'each action row should have one remove button');
  assert.ok(removeButtonBoxes.every((box) => Math.abs(box.width - removeButtonBoxes[0].width) <= 1), 'remove buttons should keep the same compact width');
  assert.ok(removeButtonBoxes.every((box) => Math.abs(box.left - removeButtonBoxes[0].left) <= 1), 'remove buttons should align in the last grid column');
  await page.screenshot({ path: resolve(output, 'admin-micro-voice-actions.png'), fullPage: true });
  const audioPreview = page.locator('.journal-preview-rail');
  await audioPreview.getByRole('button', { name: '详情页' }).click();
  const previewActions = audioPreview.locator('.audio-preview-actions');
  await previewActions.locator('.audio-preview-action').filter({ hasText: '公众号' }).waitFor();
  assert.equal(await previewActions.getByText('继续了解', { exact: true }).count(), 0, 'action heading should be removed');
  assert.equal(await previewActions.locator('.audio-preview-action-list').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length), 4, 'actions should use four columns');
  for (const label of await previewActions.locator('.audio-preview-action').allInnerTexts()) assert.ok(!/[↗→›]/.test(label), 'action arrow should be removed: ' + label);
  const actionShape = await previewActions.locator('.audio-preview-action').first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { radius: parseFloat(style.borderRadius), height: parseFloat(style.height) };
  });
  assert.ok(actionShape.radius >= actionShape.height / 2, 'action buttons should be pill-shaped');
  assert.ok(actionShape.height >= 24, 'action buttons should keep a full touch height');

  await navigate('首页策展');
  const journalEditor = page.locator('#journal-module-workspace');
  const homeIntroduction = journalEditor.getByLabel('首页顶部介绍', { exact: true });
  assert.equal(await homeIntroduction.inputValue(), '记录女性的真实经历，也邀请你观察自己的生活');
  assert.equal(await homeIntroduction.getAttribute('maxlength'), '120');
  const homeIntroductionPreview = page.locator('.preview-home-introduction');
  await homeIntroduction.fill('');
  assert.equal(await homeIntroductionPreview.count(), 0, 'an explicitly empty introduction should hide the preview');
  await homeIntroduction.fill('每一种生活，都值得被认真看见');
  assert.equal(await homeIntroductionPreview.innerText(), '每一种生活，都值得被认真看见');
  await page.screenshot({ path: resolve(output, 'admin-home-introduction.png'), fullPage: true });
  await page.locator('.issue-module-picker button').filter({ hasText: '本期问题' }).click();
  const questionEyebrow = journalEditor.locator('[data-issue-module="question"]').getByRole('textbox', { name: '栏目眉题', exact: true });
  const questionIntroPreview = page.locator('.preview-question-intro');
  assert.equal(await questionEyebrow.innerText(), '', 'opening an empty eyebrow must not restore default copy');
  assert.equal(await questionIntroPreview.count(), 0, 'empty eyebrows should have no preview line or spacing');
  await questionEyebrow.fill('写入新的眉题');
  assert.equal(await questionIntroPreview.innerText(), '写入新的眉题');
  await questionEyebrow.fill('');
  assert.equal(await questionIntroPreview.count(), 0, 'clearing an eyebrow must immediately hide it');
  await page.screenshot({ path: resolve(output, 'admin-question-empty-eyebrow.png'), fullPage: true });
  await journalEditor.getByLabel('期刊编号').fill('');
  await journalEditor.getByLabel('期刊标签', { exact: true }).fill('   ');
  await journalEditor.getByLabel('刊期月份', { exact: true }).fill('');
  const requestsBeforeValidation = requests.length;
  await journalEditor.getByRole('button', { name: '保存整份草稿', exact: true }).click();
  const validationAlert = journalEditor.getByRole('alert').filter({ hasText: '请补充以下必要信息' });
  await validationAlert.waitFor();
  const validationText = await validationAlert.innerText();
  for (const field of ['期刊编号', '期刊标签', '刊期月份']) assert.match(validationText, new RegExp(field));
  assert.equal(
    requests.slice(requestsBeforeValidation).some((request) => request.method === 'PATCH' && request.path === '/content/issues/issue-1'),
    false,
    'invalid issue metadata must not be sent to the API',
  );

  await journalEditor.getByLabel('期刊编号').fill('issue-03');
  await journalEditor.getByLabel('期刊标签', { exact: true }).fill('第三期');
  await journalEditor.getByLabel('刊期月份', { exact: true }).fill('2026 年 11 月');
  const issueSaveRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/content/issues/issue-1'));
  await journalEditor.getByRole('button', { name: '保存整份草稿', exact: true }).click();
  const issuePayload = (await issueSaveRequest).postDataJSON();
  assert.equal(issuePayload.draftContent.sections.find((module) => module.type === 'issueMeta').introduction, '每一种生活，都值得被认真看见');
  assert.equal(issuePayload.draftContent.sections.find((module) => module.type === 'question').eyebrow, '');
  assert.equal(issuePayload.draftContent.sections.find((module) => module.type === 'question').eyebrowRichText, '');
  await page.waitForFunction(() => document.querySelector('.journal-savebar')?.textContent?.includes('已与云端同步'));
  assert.equal((await questionEyebrow.innerText()).trim(), '', 'saved draft reload must keep the eyebrow empty');
  assert.equal(await questionIntroPreview.count(), 0, 'saved draft preview must keep the eyebrow hidden');
  const sentAudioModule = issuePayload.draftContent.sections.find((module) => module.type === 'audio');
  assert.ok(sentAudioModule, 'audio module should remain in the issue payload');
  assert.equal(Object.prototype.hasOwnProperty.call(sentAudioModule, 'actions'), false, 'legacy top-level audio actions must not be sent again');
  assert.ok(Array.isArray(sentAudioModule.tracks?.[0]?.actions), 'audio actions should stay inside the first micro voice track');
  await page.waitForFunction(() => [...document.querySelectorAll('.journal-savebar button')].some((button) => button.textContent.includes('保存整份草稿') && !button.disabled));
  await settle();

  await navigate('员工与权限');
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
      if (label === '讨论管理') {
        const responsiveDiscussion = page.locator('#discussion-contributions');
        await responsiveDiscussion.getByRole('tab', { name: '内容管理', exact: true }).click();
        await responsiveDiscussion.locator('.discussion-contribution-row').first().waitFor();
        await noOverflow(`${width}px discussion content`);
        await responsiveDiscussion.getByRole('tab', { name: '用户限制', exact: true }).click();
        await responsiveDiscussion.locator('#discussion-restriction-form').waitFor();
        await noOverflow(`${width}px discussion restrictions`);
      }
      if (width === 375 && ['会员列表', '实践页面', '操作记录', '模块状态机', '员工与权限', '关于 MYRIAD SHE', '生命牌文案'].includes(label)) await page.screenshot({ path: resolve(output, `admin-${({ 会员列表: 'members', 实践页面: 'practice', 操作记录: 'audit', 模块状态机: 'module-states', 员工与权限: 'employees', '关于 MYRIAD SHE': 'about', 生命牌文案: 'life-cards' })[label]}-mobile.png`), fullPage: true });
    }
  }
  await page.locator('.admin-notification-trigger').click();
  await page.locator('.admin-notification-panel').waitFor();
  await noOverflow('375px notifications');
  await page.keyboard.press('Escape');
  await page.locator('.admin-notification-panel').waitFor({ state: 'detached' });
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
  assert.equal(await limitedMenu.getByRole('option').count(), 3);
  await limitedMenu.getByRole('combobox').fill('员工');
  assert.equal(await limitedMenu.getByRole('option').count(), 0);
  await limitedMenu.getByRole('combobox').fill('模块状态机');
  assert.equal(await limitedMenu.getByRole('option').count(), 1);
  await limitedMenu.getByRole('option').click();
  await limitedMenu.waitFor({ state: 'detached' });
  await restricted.locator('#module-state-machine .module-state-table tbody tr').first().waitFor();
  assert.equal(await restricted.getByRole('button', { name: '调整状态', exact: true }).count(), 0, 'read-only staff must not see transition actions');
  assert.equal(await restricted.locator('#module-state-machine .module-readonly').count(), 4, 'read-only staff should see an explicit read-only label');
  await restricted.close();
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  assert.equal(
    requests.every((request) => request.method === 'GET'
      || (request.method === 'POST' && /^\/admin\/notifications\/(read-all|[0-9a-f-]{36}\/read)$/.test(request.path))
      || (request.method === 'PATCH' && request.path === '/content/issues/issue-1')),
    true,
    'navigation and draft tests must not persist unrelated data',
  );
  console.log('PASS: 30 authorized destinations, issue required-field validation, module state filters/read-only transitions, discussion content/restriction views, aggregate summary counts, 3 responsive viewport sizes, notification interactions, editor drafts, refresh confirmation/failure, dialogs/focus/scroll, command search/keyboard/permissions, sidebar persistence and reduced motion.');
} finally {
  await browser?.close();
  await server.close();
}
