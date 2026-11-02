import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from '../src/auth/admin-auth.guard';
import { adminModuleIds, effectiveAdminModules, parseAdminModuleOverride } from '../src/auth/admin-permissions';
import type { DatabaseService } from '../src/database/database.service';

function guardFor(role: string, path: string, method = 'GET', passwordChangeRequired = false, modulePermissions: string[] | null = null) {
  const request = { headers: { authorization: 'Bearer token' }, method, path };
  const jwt = { verifyAsync: async () => ({ sub: 'staff-id', role, exp: Math.floor(Date.now() / 1000) + 60 }) };
  const database = { query: async () => ({ rows: [{ role, passwordChangeRequired, modulePermissions }] }) };
  const guard = new AdminAuthGuard(jwt as unknown as JwtService, database as unknown as DatabaseService);
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { guard, context, request };
}

test('content editor can edit approved modules but cannot access member data or delete media', async () => {
  const allowed = guardFor('content_editor', '/api/content/daily-objects/manage', 'PATCH');
  assert.equal(await allowed.guard.canActivate(allowed.context), true);
  const memberData = guardFor('content_editor', '/api/admin/users');
  await assert.rejects(memberData.guard.canActivate(memberData.context), ForbiddenException);
  const deleteMedia = guardFor('content_editor', '/api/content/media', 'DELETE');
  await assert.rejects(deleteMedia.guard.canActivate(deleteMedia.context), ForbiddenException);
  for (const [path, method] of [
    ['/api/content/issues', 'GET'], ['/api/content/issues', 'POST'],
    ['/api/content/media/audio', 'GET'],
    ['/api/content/issues/00000000-0000-0000-0000-000000000001', 'PATCH'],
    ['/api/content/issues/00000000-0000-0000-0000-000000000001/publish', 'POST'],
    ['/api/content/issues/00000000-0000-0000-0000-000000000001/history', 'GET'],
    ['/api/admin/discussion-contributions', 'GET'],
    ['/api/admin/discussion-contributions/00000000-0000-4000-8000-000000000001', 'GET'],
    ['/api/admin/discussion-contributions/00000000-0000-4000-8000-000000000001/status', 'PATCH'],
  ]) {
    const issueRoute = guardFor('content_editor', path, method);
    assert.equal(await issueRoute.guard.canActivate(issueRoute.context), true);
  }
});

test('support is limited to read-only member directory and settings routes', async () => {
  const memberList = guardFor('support_readonly', '/api/admin/users');
  assert.equal(await memberList.guard.canActivate(memberList.context), true);
  const privacyAction = guardFor('support_readonly', '/api/admin/privacy-requests/request/process', 'POST');
  await assert.rejects(privacyAction.guard.canActivate(privacyAction.context), ForbiddenException);
  const memberMutation = guardFor('support_readonly', '/api/admin/users/member-id/status', 'PATCH');
  await assert.rejects(memberMutation.guard.canActivate(memberMutation.context), ForbiddenException);
  const contributionAccess = guardFor('support_readonly', '/api/admin/discussion-contributions');
  await assert.rejects(contributionAccess.guard.canActivate(contributionAccess.context), ForbiddenException);
});

test('editors can import and edit legal drafts; only super admins can publish', async () => {
  for (const key of ['privacy-policy', 'user-agreement']) {
    for (const [suffix, method] of [['manage', 'GET'], ['manage', 'PATCH'], ['import', 'POST']]) {
      const allowed = guardFor('content_editor', `/api/content/legal-documents/${key}/${suffix}`, method);
      assert.equal(await allowed.guard.canActivate(allowed.context), true);
    }
    const denied = guardFor('content_editor', `/api/content/legal-documents/${key}/manage/publish`, 'POST');
    await assert.rejects(denied.guard.canActivate(denied.context), ForbiddenException);
    const superAdmin = guardFor('super_admin', `/api/content/legal-documents/${key}/manage/publish`, 'POST');
    assert.equal(await superAdmin.guard.canActivate(superAdmin.context), true);
    const support = guardFor('support_readonly', `/api/content/legal-documents/${key}/manage`, 'GET');
    await assert.rejects(support.guard.canActivate(support.context), ForbiddenException);
  }
});

