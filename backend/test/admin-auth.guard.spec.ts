import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from '../src/auth/admin-auth.guard';
import type { DatabaseService } from '../src/database/database.service';

function guardFor(role: string, path: string, method = 'GET', passwordChangeRequired = false) {
  const request = { headers: { authorization: 'Bearer token' }, method, path };
  const jwt = { verifyAsync: async () => ({ sub: 'staff-id', role, exp: Math.floor(Date.now() / 1000) + 60 }) };
  const database = { query: async () => ({ rows: [{ role, passwordChangeRequired }] }) };
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
