import { BadRequestException, Body, ConflictException, Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from './audit.service';
import { DatabaseService } from '../database/database.service';
import { parseDatabaseCount, parsePagination } from '../pagination';

type RestrictionStatus = 'active' | 'scheduled' | 'expired' | 'revoked';

interface RestrictionRow {
  id: string;
  userId: string;
  nickname: string | null;
  reason: string;
  startsAt: Date;
  endsAt: Date | null;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  effectiveStatus: RestrictionStatus;
}

class CreateDiscussionRestrictionDto {
  @IsUUID() userId!: string;
  @IsString() @MinLength(2) @MaxLength(200) reason!: string;
  @IsOptional() @IsDateString() endsAt?: string | null;
}

const restrictionColumns = `restriction.id, restriction.user_id as "userId", users.nickname,
  restriction.reason, restriction.starts_at as "startsAt", restriction.ends_at as "endsAt",
  restriction.created_by as "createdBy", restriction.created_at as "createdAt",
  restriction.revoked_at as "revokedAt", restriction.revoked_by as "revokedBy",
  case
    when restriction.revoked_at is not null then 'revoked'
    when restriction.starts_at > now() then 'scheduled'
    when restriction.ends_at is not null and restriction.ends_at <= now() then 'expired'
    else 'active'
  end as "effectiveStatus"`;

const statuses: RestrictionStatus[] = ['active', 'scheduled', 'expired', 'revoked'];

@Controller('admin/discussion-restrictions')
@UseGuards(AdminAuthGuard)
export class AdminDiscussionRestrictionController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Query('status') statusValue?: string,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    const status = statusValue?.trim() || '';
    if (status && !statuses.includes(status as RestrictionStatus)) throw new BadRequestException('限制状态筛选无效');
    const statusSql = `case
      when restriction.revoked_at is not null then 'revoked'
      when restriction.starts_at > now() then 'scheduled'
      when restriction.ends_at is not null and restriction.ends_at <= now() then 'expired'
      else 'active'
    end`;
    const where = status ? `where ${statusSql} = $1` : '';
    const values: unknown[] = status ? [status] : [];
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '讨论限制分页' });
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageValues = [...values, limit, offset];
      const [records, count, summaryResult] = await Promise.all([
        client.query<RestrictionRow>(
          `select ${restrictionColumns}
           from discussion_user_restrictions restriction
           left join users on users.id = restriction.user_id
           ${where}
           order by restriction.created_at desc, restriction.id desc
           limit $${pageValues.length - 1} offset $${pageValues.length}`, pageValues,
        ),
        client.query<{ total: string }>(
          `select count(*)::text as total from discussion_user_restrictions restriction ${where}`, values,
        ),
        client.query<{ effectiveStatus: RestrictionStatus; total: string }>(
          `select ${statusSql} as "effectiveStatus", count(*)::text as total
           from discussion_user_restrictions restriction group by 1`,
        ),
      ]);
      const summary: Record<RestrictionStatus, number> = { active: 0, scheduled: 0, expired: 0, revoked: 0 };
      for (const row of summaryResult.rows) summary[row.effectiveStatus] = parseDatabaseCount(row.total, '限制状态数量');
      return {
        items: records.rows,
        total: parseDatabaseCount(count.rows[0]?.total ?? '0', '讨论限制总数'),
        limit,
        offset,
        summary,
      };
    });
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() request: Request & { user?: { sub: string } }, @Body() body: CreateDiscussionRestrictionDto) {
    const reason = body.reason.trim();
    if (reason.length < 2 || reason.length > 200) throw new BadRequestException('限制原因需为 2–200 个字');
    let endsAt: Date | null = null;
    if (body.endsAt) {
      endsAt = new Date(body.endsAt);
      if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= Date.now()) throw new BadRequestException('结束时间必须晚于当前时间');
    }
    const actor = request.user?.sub || 'admin:unknown';
    return this.database.withTransaction(async (client) => {
      const user = await client.query<{ id: string; nickname: string | null }>(
        `select id, nickname from users where id = $1 for update`, [body.userId],
      );
      const target = user.rows[0];
      if (!target) throw new NotFoundException('用户不存在');
      const duplicate = await client.query<{ id: string }>(
        `select id from discussion_user_restrictions
         where user_id = $1 and revoked_at is null and (ends_at is null or ends_at > now())
         limit 1`, [body.userId],
      );
      if (duplicate.rows[0]) throw new ConflictException({ code: 'discussion_restriction_exists', message: '该用户已有生效中的讨论限制' });
      const result = await client.query<Omit<RestrictionRow, 'nickname'>>(
        `insert into discussion_user_restrictions (user_id, reason, ends_at, created_by)
         values ($1, $2, $3, $4)
         returning id, user_id as "userId", reason, starts_at as "startsAt", ends_at as "endsAt",
                   created_by as "createdBy", created_at as "createdAt", revoked_at as "revokedAt",
                   revoked_by as "revokedBy", 'active'::text as "effectiveStatus"`,
        [body.userId, reason, endsAt, actor],
      );
      const created = result.rows[0];
      if (!created) throw new ConflictException('限制暂时无法创建');
      await this.audit.record({ actorType: 'admin', actorId: actor, action: 'discussion_restriction.created', resourceType: 'discussion_user_restriction', resourceId: created.id, metadata: { userId: body.userId, reason, endsAt: endsAt?.toISOString() ?? null } }, client);
      return { ...created, nickname: target.nickname };
    });
  }

  @Patch(':id/revoke')
  @Header('Cache-Control', 'no-store')
  async revoke(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    const actor = request.user?.sub || 'admin:unknown';
    return this.database.withTransaction(async (client) => {
      const existing = await client.query<RestrictionRow>(
        `select ${restrictionColumns}
         from discussion_user_restrictions restriction
         left join users on users.id = restriction.user_id
         where restriction.id = $1 for update of restriction`, [id],
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (row.revokedAt) return row;
      const result = await client.query<Omit<RestrictionRow, 'nickname'>>(
        `update discussion_user_restrictions
         set revoked_at = now(), revoked_by = $1
         where id = $2
         returning id, user_id as "userId", reason, starts_at as "startsAt", ends_at as "endsAt",
                   created_by as "createdBy", created_at as "createdAt", revoked_at as "revokedAt",
                   revoked_by as "revokedBy", 'revoked'::text as "effectiveStatus"`, [actor, id],
      );
      const updated = result.rows[0];
      if (!updated) return null;
      await this.audit.record({ actorType: 'admin', actorId: actor, action: 'discussion_restriction.revoked', resourceType: 'discussion_user_restriction', resourceId: id, metadata: { userId: row.userId, previousStatus: row.effectiveStatus } }, client);
      return { ...updated, nickname: row.nickname };
    });
  }
}