test('staff with a required password change may only use the password-change endpoint', async () => {
  const denied = guardFor('content_editor', '/api/content/practice/manage', 'GET', true);
  await assert.rejects(denied.guard.canActivate(denied.context), ForbiddenException);
  const allowed = guardFor('content_editor', '/api/admin/me/password', 'PATCH', true);
  assert.equal(await allowed.guard.canActivate(allowed.context), true);
});

test('staff module grants replace the role defaults', async () => {
  // 单独授权观察记录模块后，内容编辑可以访问观察记录，但不再拥有原角色默认的期刊权限。
  const observation = guardFor('content_editor', '/api/admin/observations', 'GET', false, ['observations']);
  assert.equal(await observation.guard.canActivate(observation.context), true);
  const observationalDetail = guardFor('content_editor', '/api/admin/observations/00000000-0000-4000-8000-000000000001', 'GET', false, ['observations']);
  assert.equal(await observationalDetail.guard.canActivate(observationalDetail.context), true);
  const journalAfterOverride = guardFor('content_editor', '/api/content/issues', 'GET', false, ['observations']);
  await assert.rejects(journalAfterOverride.guard.canActivate(journalAfterOverride.context), ForbiddenException);
  // 观察模块不包含重新加密等维护动作。
  const reencrypt = guardFor('content_editor', '/api/admin/observations/reencrypt', 'POST', false, ['observations']);
  await assert.rejects(reencrypt.guard.canActivate(reencrypt.context), ForbiddenException);
});

test('explicitly empty module grants block every module but keep self-service endpoints', async () => {
  const blocked = guardFor('support_readonly', '/api/admin/users', 'GET', false, []);
  await assert.rejects(blocked.guard.canActivate(blocked.context), ForbiddenException);
  for (const [path, method] of [['/api/admin/me', 'GET'], ['/api/admin/me/password', 'PATCH'], ['/api/admin/me/avatar', 'POST']]) {
    const ownAccount = guardFor('support_readonly', path, method, false, []);
    assert.equal(await ownAccount.guard.canActivate(ownAccount.context), true);
  }
});

test('support accounts can be granted extra modules such as audit logs', async () => {
  const audit = guardFor('support_readonly', '/api/admin/audit-logs', 'GET', false, ['members', 'settings', 'audit']);
  assert.equal(await audit.guard.canActivate(audit.context), true);
  const settings = guardFor('support_readonly', '/api/admin/system-settings', 'GET', false, ['members', 'settings', 'audit']);
  assert.equal(await settings.guard.canActivate(settings.context), true);
  const settingsWrite = guardFor('support_readonly', '/api/admin/system-settings', 'PATCH', false, ['members', 'settings', 'audit']);
  await assert.rejects(settingsWrite.guard.canActivate(settingsWrite.context), ForbiddenException);
});

test('null module overrides keep the role defaults', async () => {
  const allowed = guardFor('support_readonly', '/api/admin/users', 'GET', false, null);
  assert.equal(await allowed.guard.canActivate(allowed.context), true);
  const denied = guardFor('support_readonly', '/api/content/issues', 'GET', false, null);
  await assert.rejects(denied.guard.canActivate(denied.context), ForbiddenException);
});

test('super admins ignore module overrides and keep every route', async () => {
  const guard = guardFor('super_admin', '/api/admin/employees', 'GET', false, []);
  assert.equal(await guard.guard.canActivate(guard.context), true);
});

test('module overrides are validated and deduplicated', () => {
  assert.equal(parseAdminModuleOverride(undefined), undefined);
  assert.equal(parseAdminModuleOverride(null), null);
  assert.deepEqual(parseAdminModuleOverride(['audit', 'audit', 'members']), ['audit', 'members']);
  assert.throws(() => parseAdminModuleOverride(['unknown-module']));
  assert.throws(() => parseAdminModuleOverride('audit'));
  assert.deepEqual(effectiveAdminModules('content_editor', null), ['journal', 'practice', 'pages', 'media', 'contributions']);
  assert.deepEqual(effectiveAdminModules('content_editor', []), []);
  assert.deepEqual(effectiveAdminModules('support_readonly', ['audit', 'not-a-module']), ['audit']);
  assert.deepEqual(effectiveAdminModules('super_admin', []), [...adminModuleIds]);
});
