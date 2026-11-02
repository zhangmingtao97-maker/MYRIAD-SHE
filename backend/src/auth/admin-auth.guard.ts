import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { adminModulesAllow } from './admin-permissions';

const maxBearerTokenLength = 16_384;

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; method: string; path: string; user?: { sub: string; role: string } }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('需要管理后台登录');
    if (header.length > 7 + maxBearerTokenLength) throw new UnauthorizedException('管理登录已失效');
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; role?: string; exp?: number; passwordChangeRequired?: boolean }>(header.slice(7));
      if (!['super_admin', 'content_editor', 'support_readonly'].includes(payload.role || '') || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256) throw new UnauthorizedException('无管理权限');
      if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new UnauthorizedException('管理登录已失效');
      const path = request.path.replace(/^\/api(?=\/)/, '');
      // null 表示跟随角色默认模块；undefined 表示环境管理员（拥有全部模块）。
      let moduleOverride: readonly string[] | null | undefined;
      if (payload.sub.startsWith('admin:')) {
        if (payload.role !== 'super_admin') throw new UnauthorizedException('管理员身份无效');
      } else {
        const account = await this.database.query<{ role: string; passwordChangeRequired: boolean; modulePermissions: string[] | null }>(
          `select role, password_change_required as "passwordChangeRequired", module_permissions as "modulePermissions"
             from admin_accounts where id = $1 and status = 'active'`, [payload.sub]);
        const row = account.rows[0];
        if (!row || row.role !== payload.role) throw new UnauthorizedException('员工账号已停用或权限已变更，请重新登录');
        // 权限变更后不需要重新登录：每次请求都按数据库中的模块授权判定。
        moduleOverride = row.modulePermissions ?? null;
        if (row.passwordChangeRequired && !(request.method === 'PATCH' && path === '/admin/me/password')) {
          throw new ForbiddenException('首次登录或密码重置后，请先修改密码');
        }
      }
      const passwordChangeEndpoint = request.method === 'PATCH' && path === '/admin/me/password';
      const profileEndpoint = request.method === 'GET' && path === '/admin/me';
      const ownAvatarEndpoint = ['POST', 'DELETE'].includes(request.method) && path === '/admin/me/avatar';
      if (passwordChangeEndpoint || profileEndpoint || ownAvatarEndpoint) {
        request.user = { sub: payload.sub, role: payload.role };
        return true;
      }
      if (!adminModulesAllow(payload.role, moduleOverride, request.method, path)) {
        throw new ForbiddenException('当前账号未获得该模块的访问权限');
      }
      request.user = { sub: payload.sub, role: payload.role };
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('管理登录已失效');
    }
  }
}
