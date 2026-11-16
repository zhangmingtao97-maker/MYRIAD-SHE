import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

// Exercise the real member list and dialog with fixtures, never a live account.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, cacheDir: resolve(root, '.test-artifacts/vite-members'), plugins: [vue()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(root, '..')] } } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
  const page = await context.newPage();
  const errors = [];
  const unknown = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  let role = 'super_admin';
  let member = {
    id: 'fa368241-1bd9-4869-b4fc-3b3185cea71e', nickname: '辰光', status: 'active',
    createdAt: '2026-10-22T09:26:19Z', updatedAt: '2026-10-22T09:26:19Z',
    avatarUrl: null, birthMonth: 5, birthDay: 18, observationCount: 12,
    phoneNumber: '17711313934', phoneMasked: '177****3934',
    address: { userName: '测试收件人', telNumber: '17711313934', provinceName: '上海市', cityName: '上海市', countyName: '徐汇区', detailInfo: '衡山路 16 号' },
    openId: 'test-open-id', maskedUnionId: 'test-****-union', privacyRequests: [],
  };
  await page.addInitScript(() => {
    const role = localStorage.getItem('member_fixture_role') || 'super_admin';
    localStorage.setItem('myriad_she_admin_token', `test.${btoa(JSON.stringify({ role }))}.test`);
    localStorage.setItem('myriad_she_admin_expires_at', String(Date.now() + 3600000));
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api/, '');
    requests.push({ path, method: route.request().method() });
    const send = json => route.fulfill({ json });
    if (path === '/admin/me') return send({ id: 'test-admin', username: 'editor', displayName: 'Test Editor', role, permissions: ['members'] });
    if (path === '/admin/notifications/unread-count') return send({ unreadCount: 0 });
    if (path === '/admin/users') return send({ items: [member], total: 1, limit: 50, offset: 0 });
    if (path === `/admin/users/${member.id}`) return send(member);
    unknown.push(path);
    return route.fulfill({ status: 404, json: { message: `Unexpected fixture request: ${path}` } });
  });
  await page.goto(url);
  await page.getByRole('button', { name: '会员列表', exact: true }).click();
  const trigger = page.locator('#member-directory').getByRole('button', { name: '详情', exact: true });
  const dialog = page.getByRole('dialog', { name: '会员详情', exact: true });
  const close = dialog.getByRole('button', { name: '关闭会员详情', exact: true });
  const summary = dialog.locator('summary');
  const identifiers = dialog.locator('details');
  const field = label => dialog.locator('dl > div').filter({ has: page.locator('dt').getByText(label, { exact: true }) }).locator('dd');
  await trigger.click();
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('heading', { name: '辰光', exact: true }).count(), 1);
  assert.equal(await field('手机号').innerText(), '17711313934');
  assert.equal(await field('生日').innerText(), '5 月 18 日');
  assert.match(await field('收货地址').innerText(), /衡山路 16 号/);
  assert.equal(await field('隐私申请').innerText(), '暂无申请');
  assert.equal(await identifiers.getAttribute('open'), null);
  assert.equal(await field('会员编号').isVisible(), false);
  assert.equal(await close.evaluate(el => el === document.activeElement), true);
  const panelWidth = (await dialog.boundingBox()).width;
  assert.ok(panelWidth >= 650 && panelWidth <= 682, 'The dialog should use the narrower editorial measure');

  // Native disclosure participates in the shared modal keyboard trap.
  await page.keyboard.press('Shift+Tab');
  assert.equal(await summary.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await close.evaluate(el => el === document.activeElement), true);
  await summary.focus();
  await page.keyboard.press('Enter');
  await field('会员编号').waitFor();
  await page.keyboard.press('Tab');
  const copy = dialog.getByRole('button', { name: '复制会员编号', exact: true });
  assert.equal(await copy.evaluate(el => el === document.activeElement), true);
  await copy.click();
  await dialog.getByRole('status').getByText('会员编号已复制', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), member.id);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
  await dialog.getByRole('button', { name: '复制微信 OpenID', exact: true }).click();
  await dialog.getByRole('status').getByText('复制失败，请选择编号手动复制。', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');

  // Empty values, no nickname/avatar, and a suspended account remain readable.
  member = { ...member, nickname: null, status: 'suspended', birthMonth: null, birthDay: null, phoneNumber: null, phoneMasked: null, address: null, maskedUnionId: null, observationCount: 0 };
  await trigger.click();
  await dialog.getByRole('heading', { name: '未设置昵称', exact: true }).waitFor();
  assert.equal(await field('手机号').innerText(), '未绑定');
  assert.equal(await field('生日').innerText(), '未填写');
  assert.equal(await field('收货地址').innerText(), '未填写');
  assert.equal(await dialog.locator('.member-profile-status').innerText(), '已停用');
  assert.equal(await dialog.locator('.member-profile-initial').innerText(), 'M');
  await close.click();

  // Stress wrapping and scrolling with a full address and several requests.
  member = { ...member, nickname: '辰光', status: 'active', phoneNumber: '17711313934',
    address: { provinceName: '上海市', cityName: '上海市', countyName: '徐汇区', detailInfo: '衡山路 16 号' + '详细门牌信息'.repeat(12) },
    openId: 'long-open-id-'.repeat(12),
    privacyRequests: ['pending', 'failed', 'completed', 'cancelled'].map((status, i) => ({ id: `request-${i}`, status, requestedAt: '2026-11-01T01:00:00Z', scheduledFor: '2026-11-08T01:00:00Z' })),
  };
  await trigger.click();
  await dialog.getByRole('region', { name: '账户隐私申请' }).waitFor();
  assert.equal(await dialog.locator('.member-profile-privacy li').count(), 4);
  assert.match(await dialog.locator('.member-profile-privacy').innerText(), /待处理[\s\S]*处理失败[\s\S]*已完成[\s\S]*已取消/);
  await summary.click();
  const output = resolve(root, '.test-artifacts');
  await mkdir(output, { recursive: true });
  for (const width of [1440, 768, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `dialog overflow at ${width}px`);
    assert.equal(await dialog.locator('.panel-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `content overflow at ${width}px`);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    assert.equal(await close.isVisible(), true);
    assert.equal(await dialog.locator('.member-detail-header').evaluate(el => getComputedStyle(el).flexDirection), 'row');
    await dialog.locator('.panel-body').evaluate(el => { el.scrollTop = 0; });
    if (width === 375) await page.screenshot({ path: resolve(output, 'member-detail-mobile.png'), fullPage: true });
  }
  await page.keyboard.press('Escape');

  // Read-only staff see the same layout with the existing address restriction.
  role = 'support_readonly';
  member = { ...member, phoneNumber: null, phoneMasked: '177****3934' };
  await page.evaluate(() => localStorage.setItem('member_fixture_role', 'support_readonly'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await trigger.click();
  await dialog.waitFor();
  assert.equal(await field('手机号').innerText(), '177****3934');
  assert.equal(await field('收货地址').innerText(), '仅超级管理员可见');
  assert.equal(await dialog.getByText(member.address.detailInfo, { exact: false }).count(), 0);
  assert.equal(await identifiers.getAttribute('open'), null, 'Reopening must start with account identifiers collapsed');
  await close.click();
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);

  member = { ...member, address: null, privacyRequests: [] };
  await trigger.click();
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState === 'finished'));
  await page.screenshot({ path: resolve(output, 'member-detail-desktop.png'), fullPage: true });
  await close.click();
  assert.equal(requests.every(request => request.method === 'GET'), true, 'The profile is read-only');
  assert.equal(requests.some(request => request.path.includes('observations')), false, 'Opening the profile must not fetch observation contents');
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  console.log('PASS: member profile data, empty and suspended states, identifier disclosure/copy/recovery, keyboard trap/focus return, long content at 5 widths, privacy records and staff permissions.');
} finally {
  await browser?.close();
  await server.close();
}
