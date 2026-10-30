import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { parseDatabaseCount } from '../pagination';

export type AuditActorType = 'user' | 'admin' | 'system';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: {
    actorType: AuditActorType;
    actorId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }, client?: PoolClient) {
    const values = [input.actorType, input.actorId ?? null, input.action, input.resourceType, input.resourceId ?? null, JSON.stringify(input.metadata ?? {})];
    const statement = `insert into audit_logs (actor_type, actor_id, action, resource_type, resource_id, metadata)
       values ($1, $2, $3, $4, $5, $6::jsonb)`;
    if (client) await client.query(statement, values);
    else await this.database.query(statement, values);
  }

  async list(limit = 100, offset = 0, actorType?: AuditActorType, action?: string) {
    const filters: string[] = [];
    const values: unknown[] = [];
    if (actorType) {
      values.push(actorType);
      filters.push(`actor_type = $${values.length}`);
    }
    if (action) {
      values.push(action);
      filters.push(`action = $${values.length}`);
    }
    const safeLimit = Math.min(Math.max(Number.isSafeInteger(limit) ? limit : 100, 1), 200);
    const safeOffset = Math.max(Number.isSafeInteger(offset) ? offset : 0, 0);
    const pageValues = [...values, safeLimit, safeOffset];
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const result = await client.query(
        `select id, actor_type as "actorType", actor_id as "actorId", action, resource_type as "resourceType",
                resource_id as "resourceId", metadata, created_at as "createdAt"
         from audit_logs ${where}
         order by created_at desc, id desc limit $${pageValues.length - 1} offset $${pageValues.length}`,
        pageValues,
      );
      const count = await client.query<{ total: string }>(`select count(*)::text as total from audit_logs ${where}`, values);
      return { rows: result.rows, total: parseDatabaseCount(count.rows[0]?.total ?? '0', '审计日志总数'), limit: safeLimit, offset: safeOffset };
    });
  }
}
