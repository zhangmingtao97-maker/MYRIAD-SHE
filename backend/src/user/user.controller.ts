import { BadRequestException, Body, Controller, Delete, Get, Header, InternalServerErrorException, Optional, Patch, Post, Req, ServiceUnavailableException, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsObject, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { accountDeletedException } from '../auth/auth-errors';
import { AuditService } from '../admin/audit.service';
import { DataEncryptionService } from '../security/data-encryption.service';
import type { EncryptionPurpose } from '../security/data-encryption.service';
import { AuthService } from '../auth/auth.service';
import { StorageService } from '../storage/storage.service';

class UpdateSettingsDto {
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() notificationsEnabled?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() analyticsEnabled?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsObject() preferences?: Record<string, unknown>;
}

class UpdateProfileDto {
  @IsString() @MinLength(1) @MaxLength(32) nickname!: string;
}

class PhoneNumberDto {
  @IsString() @MinLength(1) @MaxLength(256) code!: string;
}

type MemberProfileRow = { nickname: string | null; avatarObjectKey: string | null; phoneEncrypted: unknown };
type AvatarFile = { buffer: Buffer; mimetype: string };
const phoneEncryptionPurpose: EncryptionPurpose = 'user.phone';
const avatarMaxBytes = 2 * 1024 * 1024;

function avatarContentType(file?: AvatarFile): 'image/jpeg' | 'image/png' | 'image/webp' {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0 || buffer.byteLength > avatarMaxBytes) {
    throw new BadRequestException('头像文件无效或超过 2 MB');
  }
  const detected = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ? 'image/jpeg'
    : buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? 'image/png'
      : buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : null;
  if (!detected || file?.mimetype?.toLowerCase() !== detected) throw new BadRequestException('头像仅支持 JPEG、PNG 或 WebP 图片');
  return detected;
}

