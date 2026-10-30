import { BadRequestException, Body, Controller, Get, Header, Optional, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards, NotFoundException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { hashAdminPassword, verifyAdminPassword } from '../auth/admin-password';
import { DatabaseService } from '../database/database.service';
import { AuditService } from './audit.service';
import { parseDatabaseCount, parsePagination } from '../pagination';
import { StorageService } from '../storage/storage.service';
import { DataEncryptionService } from '../security/data-encryption.service';

const settingKeys = ['store_enabled', 'maintenance_notice', 'support_contact'] as const;
const roles = ['super_admin', 'content_editor', 'support_readonly'] as const;
type AdminRole = typeof roles[number];
type AdminRequest = Request & { user?: { sub: string; role: string } };

function text(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string') throw new BadRequestException(`${label}无效`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new BadRequestException(`${label}长度无效`);
  return normalized;
}

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminManagementController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly encryption?: DataEncryptionService,
  ) {}

  @Patch('me/password')
  async changeOwnPassword(@Body() body: { currentPassword?: string; newPassword?: string }, @Req() request: AdminRequest) {
    const actorId = request.user?.sub;
    if (!actorId || actorId.startsWith('admin:')) throw new BadRequestException('当前环境管理员密码需通过部署环境配置修改');
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 12 || newPassword.length > 256) throw new BadRequestException('新密码至少 12 位且不能超过 256 位');
    await this.database.withTransaction(async (client) => {
      const account = await client.query<{ passwordHash: string }>(`select password_hash as "passwordHash" from admin_accounts where id = $1 and status = 'active' for update`, [actorId]);
      if (!account.rows[0] || !await verifyAdminPassword(currentPassword, account.rows[0].passwordHash)) throw new UnauthorizedException('当前密码不正确');
      await client.query(`update admin_accounts set password_hash = $1, password_change_required = false, updated_at = now() where id = $2`, [await hashAdminPassword(newPassword), actorId]);
      await this.audit.record({ actorType: 'admin', actorId, action: 'admin.password.changed', resourceType: 'admin_account', resourceId: actorId }, client);
    });
    const configuredTtl = Number(this.config.get('ADMIN_SESSION_TTL_SECONDS', 86_400));
    const expiresIn = Number.isInteger(configuredTtl) && configuredTtl > 0 ? Math.min(configuredTtl, 30 * 24 * 60 * 60) : 86_400;
    const accessToken = await this.jwt.signAsync({ sub: actorId, role: request.user?.role, passwordChangeRequired: false }, { expiresIn });
    return { accessToken, expiresIn };
  }

  @Get('users')
  @Header('Cache-Control', 'no-store')
  async members(@Query('limit') limitValue?: string, @Query('offset') offsetValue?: string, @Query('id') idValue?: string, @Query('from') from?: string, @Query('to') to?: string, @Req() request?: AdminRequest, @Query('q') queryValue?: string) {
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 50, maxLimit: 100, label: '会员分页' });
    const revealPhones = request?.user?.role === 'super_admin';
    const phoneColumn = revealPhones ? 'u.phone_encrypted as "phoneEncrypted",' : '';
    const filters: string[] = [];
    const values: unknown[] = [];
    if (idValue?.trim()) {
      const id = idValue.trim();
      if (id.length > 36 || !/^[0-9a-f-]+$/i.test(id)) throw new BadRequestException('会员 ID 格式无效');
      values.push(`${id}%`);
      filters.push(`u.id::text ilike $${values.length}`);
    }
    if (queryValue?.trim()) {
      const query = queryValue.trim();
      if (query.length > 80) throw new BadRequestException('会员资料搜索内容不能超过 80 个字符');
      values.push(query);
      filters.push(`(position(lower($${values.length}) in lower(coalesce(u.nickname, ''))) > 0 or position(lower($${values.length}) in lower(u.id::text)) > 0 or u.phone_last4 = right($${values.length}, 4))`);
    }
    for (const [date, operator, label] of [[from, '>=', '起始'], [to, '<', '结束']] as const) {
      if (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new BadRequestException(`注册${label}日期无效`);
        values.push(date);
        filters.push(label === '结束'
          ? `u.created_at < ($${values.length}::date + interval '1 day')`
          : `u.created_at ${operator} $${values.length}::date`);
      }
    }
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const rows = await this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageValues = [...values, limit, offset];
      const result = await client.query(
        `select u.id, u.status, u.created_at as "createdAt", u.updated_at as "updatedAt",
                u.nickname, u.avatar_object_key as "avatarObjectKey", u.phone_last4 as "phoneLast4",
                ${phoneColumn}
                count(o.id) filter (where o.status <> 'deleted')::int as "observationCount"
         from users u left join observations o on o.user_id = u.id ${where}
         group by u.id order by u.created_at desc, u.id desc limit $${pageValues.length - 1} offset $${pageValues.length}`,
        pageValues,
      );
      const count = await client.query<{ total: string }>(`select count(*)::text as total from users u ${where}`, values);
      const total = count.rows[0]?.total ?? '0';
      await this.audit.record({ actorType: 'admin', actorId: request?.user?.sub, action: 'member.listed', resourceType: 'users', metadata: { count: result.rows.length, limit, offset, filteredById: Boolean(idValue?.trim()), filteredByProfile: Boolean(queryValue?.trim()), filteredByRegistrationDate: Boolean(from || to) } }, client);
      if (revealPhones) {
        for (const row of result.rows as Array<{ id: string; phoneEncrypted?: unknown }>) {
          if (row.phoneEncrypted) {
            await this.audit.record({ actorType: 'admin', actorId: request?.user?.sub, action: 'member.phone.viewed', resourceType: 'user', resourceId: row.id, metadata: { source: 'member_list' } }, client);
          }
        }
      }
      return { rows: result.rows, total };
    });
    const items = await Promise.all(rows.rows.map(async (row) => {
      const { avatarObjectKey, phoneLast4, phoneEncrypted, ...member } = row as Record<string, unknown> & { avatarObjectKey?: string | null; phoneLast4?: string | null; phoneEncrypted?: unknown };
      let avatarUrl: string | null = null;
      if (typeof avatarObjectKey === 'string' && this.storage) {
        try { avatarUrl = (await this.storage.createDownloadUrl(avatarObjectKey)).url; }
        catch { avatarUrl = null; }
      }
      const last4 = typeof phoneLast4 === 'string' ? phoneLast4.trim() : '';
      const profile: Record<string, unknown> = { ...member, avatarUrl };
      if (revealPhones) {
        if (phoneEncrypted) {
          if (!this.encryption) throw new ServiceUnavailableException('会员资料暂时无法解密');
          try {
            const phoneNumber = this.encryption.decryptJson(phoneEncrypted, 'user.phone');
            profile.phoneNumber = typeof phoneNumber === 'string' ? phoneNumber : null;
          } catch {
            throw new ServiceUnavailableException('会员资料暂时无法解密');
          }
        } else profile.phoneNumber = null;
      } else profile.phoneMasked = last4 ? `***-****-${last4}` : null;
      return profile;
    }));
    return { items, total: parseDatabaseCount(rows.total, '会员总数'), limit, offset };
  }

  @Get('users/:id')
  @Header('Cache-Control', 'no-store')
  async member(@Param('id', ParseUUIDPipe) id: string, @Req() request: AdminRequest) {
    const result = await this.database.withTransaction(async (client) => {
      const result = await client.query(
      `select u.id, u.status, u.created_at as "createdAt", u.updated_at as "updatedAt",
              u.nickname, u.avatar_object_key as "avatarObjectKey", u.phone_encrypted as "phoneEncrypted",
              u.phone_last4 as "phoneLast4",
              u.wechat_openid as "openId",
              case when u.wechat_unionid is null then null else '***' || right(u.wechat_unionid, 4) end as "maskedUnionId",
              (select count(*)::int from observations o where o.user_id = u.id and o.status <> 'deleted') as "observationCount",
              (select jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status, 'requestedAt', p.requested_at, 'scheduledFor', p.scheduled_for) order by p.requested_at desc)
               from privacy_requests p where p.user_id = u.id) as "privacyRequests"
       from users u where u.id = $1`, [id],
      );
      if (!result.rows[0]) throw new NotFoundException('会员不存在');
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'member.viewed', resourceType: 'user', resourceId: id }, client);
      if (request.user?.role === 'super_admin' && result.rows[0].phoneEncrypted) {
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'member.phone.viewed', resourceType: 'user', resourceId: id }, client);
      }
      return result.rows[0];
    });
    const { avatarObjectKey, phoneEncrypted, phoneLast4, ...member } = result as Record<string, unknown> & {
      avatarObjectKey?: string | null;
      phoneEncrypted?: unknown;
      phoneLast4?: string | null;
    };
    let avatarUrl: string | null = null;
    if (typeof avatarObjectKey === 'string' && this.storage) {
      try { avatarUrl = (await this.storage.createDownloadUrl(avatarObjectKey)).url; }
      catch { avatarUrl = null; }
    }
    const last4 = typeof phoneLast4 === 'string' ? phoneLast4.trim() : '';
    const profile: Record<string, unknown> = { ...member, avatarUrl, phoneMasked: last4 ? `***-****-${last4}` : null };
    if (request.user?.role === 'super_admin') {
      if (phoneEncrypted) {
        if (!this.encryption) throw new ServiceUnavailableException('会员资料暂时无法解密');
        try {
          const phoneNumber = this.encryption.decryptJson(phoneEncrypted, 'user.phone');
          profile.phoneNumber = typeof phoneNumber === 'string' ? phoneNumber : null;
        } catch {
          throw new ServiceUnavailableException('会员资料暂时无法解密');
        }
      } else profile.phoneNumber = null;
    }
    return profile;
  }

  @Patch('users/:id/status')
  async updateMemberStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status?: string; reason?: string }, @Req() request: AdminRequest) {
    if (!['active', 'suspended'].includes(body.status || '')) throw new BadRequestException('会员状态无效');
    const reason = text(body.reason, '操作原因', 500);
    return this.database.withTransaction(async (client) => {
      const update = await client.query(`update users set status = $1, updated_at = now() where id = $2 returning id, status`, [body.status, id]);
      if (!update.rows[0]) throw new NotFoundException('会员不存在');
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: `member.${body.status}`, resourceType: 'user', resourceId: id, metadata: { reason } }, client);
      return update.rows[0];
    });
  }

  @Get('system-settings')
  @Header('Cache-Control', 'no-store')
  async getSettings() {
    const result = await this.database.query<{ key: string; value: unknown; updatedAt: string }>(
      `select key, value, updated_at as "updatedAt" from system_settings where key = any($1::text[]) order by key`, [settingKeys],
    );
    return Object.fromEntries(result.rows.map((row) => [row.key, { value: row.value, updatedAt: row.updatedAt }]));
  }

  @Patch('system-settings')
  async saveSettings(@Body() body: Record<string, unknown>, @Req() request: AdminRequest) {
    const entries = Object.entries(body || {});
    if (!entries.length || entries.some(([key]) => !settingKeys.includes(key as typeof settingKeys[number]))) throw new BadRequestException('设置项无效');
    const values: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (key === 'store_enabled') {
        if (typeof value !== 'boolean') throw new BadRequestException('商城开放状态无效');
        values[key] = value;
      } else {
        const label = key === 'maintenance_notice' ? '维护公告' : '联系支持';
        const maximum = key === 'maintenance_notice' ? 500 : 200;
        if (typeof value !== 'string' || value.trim().length > maximum) throw new BadRequestException(`${label}长度无效`);
        values[key] = value.trim();
      }
    }
    await this.database.withTransaction(async (client) => {
      const previous = await client.query<{ key: string; value: unknown }>(
        `select key, value from system_settings where key = any($1::text[])`, [Object.keys(values)],
      );
      const previousValues = Object.fromEntries(previous.rows.map((row) => [row.key, row.value]));
      for (const [key, value] of Object.entries(values)) {
        await client.query(`insert into system_settings (key, value, updated_by) values ($1, $2::jsonb, $3)
          on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [key, JSON.stringify(value), request.user?.sub ?? null]);
      }
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'system.settings.updated', resourceType: 'system_settings', metadata: { previous: previousValues, next: values } }, client);
    });
    return this.getSettings();
  }

  @Get('employees')
  @Header('Cache-Control', 'no-store')
  async employees(@Req() request: AdminRequest) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query(`select id, username, display_name as "displayName", role, status,
        created_at as "createdAt", updated_at as "updatedAt", last_login_at as "lastLoginAt"
        from admin_accounts order by created_at desc, id`);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'admin.employees.listed', resourceType: 'admin_accounts', metadata: { count: result.rows.length } }, client);
      return result.rows;
    });
  }

  @Post('employees')
  async createEmployee(@Body() body: Record<string, unknown>, @Req() request: AdminRequest) {
    const username = text(body.username, '员工账号', 64);
    const displayName = text(body.displayName, '员工姓名', 80);
    const password = text(body.password, '初始密码', 256);
    const role = body.role as AdminRole;
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username) || password.length < 12 || !['content_editor', 'support_readonly'].includes(role)) {
      throw new BadRequestException('账号格式无效，初始密码至少 12 位；请选择有效员工角色');
    }
    return this.database.withTransaction(async (client) => {
      const result = await client.query(`insert into admin_accounts (username, display_name, password_hash, role, password_change_required)
        values ($1, $2, $3, $4, true) returning id, username, display_name as "displayName", role, status, created_at as "createdAt"`,
      [username, displayName, await hashAdminPassword(password), role]);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'admin.employee.created', resourceType: 'admin_account', resourceId: result.rows[0].id, metadata: { username, role } }, client);
      return result.rows[0];
    });
  }

  @Patch('employees/:id')
  async updateEmployee(@Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Req() request: AdminRequest) {
    const role = body.role as AdminRole | undefined;
    const status = body.status as 'active' | 'disabled' | undefined;
    const password = body.password === undefined ? undefined : text(body.password, '新密码', 256);
    if (role !== undefined && !roles.includes(role)) throw new BadRequestException('员工角色无效');
    if (role === 'super_admin') throw new BadRequestException('不能从后台提升超级管理员；请通过受控初始化流程处理');
    if (status !== undefined && !['active', 'disabled'].includes(status)) throw new BadRequestException('员工状态无效');
    if (password !== undefined && password.length < 12) throw new BadRequestException('新密码至少 12 位');
    const result = await this.database.withTransaction(async (client) => {
      await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-admin-role-change'))`);
      const current = await client.query<{ role: AdminRole; status: string }>('select role, status from admin_accounts where id = $1 for update', [id]);
      if (!current.rows[0]) throw new BadRequestException('员工账号不存在');
      const nextRole = role ?? current.rows[0].role;
      const nextStatus = status ?? current.rows[0].status;
      if (id === request.user?.sub && nextStatus === 'disabled') throw new BadRequestException('不能停用当前登录的员工账号');
      if (current.rows[0].role === 'super_admin' && (nextRole !== 'super_admin' || nextStatus !== 'active')) {
        const count = await client.query<{ count: string }>(`select count(*)::text as count from admin_accounts where role = 'super_admin' and status = 'active'`);
        if (Number(count.rows[0].count) <= 1) throw new BadRequestException('必须保留至少一名启用的超级管理员');
      }
      const hash = password ? await hashAdminPassword(password) : null;
      const updated = await client.query(`update admin_accounts set role = $1, status = $2,
        password_hash = coalesce($3, password_hash), password_change_required = case when $3 is null then password_change_required else true end, updated_at = now() where id = $4
        returning id, username, display_name as "displayName", role, status, updated_at as "updatedAt", last_login_at as "lastLoginAt"`, [nextRole, nextStatus, hash, id]);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'admin.employee.updated', resourceType: 'admin_account', resourceId: id, metadata: { role: nextRole, status: nextStatus, passwordChanged: Boolean(password) } }, client);
      return updated.rows[0];
    });
    return result;
  }
}

