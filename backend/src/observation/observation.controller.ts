import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Header, InternalServerErrorException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { accountDeletedException } from '../auth/auth-errors';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { AuditService } from '../admin/audit.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import { parseDatabaseCount, parsePagination } from '../pagination';

interface ObservationRow {
  id: string;
  revision: number;
  method: 'reality' | 'season';
  status: 'draft' | 'saved' | 'deleted';
  issueCode: string | null;
  issueLabel: string | null;
  issueQuestion: string | null;
  clientDraftId: string | null;
  answers: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const observationColumns = `id, method, status, issue_code as "issueCode",
  issue_label_snapshot as "issueLabel", issue_question_snapshot as "issueQuestion",
  client_draft_id as "clientDraftId", revision, answers, created_at as "createdAt", updated_at as "updatedAt"`;

class CreateObservationDto {
  @IsIn(['reality', 'season'])
  method!: 'reality' | 'season';

  @IsObject()
  answers!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  issueCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientDraftId?: string;

  @IsOptional()
  @IsIn(['draft'])
  status?: 'draft';
}

class UpdateObservationDto {
  @IsOptional() @IsInt() @Min(1) revision?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['draft', 'saved']) status?: 'draft' | 'saved';
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
}

@Controller('observations')
@UseGuards(UserAuthGuard)
export class ObservationController {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly config: ConfigService, private readonly encryption: DataEncryptionService) {}

  private async lockUser(client: Pick<PoolClient, 'query'>, userId: string, mode: 'share' | 'update' = 'share') {
    const result = await client.query(`select id from users where id = $1 for ${mode}`, [userId]);
    if (!result.rows[0]) throw accountDeletedException();
  }

  private normalizeAnswers(method: 'reality' | 'season', answers: Record<string, unknown>, preserveTransient = false) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new BadRequestException('观察答案格式无效');
    const allowed = method === 'reality'
      ? ['situation', 'body', 'need', 'nextAction']
      : ['birthDate', 'experience', 'season', 'seasonNote', 'seasonStates', 'seasonStatesDetail', 'seasonInsight', 'keepUnderstanding', 'rejectUnderstanding', 'sevenDayAction'];
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(answers)) {
      if (!allowed.includes(key) || typeof value !== 'string') throw new BadRequestException('观察答案字段无效');
      if (value.length > 1000) throw new BadRequestException('单项观察答案不能超过 1000 字');
      normalized[key] = value;
    }
    if (!preserveTransient && method === 'season' && this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') !== 'true') {
      delete normalized.birthDate;
    }
    return normalized;
  }

  private decryptAnswers(value: unknown) {
    try {
      const answers = this.encryption.decryptJson(value);
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('answers_not_object');
      return answers as Record<string, unknown>;
    } catch {
      throw new InternalServerErrorException('观察数据无法解密');
    }
  }

  private answerPreview(method: 'reality' | 'season', value: unknown) {
    try {
      const answers = this.decryptAnswers(value);
      const field = method === 'reality' ? 'situation' : 'experience';
      const answer = answers[field];
      return typeof answer === 'string' ? answer.trim().slice(0, 80) : '';
    } catch {
      return '';
    }
  }

  private assertCompleteAnswers(method: 'reality' | 'season', answers: Record<string, unknown>) {
    // 四时气韵：仅「七天行动」必填，其余（经历描述、与底色的关系、四季状态、补充说明）均为可选项。
    const required = method === 'reality'
      ? ['situation', 'body', 'need', 'nextAction']
      : ['birthDate', 'sevenDayAction'];
    if (required.some((field) => typeof answers[field] !== 'string' || !answers[field].trim())) {
      throw new BadRequestException('请完成全部观察步骤后再保存');
    }
    if (method === 'season') {
      const birthDate = String(answers.birthDate);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
      const year = match ? Number(match[1]) : 0;
      const month = match ? Number(match[2]) : 0;
      const day = match ? Number(match[3]) : 0;
      const parsed = match ? new Date(`${birthDate}T00:00:00.000Z`) : new Date(Number.NaN);
      const now = new Date();
      const currentDate = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (year < 1 || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || birthDate > currentDate) {
        throw new BadRequestException('生日日期格式无效');
      }
    }
  }

  private sanitizeStoredRecord<T extends { method?: 'reality' | 'season'; answers?: unknown }>(record: T) {
    let hydrated: T = record;
    if (record.answers !== undefined) {
      hydrated = { ...record, answers: this.decryptAnswers(record.answers) };
    }
    if (hydrated.method !== 'season' || this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') === 'true' || !hydrated.answers || typeof hydrated.answers !== 'object') return hydrated;
    const answers = { ...(hydrated.answers as Record<string, unknown>) };
    delete answers.birthDate;
    return { ...hydrated, answers };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: Request & { user?: { sub: string } }, @Query('limit') limitValue?: string, @Query('offset') offsetValue?: string) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 30, maxLimit: 50, label: '观察记录分页' });
    return this.database.withTransaction(async (client) => {
      // Keep the visible page and total count on one cloud snapshot. The
      // user-facing list must not mix rows from before and after a deletion.
      await client.query('set transaction isolation level repeatable read');
      await this.lockUser(client, userId);
      const items = await client.query<{
        id: string; method: 'reality' | 'season'; status: 'draft' | 'saved'; issueCode: string | null;
        issueLabel: string | null; issueQuestion: string | null; revision: number; answers: unknown;
        createdAt: Date; updatedAt: Date;
      }>(
        `select id, method, status, issue_code as "issueCode",
                issue_label_snapshot as "issueLabel", issue_question_snapshot as "issueQuestion",
                revision, answers, created_at as "createdAt", updated_at as "updatedAt"
         from observations where user_id = $1 and status <> 'deleted'
         order by updated_at desc, id desc limit $2 offset $3`, [userId, limit, offset],
      );
      const count = await client.query<{ total: string }>(
        `select count(*)::text as total from observations where user_id = $1 and status <> 'deleted'`, [userId],
      );
      return {
        items: items.rows.map((row) => {
          const { answers, ...metadata } = row;
          return { ...metadata, preview: this.answerPreview(row.method, answers) };
        }),
        total: parseDatabaseCount(count.rows[0]?.total ?? '0', '观察记录总数'), limit, offset,
      };
    });
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() request: Request & { user?: { sub: string } }, @Body() body: CreateObservationDto) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    const issueCode = body.issueCode?.trim() || undefined;
    const clientDraftId = body.clientDraftId?.trim() || undefined;
    const answers = this.normalizeAnswers(body.method, body.answers);
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const recoverExisting = async () => {
        const existing = await client.query<ObservationRow>(
          `select ${observationColumns} from observations
           where user_id = $1 and client_draft_id = $2 for update`, [userId, clientDraftId],
        );
        const row = existing.rows[0];
        if (!row) return null;
        if (row.status === 'deleted' || row.method !== body.method || (row.issueCode || null) !== (issueCode || null)) {
          throw new ConflictException('草稿标识已用于其他观察，请重新开始观察');
        }
        return { ...this.sanitizeStoredRecord(row), created: false };
      };
      if (clientDraftId) {
        // Serialize first creation/recovery across API instances. Recovery must
        // precede publication checks: its immutable snapshot may now be archived.
        await client.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`observation-create:${userId}`, clientDraftId]);
        const recovered = await recoverExisting();
        if (recovered) return recovered;
      }
      let issueLabel: string | null = null;
      let issueQuestion: string | null = null;
      if (issueCode) {
        const issue = await client.query<{ label: string; question: string }>(
          `select coalesce(publication.snapshot->'issue'->>'label', issue.label) as label,
                  coalesce(publication.snapshot->'issue'->>'question', issue.question) as question
           from content_issues issue
           left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
           where issue.status = 'published' and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)`, [issueCode],
        );
        if (!issue.rows[0]) throw new BadRequestException('只能关联已发布的本期问题');
        issueLabel = issue.rows[0].label;
        issueQuestion = issue.rows[0].question;
      }
      const result = await client.query<ObservationRow>(
        `insert into observations (user_id, method, issue_code, issue_label_snapshot, issue_question_snapshot, client_draft_id, status, answers)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, client_draft_id) where client_draft_id is not null do nothing
         returning ${observationColumns}`,
        [userId, body.method, issueCode ?? null, issueLabel, issueQuestion, clientDraftId ?? null, body.status ?? 'draft', JSON.stringify(this.encryption.encryptJson(answers))],
      );
      if (result.rows[0]) {
        await this.audit.record({ actorType: 'user', actorId: userId, action: 'observation.created', resourceType: 'observation', resourceId: result.rows[0].id, metadata: { method: body.method, status: body.status ?? 'draft', issueCode: issueCode ?? null } }, client);
        return { ...this.sanitizeStoredRecord(result.rows[0]), created: true };
      }
      if (clientDraftId) {
        const recovered = await recoverExisting();
        if (recovered) return recovered;
      }
      throw new ConflictException('云端草稿暂时无法确认，请重试');
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query<ObservationRow>(
        `select ${observationColumns}
         from observations where id = $1 and user_id = $2 and status <> 'deleted'`, [id, userId],
      );
      const record = result.rows[0];
      if (!record) return null;
      const hydrated = this.sanitizeStoredRecord(record);
      // 记录详情需要展示「01 底色」对应的生命牌，按保存的生日反查。
      const lifeCard = await this.lookupLifeCard(client, hydrated);
      return lifeCard ? { ...hydrated, lifeCard } : hydrated;
    });
  }

  /** 根据四时气韵记录里的生日（YYYY-MM-DD）查询对应生命牌。 */
  private async lookupLifeCard(client: PoolClient, record: { method?: 'reality' | 'season'; answers?: unknown }) {
    if (record.method !== 'season' || !record.answers || typeof record.answers !== 'object' || Array.isArray(record.answers)) return null;
    const answers = record.answers as Record<string, unknown>;
    const birthDate = typeof answers.birthDate === 'string' ? answers.birthDate : '';
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthDate);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null;
    const card = await client.query<{ suit: string; rank: string; theme: string; title: string; summary: string; note: string }>(
      `select suit, rank, theme, title, summary, note from content_life_cards where month = $1 and day = $2`,
      [month, day],
    );
    if (!card.rows[0]) return null;
    return { month, day, ...card.rows[0] };
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  async update(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateObservationDto) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const existing = await client.query<ObservationRow>(
        `select ${observationColumns} from observations where id = $1 and user_id = $2 and status <> 'deleted' for update`, [id, userId],
      );
      const row = existing.rows[0];
      if (!row) return null;
      // Keep transient birthday input long enough to validate a final season
      // submission, but strip it from the encrypted payload when persistence is
      // disabled. A saved retry may still compare the sanitized payload.
      const submittedAnswers = body.answers !== undefined
        ? this.normalizeAnswers(row.method, body.answers, body.status === 'saved')
        : null;
      let answers = body.answers !== undefined ? this.normalizeAnswers(row.method, body.answers) : null;
      if (row.status === 'saved') {
        const sameSavedSubmission = body.status === 'saved' && answers !== null && isDeepStrictEqual(
          answers, this.normalizeAnswers(row.method, this.decryptAnswers(row.answers)),
        );
        // A lost final response can be retried without updating timestamps,
        // encrypting again, or producing duplicate completion audits.
        if (sameSavedSubmission || (body.answers === undefined && body.status !== 'draft')) {
          return this.sanitizeStoredRecord(row);
        }
        if (body.status !== 'saved' || body.answers === undefined) {
          throw new ConflictException('修改已保存记录时必须提交完整答案与保存状态');
        }
      }
      if (body.answers === undefined && body.status === undefined) return this.sanitizeStoredRecord(row);
      if (!Number.isSafeInteger(body.revision) || body.revision !== row.revision) {
        throw new ConflictException({ code: 'observation_changed', message: '这份云端草稿已在其他位置更新。请选择载入云端版本，或确认用本机回答覆盖云端草稿。' });
      }
      if (body.status === 'saved') {
        const answersToCheck = submittedAnswers ?? this.normalizeAnswers(row.method, this.decryptAnswers(row.answers), true);
        this.assertCompleteAnswers(row.method, answersToCheck);
        // Older drafts may still contain a birthday from before the storage
        // policy was disabled. A status-only finalization must not preserve it.
        if (answers === null && row.method === 'season' && this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') !== 'true') {
          answers = this.normalizeAnswers(row.method, answersToCheck);
        }
      }
      const result = await client.query<ObservationRow>(
        `update observations set status = coalesce($1, status), answers = coalesce($2, answers), revision = revision + 1, updated_at = now()
         where id = $3 and user_id = $4 returning ${observationColumns}`,
        [body.status ?? null, answers ? JSON.stringify(this.encryption.encryptJson(answers)) : null, id, userId],
      );
      if (result.rows[0] && row.status === 'draft' && body.status === 'saved') {
        await this.audit.record({ actorType: 'user', actorId: userId, action: 'observation.saved', resourceType: 'observation', resourceId: id, metadata: { method: row.method } }, client);
      } else if (result.rows[0] && row.status === 'saved' && body.status === 'saved' && answers !== null) {
        await this.audit.record({ actorType: 'user', actorId: userId, action: 'observation.updated', resourceType: 'observation', resourceId: id, metadata: { method: row.method } }, client);
      }
      return result.rows[0] ? this.sanitizeStoredRecord(result.rows[0]) : null;
    });
  }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  async remove(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    return this.database.withTransaction(async (client) => {
      await this.lockUser(client, userId);
      const result = await client.query(
        `delete from observations where id = $1 and user_id = $2 returning id`, [id, userId],
      );
      if (result.rows[0]) await this.audit.record({ actorType: 'user', actorId: userId, action: 'observation.deleted', resourceType: 'observation', resourceId: id }, client);
      return { deleted: Boolean(result.rows[0]) };
    });
  }
}
