import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from './audit.service';
import { DatabaseService } from '../database/database.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import { parseDatabaseCount, parsePagination } from '../pagination';

@Controller('admin/observations')
@UseGuards(AdminAuthGuard)
export class AdminObservationController {
  constructor(
    private readonly database: DatabaseService,
    private readonly encryption: DataEncryptionService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private draftRetentionDays() {
    const configuredDays = Number(this.config.get('OBSERVATION_DRAFT_RETENTION_DAYS', 90));
    return Number.isInteger(configuredDays) && configuredDays > 0 ? Math.min(configuredDays, 3_650) : 90;
  }

  @Get('lifecycle')
  @Header('Cache-Control', 'no-store')
  async lifecycle() {
    const retentionDays = this.draftRetentionDays();
    const result = await this.database.query<{
      draftCount: string;
      savedCount: string;
      realityCount: string;
      seasonCount: string;
      wellFormedEnvelopeCount: string;
      legacyPlaintextCount: string;
      invalidEnvelopeCount: string;
      staleDraftCount: string;
      oldestDraftAt: string | null;
    }>(
      `select
         count(*) filter (where status = 'draft')::text as "draftCount",
         count(*) filter (where status = 'saved')::text as "savedCount",
         count(*) filter (where method = 'reality')::text as "realityCount",
         count(*) filter (where method = 'season')::text as "seasonCount",
         count(*) filter (where coalesce(
           answers->>'_encrypted' = 'true' and answers->>'v' in ('1', '2')
           and jsonb_typeof(answers->'data') = 'string', false
         ))::text as "wellFormedEnvelopeCount",
         count(*) filter (where not (answers ? '_encrypted'))::text as "legacyPlaintextCount",
         count(*) filter (where answers ? '_encrypted' and not coalesce(
           answers->>'_encrypted' = 'true' and answers->>'v' in ('1', '2')
           and jsonb_typeof(answers->'data') = 'string', false
         ))::text as "invalidEnvelopeCount",
         count(*) filter (where status = 'draft' and updated_at < now() - make_interval(days => $1))::text as "staleDraftCount",
         min(updated_at) filter (where status = 'draft') as "oldestDraftAt"
       from observations where status <> 'deleted'`, [retentionDays],
    );
    const row = result.rows[0];
    return {
      retentionDays,
      draftCount: parseDatabaseCount(row?.draftCount ?? '0', '草稿总数'),
      savedCount: parseDatabaseCount(row?.savedCount ?? '0', '已保存观察总数'),
      realityCount: parseDatabaseCount(row?.realityCount ?? '0', '现实处境观察总数'),
      seasonCount: parseDatabaseCount(row?.seasonCount ?? '0', '四时气韵观察总数'),
      wellFormedEnvelopeCount: parseDatabaseCount(row?.wellFormedEnvelopeCount ?? '0', '有效加密数据总数'),
      legacyPlaintextCount: parseDatabaseCount(row?.legacyPlaintextCount ?? '0', '旧明文数据总数'),
      invalidEnvelopeCount: parseDatabaseCount(row?.invalidEnvelopeCount ?? '0', '无效加密数据总数'),
      staleDraftCount: parseDatabaseCount(row?.staleDraftCount ?? '0', '超期草稿总数'),
      oldestDraftAt: row?.oldestDraftAt ?? null,
    };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query('status') status?: string, @Query('issueCode') issueCode?: string, @Query('stale') staleValue?: string, @Query('limit') limitValue?: string, @Query('offset') offsetValue?: string, @Query('method') method?: string) {
    if (status && !['draft', 'saved'].includes(status)) throw new BadRequestException('观察状态筛选无效');
    if (method && !['reality', 'season'].includes(method)) throw new BadRequestException('观察方式筛选无效');
    if (staleValue !== undefined && !['true', 'false'].includes(staleValue)) throw new BadRequestException('超期草稿筛选无效');
    const normalizedIssueCode = issueCode?.trim() || undefined;
    if (normalizedIssueCode && normalizedIssueCode.length > 64) throw new BadRequestException('期刊编号筛选无效');
    const filters: string[] = ["o.status <> 'deleted'"];
    const values: unknown[] = [];
    if (status) {
      values.push(status);
      filters.push(`o.status = $${values.length}`);
    }
    if (method) {
      values.push(method);
      filters.push(`o.method = $${values.length}`);
    }
    if (normalizedIssueCode) {
      values.push(normalizedIssueCode);
      filters.push(`o.issue_code = $${values.length}`);
    }
    if (staleValue === 'true') {
      values.push(this.draftRetentionDays());
      filters.push(`o.status = 'draft' and o.updated_at < now() - make_interval(days => $${values.length})`);
    }
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '观察记录分页' });
    const pageValues: unknown[] = [...values, limit, offset];
    return this.database.withTransaction(async (client) => {
      // Keep the page and filtered total on one cloud snapshot so a concurrent
      // observation write cannot make the pagination contract self-contradictory.
      await client.query('set transaction isolation level repeatable read');
      const result = await client.query(
        `select o.id, o.method, o.status, o.issue_code as "issueCode",
              o.issue_label_snapshot as "issueLabel", o.issue_question_snapshot as "issueQuestion",
              o.created_at as "createdAt", o.updated_at as "updatedAt",
              o.user_id as "userId", u.nickname
         from observations o
              left join users u on u.id = o.user_id
        where ${filters.join(' and ')}
         order by o.updated_at desc, o.id desc limit $${pageValues.length - 1} offset $${pageValues.length}`, pageValues,
      );
      const count = await client.query<{ total: string }>(
        `select count(*)::text as total from observations o left join users u on u.id = o.user_id where ${filters.join(' and ')}`, values,
      );
      return { items: result.rows, total: parseDatabaseCount(count.rows[0]?.total ?? '0', '观察记录总数'), limit, offset };
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.database.withTransaction(async (client) => {
      const query = await client.query<{
        id: string; revision: number; method: 'reality' | 'season'; status: 'draft' | 'saved';
        issueCode: string | null; issueLabel: string | null; issueQuestion: string | null;
        createdAt: Date; updatedAt: Date; userId: string; nickname: string | null; answers: unknown;
      }>(
        `select o.id, o.revision, o.method, o.status, o.issue_code as "issueCode",
                o.issue_label_snapshot as "issueLabel", o.issue_question_snapshot as "issueQuestion",
                o.created_at as "createdAt", o.updated_at as "updatedAt", o.user_id as "userId", u.nickname, o.answers
         from observations o
          left join users u on u.id = o.user_id
          where o.id = $1 and o.status <> 'deleted'`, [id],
      );
      const row = query.rows[0];
      if (!row) return null;
      const answers = this.encryption.decryptJson(row.answers);
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new BadRequestException('观察答案格式无效');
      const safeAnswers = { ...(answers as Record<string, unknown>) };
      if (row.method === 'season' && this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') !== 'true') delete safeAnswers.birthDate;
      await this.audit.record({
        actorType: 'admin', actorId: request.user?.sub || 'admin:unknown', action: 'observation.admin.viewed',
        resourceType: 'observation', resourceId: id, metadata: { method: row.method, status: row.status },
      }, client);
      const { answers: _encryptedAnswers, ...metadata } = row;
      return { ...metadata, answers: safeAnswers };
    });
    return result;
  }

  @Post('reencrypt')
  @Header('Cache-Control', 'no-store')
  async reencrypt(@Req() request: Request & { user?: { sub: string } }, @Query('limit') limitValue?: string, @Query('afterUpdatedAt') afterUpdatedAt?: string, @Query('afterId') afterId?: string) {
    const { limit } = parsePagination(limitValue, undefined, { defaultLimit: 100, maxLimit: 200, label: '观察答案迁移分页' });
    const cursorDate = afterUpdatedAt?.trim() || null;
    const cursorId = afterId?.trim() || null;
    if (Boolean(cursorDate) !== Boolean(cursorId) || (cursorDate && Number.isNaN(new Date(cursorDate).getTime())) || (cursorId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursorId))) {
      throw new BadRequestException('观察加密迁移游标无效');
    }
    return this.database.withTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-observation-reencrypt'))`);
      const page = await client.query<{ id: string; method: 'reality' | 'season'; answers: unknown; updatedAt: string }>(
        `select id, method, answers,
                to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAt"
         from observations
         where status <> 'deleted'
           and ($1::timestamptz is null or (updated_at, id) > ($1::timestamptz, $2::uuid))
         order by updated_at asc, id asc
         limit $3 for update`, [cursorDate, cursorId, limit + 1],
      );
      const rows = page.rows.slice(0, limit);
      let processed = 0;
      let failed = 0;
      let invalid = 0;
      for (const row of rows) {
        const state = this.encryption.reencryptionState(row.answers);
        if (state === 'current') {
          try {
            const currentAnswers = this.encryption.decryptJson(row.answers);
            if (!currentAnswers || typeof currentAnswers !== 'object' || Array.isArray(currentAnswers)) throw new Error('answers_not_object');
            if (row.method === 'season' && this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') !== 'true' && Object.prototype.hasOwnProperty.call(currentAnswers, 'birthDate')) {
              const sanitized = { ...(currentAnswers as Record<string, unknown>) };
              delete sanitized.birthDate;
              await client.query(
                `update observations set answers = $1::jsonb where id = $2`,
                [JSON.stringify(this.encryption.encryptJson(sanitized)), row.id],
              );
              processed += 1;
            }
          } catch {
            failed += 1;
          }
          continue;
        }
        if (state === 'invalid') { invalid += 1; continue; }
        try {
          const decrypted = this.encryption.decryptJson(row.answers);
          if (!decrypted || typeof decrypted !== 'object' || Array.isArray(decrypted)) throw new Error('answers_not_object');
          const answers = { ...(decrypted as Record<string, unknown>) };
          if (row.method === 'season' && this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') !== 'true') delete answers.birthDate;
          await client.query(
            `update observations set answers = $1::jsonb where id = $2`,
            [JSON.stringify(this.encryption.encryptJson(answers)), row.id],
          );
          processed += 1;
        } catch {
          failed += 1;
        }
      }
      if (rows.length) {
        await this.audit.record({
          actorType: 'admin',
          actorId: request.user?.sub || 'admin:unknown',
          action: 'observation.answers.reencrypted',
          resourceType: 'observation_batch',
          metadata: { processed, failed, invalid, scanned: rows.length, limit, activeKeyId: this.encryption.activeKeyId() },
        }, client);
      }
      const last = rows[rows.length - 1];
      const hasMore = page.rows.length > limit;
      return {
        processed,
        failed,
        invalid,
        scanned: rows.length,
        limit,
        activeKeyId: this.encryption.activeKeyId(),
        hasMore,
        nextCursor: hasMore && last ? { updatedAt: last.updatedAt, id: last.id } : null,
      };
    });
  }
}