@Controller('me')
@UseGuards(UserAuthGuard)
export class UserController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly encryption: DataEncryptionService,
    @Optional() private readonly auth?: AuthService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  private deletionEnabled() {
    return this.config.get<string>('ACCOUNT_DELETION_ENABLED', 'true') === 'true';
  }

  private isSerializationConflict(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '40001');
  }

  private userId(request: Request & { user?: { sub: string } }) {
    const id = request.user?.sub;
    if (!id) throw new UnauthorizedException('需要用户身份');
    return id;
  }

  private storedSettings(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private publicSettings(value: unknown) {
    const settings = this.storedSettings(value);
    const preferences = settings.preferences;
    let safePreferences: Record<string, unknown> = {};
    if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
      try {
        const serialized = JSON.stringify(preferences);
        if (serialized && Buffer.byteLength(serialized, 'utf8') <= 16 * 1024) safePreferences = preferences as Record<string, unknown>;
      } catch {
        safePreferences = {};
      }
    }
    return {
      notificationsEnabled: settings.notificationsEnabled === true,
      analyticsEnabled: settings.analyticsEnabled === true,
      preferences: safePreferences,
    };
  }

  private async profileResponse(row: MemberProfileRow) {
    let phoneNumber: string | null = null;
    if (row.phoneEncrypted) {
      try {
        const decrypted = this.encryption.decryptJson(row.phoneEncrypted, phoneEncryptionPurpose);
        if (typeof decrypted === 'string') phoneNumber = decrypted;
      } catch {
        throw new InternalServerErrorException('账号资料暂时无法读取');
      }
    }
    let avatarUrl: string | null = null;
    if (row.avatarObjectKey && this.storage) {
      try { avatarUrl = (await this.storage.createDownloadUrl(row.avatarObjectKey)).url; }
      catch { avatarUrl = null; }
    }
    return { nickname: row.nickname ?? '', avatarUrl, phoneNumber };
  }

  @Get('profile')
  @Header('Cache-Control', 'no-store')
  async profile(@Req() request: Request & { user?: { sub: string } }) {
    return this.readProfile(this.userId(request));
  }

  private async readProfile(userId: string) {
    const result = await this.database.query<MemberProfileRow>(
      `select nickname, avatar_object_key as "avatarObjectKey", phone_encrypted as "phoneEncrypted"
       from users where id = $1`, [userId],
    );
    if (!result.rows[0]) throw accountDeletedException();
    return this.profileResponse(result.rows[0]);
  }

  @Patch('profile')
  @Header('Cache-Control', 'no-store')
  async updateProfile(@Req() request: Request & { user?: { sub: string } }, @Body() body: UpdateProfileDto) {
    const userId = this.userId(request);
    const nickname = body.nickname.trim();
    if (!nickname || nickname.length > 32) throw new BadRequestException('昵称长度需为 1 至 32 个字符');
    await this.database.withTransaction(async (client) => {
      const update = await client.query(
        `update users set nickname = $1, updated_at = now() where id = $2 returning id`, [nickname, userId],
      );
      if (!update.rows[0]) throw accountDeletedException();
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'user.profile.updated', resourceType: 'user_profile', resourceId: userId, metadata: { fields: ['nickname'] } }, client);
    });
    return this.readProfile(userId);
  }

  @Post('profile/avatar')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: avatarMaxBytes, files: 1 } }))
  async updateAvatar(@Req() request: Request & { user?: { sub: string } }, @UploadedFile() file?: AvatarFile) {
    const userId = this.userId(request);
    if (!this.storage) throw new ServiceUnavailableException('头像服务暂时不可用');
    const contentType = avatarContentType(file);
    const objectKey = await this.storage.saveUserAvatar(userId, file!.buffer, contentType);
    let oldObjectKey: string | null = null;
    try {
      await this.database.withTransaction(async (client) => {
        const current = await client.query<{ avatarObjectKey: string | null }>(
          `select avatar_object_key as "avatarObjectKey" from users where id = $1 for update`, [userId],
        );
        if (!current.rows[0]) throw accountDeletedException();
        oldObjectKey = current.rows[0].avatarObjectKey;
        await client.query(`update users set avatar_object_key = $1, updated_at = now() where id = $2`, [objectKey, userId]);
        await this.audit.record({ actorType: 'user', actorId: userId, action: 'user.profile.updated', resourceType: 'user_profile', resourceId: userId, metadata: { fields: ['avatar'] } }, client);
      });
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
    if (oldObjectKey && oldObjectKey !== objectKey) await this.storage.deleteObject(oldObjectKey).catch(() => undefined);
    return this.readProfile(userId);
  }

  @Post('phone-number')
  @Header('Cache-Control', 'no-store')
  async updatePhoneNumber(@Req() request: Request & { user?: { sub: string } }, @Body() body: PhoneNumberDto) {
    const userId = this.userId(request);
    if (!this.auth) throw new ServiceUnavailableException('微信手机号服务暂时不可用');
    const phoneNumber = await this.auth.wechatPhoneNumber(body.code);
    const encrypted = JSON.stringify(this.encryption.encryptJson(phoneNumber, phoneEncryptionPurpose));
    await this.database.withTransaction(async (client) => {
      const update = await client.query(
        `update users set phone_encrypted = $1::jsonb, phone_last4 = right($2, 4), phone_verified_at = now(), updated_at = now()
         where id = $3 returning id`, [encrypted, phoneNumber, userId],
      );
      if (!update.rows[0]) throw accountDeletedException();
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'user.phone_number.updated', resourceType: 'user_profile', resourceId: userId, metadata: { last4: phoneNumber.slice(-4) } }, client);
    });
    return this.readProfile(userId);
  }

  private sanitizeExportAnswers(method: 'reality' | 'season', value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InternalServerErrorException('观察数据暂时无法导出，请稍后重试');
    }
    const allowed = method === 'season'
      ? ['birthDate', 'experience', 'season', 'sevenDayAction']
      : ['situation', 'body', 'need', 'nextAction'];
    const source = value as Record<string, unknown>;
    const sanitized: Record<string, string> = {};
    for (const key of allowed) {
      if (!(key in source)) continue;
      const answer = source[key];
      if (typeof answer !== 'string' || answer.length > 1000) {
        throw new InternalServerErrorException('观察数据暂时无法导出，请稍后重试');
      }
      sanitized[key] = answer;
    }
    return sanitized;
  }

  @Get('settings')
  @Header('Cache-Control', 'no-store')
  async settings(@Req() request: Request & { user?: { sub: string } }) {
    const userId = this.userId(request);
    return this.database.withTransaction(async (client) => {
      const result = await client.query(`select settings from users where id = $1 for share`, [userId]);
      if (!result.rows[0]) throw accountDeletedException();
      return this.publicSettings(result.rows[0].settings);
    });
  }

  @Patch('settings')
  @Header('Cache-Control', 'no-store')
  async updateSettings(@Req() request: Request & { user?: { sub: string } }, @Body() body: UpdateSettingsDto) {
    const userId = this.userId(request);
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > 16 * 1024) throw new BadRequestException('用户设置不能超过 16 KB');
    return this.database.withTransaction(async (client) => {
      const user = await client.query(`select id from users where id = $1 for update`, [userId]);
      if (!user.rows[0]) throw accountDeletedException();
      const result = await client.query(
        `update users set settings = coalesce(settings, '{}'::jsonb) || $1::jsonb, updated_at = now()
         where id = $2 returning settings`, [serialized, userId],
      );
      if (!result.rows[0]) throw accountDeletedException();
      await this.audit.record({ actorType: 'user', actorId: userId, action: 'user.settings.updated', resourceType: 'user_settings', resourceId: userId, metadata: { fields: Object.keys(body) } }, client);
      return this.publicSettings(result.rows[0].settings);
    });
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  async exportData(@Req() request: Request & { user?: { sub: string } }) {
    const userId = this.userId(request);
    const runExport = () => this.database.withTransaction(async (client) => {
      // Export is a point-in-time cloud snapshot. Without an explicit
      // transaction snapshot, settings, observations and deletion state are
      // each read under separate READ COMMITTED snapshots while another
      // request may still be writing the same account.
      await client.query('set transaction isolation level repeatable read');
      const user = await client.query<{ settings: Record<string, unknown>; createdAt: string; nickname: string | null; avatarObjectKey: string | null; phoneEncrypted: unknown }>(
        `select settings, created_at as "createdAt", nickname, avatar_object_key as "avatarObjectKey",
                phone_encrypted as "phoneEncrypted" from users where id = $1 for share`, [userId],
      );
      if (!user.rows[0]) throw accountDeletedException();
      const records = await client.query<{
        id: string;
        method: 'reality' | 'season';
        status: 'draft' | 'saved';
        issueCode: string | null;
        issueLabel: string | null;
        issueQuestion: string | null;
        answers: unknown;
        createdAt: string;
        updatedAt: string;
      }>(
        `select id, method, status, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
                issue_question_snapshot as "issueQuestion", answers,
                created_at as "createdAt", updated_at as "updatedAt"
         from observations where user_id = $1 and status <> 'deleted'
         order by created_at asc, id asc for share`, [userId],
      );
      const observations = records.rows.map((record) => {
        let answers: unknown;
        try {
          answers = this.encryption.decryptJson(record.answers);
          if (record.method === 'season' && this.config.get<string>('SEASON_SAVE_BIRTH_DATE', 'false') !== 'true' && answers && typeof answers === 'object' && !Array.isArray(answers)) {
            const sanitized = { ...(answers as Record<string, unknown>) };
            delete sanitized.birthDate;
            answers = sanitized;
          }
          answers = this.sanitizeExportAnswers(record.method, answers);
        } catch {
          throw new InternalServerErrorException('观察数据暂时无法导出，请稍后重试');
        }
        return { ...record, answers };
      });
      const contributionRecords = await client.query<{
        id: string;
        issueCode: string;
        issueLabel: string;
        threadId: string;
        threadAuthor: string | null;
        body: unknown;
        status: 'pending' | 'handled' | 'dismissed';
        createdAt: string;
        updatedAt: string;
      }>(
        `select id, issue_code as "issueCode", issue_label_snapshot as "issueLabel",
                thread_id as "threadId", thread_author_snapshot as "threadAuthor", body, status,
                created_at as "createdAt", updated_at as "updatedAt"
         from discussion_contributions where user_id = $1 order by created_at asc, id asc for share`, [userId],
      );
      const discussionContributions = contributionRecords.rows.map((record) => {
        try {
          const payload = this.encryption.decryptJson(record.body);
          if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof (payload as Record<string, unknown>).body !== 'string') throw new Error('invalid_contribution_body');
          const body = (payload as { body: string }).body;
          if (body.length > 2_000) throw new Error('oversized_contribution_body');
          return { ...record, body };
        } catch {
          throw new InternalServerErrorException('用户经历暂时无法导出，请稍后重试');
        }
      });
      const deletion = await client.query(
        `select status, requested_at as "requestedAt", scheduled_for as "scheduledFor",
                cancelled_at as "cancelledAt", completed_at as "completedAt"
         from privacy_requests where user_id = $1 order by requested_at desc, id desc limit 1`, [userId],
      );
      await this.audit.record({
        actorType: 'user',
        actorId: userId,
        action: 'privacy.data.exported',
        resourceType: 'user_export',
        metadata: { observationCount: observations.length, discussionContributionCount: discussionContributions.length },
      }, client);
      let accountPhoneNumber: string | null = null;
      if (user.rows[0].phoneEncrypted) {
        try {
          const decrypted = this.encryption.decryptJson(user.rows[0].phoneEncrypted, phoneEncryptionPurpose);
          if (typeof decrypted === 'string') accountPhoneNumber = decrypted;
        } catch {
          throw new InternalServerErrorException('用户资料暂时无法导出，请稍后重试');
        }
      }
      let accountAvatarUrl: string | null = null;
      if (user.rows[0].avatarObjectKey && this.storage) {
        try { accountAvatarUrl = (await this.storage.createDownloadUrl(user.rows[0].avatarObjectKey)).url; }
        catch { accountAvatarUrl = null; }
      }
      return {
        exportVersion: 1,
        generatedAt: new Date().toISOString(),
        account: { createdAt: user.rows[0].createdAt, nickname: user.rows[0].nickname ?? '', avatarUrl: accountAvatarUrl, phoneNumber: accountPhoneNumber },
        settings: this.publicSettings(user.rows[0].settings),
        observations,
        discussionContributions,
        deletionRequest: deletion.rows[0] ?? null,
      };
    });
    try {
      return await runExport();
    } catch (error) {
      // A deletion transaction that committed while the snapshot was waiting
      // on the account row can produce SQLSTATE 40001. Retry once so the
      // second transaction returns the stable account-deleted result instead
      // of leaking a transient database serialization failure.
      if (!this.isSerializationConflict(error)) throw error;
      return runExport();
    }
  }

  @Get('deletion-request')
  @Header('Cache-Control', 'no-store')
  async deletionRequest(@Req() request: Request & { user?: { sub: string } }) {
    const userId = this.userId(request);
    return this.database.withTransaction(async (client) => {
      const user = await client.query(`select 1 from users where id = $1 for share`, [userId]);
      if (!user.rows[0]) throw accountDeletedException();
      const result = await client.query(
        `select id, status, requested_at as "requestedAt", scheduled_for as "scheduledFor", completed_at as "completedAt",
                status = 'pending' and scheduled_for > clock_timestamp() as "canCancel"
         from privacy_requests where user_id = $1 order by requested_at desc, id desc limit 1`, [userId],
      );
      return result.rows[0] ?? null;
    });
  }

  @Post('deletion-request')
  @Header('Cache-Control', 'no-store')
  async requestDeletion(@Req() request: Request & { user?: { sub: string } }) {
    if (!this.deletionEnabled()) throw new ServiceUnavailableException('账户删除功能暂未开启');
    const userId = this.userId(request);
    const configuredGraceDays = Number(this.config.get('ACCOUNT_DELETION_GRACE_DAYS', 7));
    const graceDays = Number.isFinite(configuredGraceDays) ? Math.min(Math.max(Math.floor(configuredGraceDays), 1), 3_650) : 7;
    return this.database.withTransaction(async (client) => {
      const user = await client.query(`select 1 from users where id = $1 for share`, [userId]);
      if (!user.rows[0]) throw accountDeletedException();
      const result = await client.query(
        `insert into privacy_requests (user_id, status, scheduled_for)
         values ($1, 'pending', now() + make_interval(days => $2))
         on conflict (user_id) where status = 'pending' do nothing
         returning id, status, requested_at as "requestedAt", scheduled_for as "scheduledFor",
                   scheduled_for > clock_timestamp() as "canCancel"`,
        [userId, graceDays],
      );
      if (result.rows[0]) {
        await this.audit.record({ actorType: 'user', actorId: userId, action: 'privacy.deletion.requested', resourceType: 'privacy_request', resourceId: result.rows[0].id }, client);
        return result.rows[0];
      }
      const existing = await client.query(
        `select id, status, requested_at as "requestedAt", scheduled_for as "scheduledFor",
                scheduled_for > clock_timestamp() as "canCancel"
         from privacy_requests where user_id = $1 and status = 'pending' limit 1`, [userId],
      );
      return existing.rows[0] ?? null;
    });
  }

  @Delete('deletion-request')
  @Header('Cache-Control', 'no-store')
  async cancelDeletion(@Req() request: Request & { user?: { sub: string } }) {
    const userId = this.userId(request);
    return this.database.withTransaction(async (client) => {
      const user = await client.query(`select 1 from users where id = $1 for update`, [userId]);
      if (!user.rows[0]) throw accountDeletedException();
      const result = await client.query(
        `update privacy_requests set status = 'cancelled', cancelled_at = now()
         where user_id = $1 and status = 'pending' and scheduled_for > clock_timestamp()
         returning id, status, requested_at as "requestedAt", scheduled_for as "scheduledFor",
                   false as "canCancel", true as "cancelled"`, [userId],
      );
      if (result.rows[0]) await this.audit.record({ actorType: 'user', actorId: userId, action: 'privacy.deletion.cancelled', resourceType: 'privacy_request', resourceId: result.rows[0].id }, client);
      if (result.rows[0]) return result.rows[0];
      const current = await client.query(
        `select id, status, requested_at as "requestedAt", scheduled_for as "scheduledFor",
                completed_at as "completedAt", false as "cancelled",
                status = 'pending' and scheduled_for > clock_timestamp() as "canCancel"
         from privacy_requests where user_id = $1 order by requested_at desc, id desc limit 1`, [userId],
      );
      return current.rows[0] ?? { status: 'unknown', canCancel: false, cancelled: false };
    });
  }
}
