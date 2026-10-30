import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { UserAuthGuard } from '../src/auth/user-auth.guard';
import type { DatabaseService } from '../src/database/database.service';

test('user auth guard rejects malformed UUID subjects before database access', async () => {
  let queried = false;
  const guard = new UserAuthGuard(
    { verifyAsync: async () => ({ sub: 'not-a-user-id', role: 'user', exp: Math.floor(Date.now() / 1000) + 60 }) } as unknown as JwtService,
    { query: async () => { queried = true; return { rows: [{ 1: 1 }] }; } } as unknown as DatabaseService,
  );
  const request = { headers: { authorization: 'Bearer valid-token' } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

  await assert.rejects(guard.canActivate(context), UnauthorizedException);
  assert.equal(queried, false);
});
