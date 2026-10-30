import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REQUEST_ID_HEADER, requestIdMiddleware, resolveRequestId, safeRoutePath } from '../src/request-id';

test('resolveRequestId preserves a safe upstream identifier', () => {
  assert.equal(resolveRequestId('gateway-2026.10-abc_1'), 'gateway-2026.10-abc_1');
});

test('resolveRequestId replaces missing or unsafe identifiers', () => {
  const generated = resolveRequestId('contains space');
  assert.match(generated, /^[0-9a-f-]{36}$/);
  assert.notEqual(resolveRequestId(undefined), '');
});

test('requestIdMiddleware stores and returns the resolved identifier', () => {
  let nextCalled = false;
  const request = {
    header: (name: string) => name === REQUEST_ID_HEADER ? 'client-request-7' : undefined,
  } as never;
  const headers = new Map<string, string>();
  const response = { setHeader: (name: string, value: string) => headers.set(name, value) } as never;

  requestIdMiddleware(request, response, () => { nextCalled = true; });

  assert.equal((request as { requestId?: string }).requestId, 'client-request-7');
  assert.equal(headers.get(REQUEST_ID_HEADER), 'client-request-7');
  assert.equal(nextCalled, true);
});

test('safeRoutePath never falls back to an unmatched raw URL', () => {
  assert.equal(safeRoutePath('/observations/:id'), '/observations/:id');
  assert.equal(safeRoutePath(['/content/:code', '/content/issues/:code']), '/content/:code|/content/issues/:code');
  assert.equal(safeRoutePath(undefined), '<unmatched>');
});
