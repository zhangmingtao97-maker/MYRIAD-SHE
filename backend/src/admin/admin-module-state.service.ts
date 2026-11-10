import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { parseDatabaseCount } from '../pagination';
import { AuditService } from './audit.service';

export const moduleRuntimeStates = ['online', 'maintenance', 'degraded', 'disabled'] as const;
export type ModuleRuntimeState = typeof moduleRuntimeStates[number];

const legalTransitions: Record<ModuleRuntimeState, ModuleRuntimeState[]> = {
  online: ['maintenance', 'degraded', 'disabled'],
  maintenance: ['online', 'disabled'],
  degraded: ['online', 'maintenance', 'disabled'],
  disabled: ['maintenance'],
};

export interface ModuleRuntimeRow {
  moduleId: string;
  label: string;
  category: string;
  state: ModuleRuntimeState;
  previousState: ModuleRuntimeState | null;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date;
  lastActivityAt: Date | null;
}

export interface ModuleStateEventRow {
  id: string;
  moduleId: string;
  previousState: ModuleRuntimeState | null;
  nextState: ModuleRuntimeState;
  reason: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ModuleRuntimeTransitionInput {
  nextState?: unknown;
  reason?: unknown;
}

function isModuleRuntimeState(value: unknown): value is ModuleRuntimeState {
  return typeof value === 'string' && (moduleRuntimeStates as readonly string[]).includes(value);
}

function assertModuleId(moduleId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(moduleId)) throw new BadRequestException('模块标识无效');
}

@Injectable()
export class AdminModuleStateService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const modules = await client.query<ModuleRuntimeRow>(
        `select module_id as "moduleId", label, category, state,
                previous_state as "previousState", reason, updated_by as "updatedBy",
                updated_at as "updatedAt", last_activity_at as "lastActivityAt"
         from module_runtime_states
         order by category asc, label asc, module_id asc`,
      );
      const events = await client.query<ModuleStateEventRow>(
        `select id, module_id as "moduleId", previous_state as "previousState",
                next_state as "nextState", reason, actor_id as "actorId", metadata,
                created_at as "createdAt"
         from module_state_events
         order by created_at desc, id desc
         limit 40`,
      );
      const recentActivity = await client.query<{ moduleId: string; lastActivityAt: Date }>(
        `select distinct on (module_id) module_id as "moduleId", created_at as "lastActivityAt"
         from module_state_events
         order by module_id, created_at desc, id desc`,
      );
      const eventCounts = await client.query<{ moduleId: string; total: string }>(
        `select module_id as "moduleId", count(*)::text as total
         from module_state_events
         where created_at >= now() - interval '24 hours'
         group by module_id`,
      );

      const activityByModule = new Map(recentActivity.rows.map((row) => [row.moduleId, row.lastActivityAt]));
      const events24hByModule = new Map(eventCounts.rows.map((row) => [row.moduleId, parseDatabaseCount(row.total, '模块最近事件数')]));
      const summary: Record<ModuleRuntimeState, number> = { online: 0, maintenance: 0, degraded: 0, disabled: 0 };
      for (const module of modules.rows) summary[module.state] += 1;

      return {
        modules: modules.rows.map((module) => ({
          ...module,
          lastActivityAt: module.lastActivityAt ?? activityByModule.get(module.moduleId) ?? null,
          events24h: events24hByModule.get(module.moduleId) ?? 0,
          legalNextStates: legalTransitions[module.state],
        })),
        events: events.rows,
        summary,
        generatedAt: new Date(),
      };
    });
  }

  async transition(moduleId: string, input: ModuleRuntimeTransitionInput, actorId: string) {
    assertModuleId(moduleId);
    if (!isModuleRuntimeState(input.nextState)) throw new BadRequestException('目标状态无效');
    if (typeof input.reason !== 'string') throw new BadRequestException('请填写状态变更原因');
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('请填写状态变更原因');
    if (reason.length > 500) throw new BadRequestException('状态变更原因不能超过 500 个字');
    const nextState = input.nextState;

    return this.database.withTransaction(async (client) => {
      const existing = await client.query<ModuleRuntimeRow>(
        `select module_id as "moduleId", label, category, state,
                previous_state as "previousState", reason, updated_by as "updatedBy",
                updated_at as "updatedAt", last_activity_at as "lastActivityAt"
         from module_runtime_states
         where module_id = $1
         for update`, [moduleId],
      );
      const current = existing.rows[0];
      if (!current) throw new NotFoundException('模块不存在');
      if (!legalTransitions[current.state].includes(nextState)) {
        throw new ConflictException({
          code: 'module_state_transition_not_allowed',
          message: `模块不能从 ${current.state} 直接切换到 ${nextState}`,
        });
      }

      const updated = await client.query<ModuleRuntimeRow>(
        `update module_runtime_states
         set previous_state = state,
             state = $2,
             reason = $3,
             updated_by = $4,
             updated_at = now(),
             last_activity_at = now()
         where module_id = $1
         returning module_id as "moduleId", label, category, state,
                   previous_state as "previousState", reason, updated_by as "updatedBy",
                   updated_at as "updatedAt", last_activity_at as "lastActivityAt"`,
        [moduleId, nextState, reason, actorId],
      );
      const module = updated.rows[0];
      if (!module) throw new ConflictException('模块状态未能更新，请重试');

      const event = await client.query<ModuleStateEventRow>(
        `insert into module_state_events
           (module_id, previous_state, next_state, reason, actor_id, metadata)
         values ($1, $2, $3, $4, $5, $6::jsonb)
         returning id, module_id as "moduleId", previous_state as "previousState",
                   next_state as "nextState", reason, actor_id as "actorId", metadata,
                   created_at as "createdAt"`,
        [moduleId, current.state, nextState, reason, actorId, JSON.stringify({ previousState: current.state, nextState })],
      );
      const change = event.rows[0];
      if (!change) throw new ConflictException('模块状态事件未能记录，请重试');

      const eventCount = await client.query<{ total: string }>(
        `select count(*)::text as total
         from module_state_events
         where module_id = $1 and created_at >= now() - interval '24 hours'`,
        [moduleId],
      );

      await this.audit.record({
        actorType: 'admin',
        actorId,
        action: 'system.module_state.transitioned',
        resourceType: 'module_runtime_state',
        resourceId: moduleId,
        metadata: { previousState: current.state, nextState, reason },
      }, client);

      return {
        module: {
          ...module,
          lastActivityAt: module.lastActivityAt ?? change.createdAt,
          events24h: parseDatabaseCount(eventCount.rows[0]?.total ?? '0', '模块最近事件数'),
          legalNextStates: legalTransitions[module.state],
        },
        event: change,
      };
    });
  }
}
