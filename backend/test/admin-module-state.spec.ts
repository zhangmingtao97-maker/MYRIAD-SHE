import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AdminModuleStateService } from '../src/admin/admin-module-state.service';
import type { AuditService } from '../src/admin/audit.service';
import type { DatabaseService } from '../src/database/database.service';

function databaseHarness(handler: (sql: string, values: unknown[]) => unknown) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      return handler(sql, values);
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async <T>(callback: (transactionClient: PoolClient) => Promise<T>) => callback(client),
  } as unknown as DatabaseService;
  return { database, statements };
}

const onlineModule = {
  moduleId: 'content', label: '内容与期刊', category: '内容', state: 'online', previousState: null,
  reason: null, updatedBy: null, updatedAt: new Date('2026-11-06T01:00:00.000Z'), lastActivityAt: null,
};

const maintenanceModule = {
  moduleId: 'practice', label: '实践页面', category: '内容', state: 'maintenance', previousState: 'online',
  reason: '计划维护', updatedBy: 'admin-1', updatedAt: new Date('2026-11-06T02:00:00.000Z'),
  lastActivityAt: new Date('2026-11-06T02:00:00.000Z'),
};

test('module state list reports summaries, recent activity and 24-hour event counts', async () => {
  const { database, statements } = databaseHarness((sql) => {
    if (/from module_runtime_states/.test(sql)) return { rows: [onlineModule, maintenanceModule], rowCount: 2 };
    if (/select distinct on \(module_id\)/.test(sql)) {
      return { rows: [{ moduleId: 'content', lastActivityAt: new Date('2026-11-06T03:00:00.000Z') }], rowCount: 1 };
    }
    if (/count\(\*\)::text as total/.test(sql)) return { rows: [{ moduleId: 'content', total: '2' }], rowCount: 1 };
    if (/from module_state_events/.test(sql)) {
      return {
        rows: [{
          id: 'event-1', moduleId: 'practice', previousState: 'online', nextState: 'maintenance',
          reason: '计划维护', actorId: 'admin-1', metadata: {}, createdAt: new Date('2026-11-06T02:00:00.000Z'),
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const service = new AdminModuleStateService(database, {} as AuditService);

  const result = await service.list();

  assert.match(statements[0].sql, /set transaction isolation level repeatable read/i);
  assert.deepEqual(result.summary, { online: 1, maintenance: 1, degraded: 0, disabled: 0 });
  assert.equal(result.modules[0].events24h, 2);
  assert.deepEqual(result.modules[0].lastActivityAt, new Date('2026-11-06T03:00:00.000Z'));
  assert.deepEqual(result.modules[0].legalNextStates, ['maintenance', 'degraded', 'disabled']);
  assert.deepEqual(result.modules[1].legalNextStates, ['online', 'disabled']);
  assert.equal(result.events.length, 1);
});

test('module state transition locks, updates, records an event and refreshes the 24-hour count', async () => {
  const audits: Array<{ action: string; resourceId: string }> = [];
  let eventInserted = false;
  const { database, statements } = databaseHarness((sql, values) => {
    if (/from module_runtime_states/.test(sql) && /for update/.test(sql)) return { rows: [onlineModule], rowCount: 1 };
    if (/update module_runtime_states/.test(sql)) {
      return {
        rows: [{ ...onlineModule, state: 'maintenance', previousState: 'online', reason: String(values[2]), updatedBy: String(values[3]) }],
        rowCount: 1,
      };
    }
    if (/insert into module_state_events/.test(sql)) {
      eventInserted = true;
      return {
        rows: [{
          id: 'event-1', moduleId: 'content', previousState: 'online', nextState: 'maintenance', reason: String(values[3]),
          actorId: String(values[4]), metadata: JSON.parse(String(values[5])), createdAt: new Date('2026-11-06T02:00:00.000Z'),
        }],
        rowCount: 1,
      };
    }
    if (/count\(\*\)::text as total/.test(sql)) return { rows: [{ total: '3' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const audit = {
    record: async (entry: { action: string; resourceId: string }) => { audits.push(entry); },
  } as unknown as AuditService;
  const service = new AdminModuleStateService(database, audit);

  const result = await service.transition('content', { nextState: 'maintenance', reason: '  计划维护  ' }, 'admin-1');

  assert.equal(eventInserted, true);
  assert.equal(result.module.state, 'maintenance');
  assert.equal(result.module.events24h, 3);
  assert.deepEqual(result.module.legalNextStates, ['online', 'disabled']);
  assert.equal(result.event.reason, '计划维护');
  assert.deepEqual(audits.map((entry) => [entry.action, entry.resourceId]), [['system.module_state.transitioned', 'content']]);
  assert.ok(statements.some(({ sql, values }) => /update module_runtime_states/.test(sql) && values[2] === '计划维护'));
});

test('module state transition rejects illegal edges and invalid reasons before writing', async () => {
  let writes = 0;
  const { database } = databaseHarness((sql) => {
    if (/from module_runtime_states/.test(sql)) return { rows: [onlineModule], rowCount: 1 };
    if (/^(?:\s*)(update|insert)/i.test(sql)) writes += 1;
    return { rows: [], rowCount: 0 };
  });
  const service = new AdminModuleStateService(database, {} as AuditService);

  await assert.rejects(
    service.transition('content', { nextState: 'online', reason: '重复状态' }, 'admin-1'),
    (error: unknown) => error instanceof ConflictException,
  );
  await assert.rejects(
    service.transition('content', { nextState: 'maintenance', reason: '   ' }, 'admin-1'),
    (error: unknown) => error instanceof BadRequestException,
  );
  assert.equal(writes, 0);
});