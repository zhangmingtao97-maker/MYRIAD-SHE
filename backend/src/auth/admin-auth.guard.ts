import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';

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
      if (payload.sub.startsWith('admin:')) {
        if (payload.role !== 'super_admin') throw new UnauthorizedException('管理员身份无效');
      } else {
        const account = await this.database.query<{ role: string; passwordChangeRequired: boolean }>(`select role, password_change_required as "passwordChangeRequired" from admin_accounts where id = $1 and status = 'active'`, [payload.sub]);
        if (!account.rows[0] || account.rows[0].role !== payload.role) throw new UnauthorizedException('员工账号已停用或权限已变更，请重新登录');
        if (account.rows[0].passwordChangeRequired && !(request.method === 'PATCH' && request.path.replace(/^\/api(?=\/)/, '') === '/admin/me/password')) {
          throw new ForbiddenException('首次登录或密码重置后，请先修改密码');
        }
      }
      const path = request.path.replace(/^\/api(?=\/)/, '');
      const passwordChangeEndpoint = request.method === 'PATCH' && path === '/admin/me/password';
      if (passwordChangeEndpoint) {
        request.user = { sub: payload.sub, role: payload.role };
        return true;
      }
      if (payload.role === 'content_editor') {
        const readableContentPaths = new Set([
          '/content/home', '/content/issues', '/content/issues/summary',
          '/content/practice/manage', '/content/daily-objects/manage',
          '/content/privacy-policy/manage', '/content/privacy-revisions/privacy-policy',
          '/content/media/orphans', '/content/media/audio', '/content/media/view-url', '/content/media/preview-url',
        ]);
        const editableContentMethods = new Set(['PATCH']);
        const editableContentPaths = new Set([
          '/content/practice/manage', '/content/daily-objects/manage', '/content/privacy-policy/manage',
        ]);
        const isLegalDraft = /^\/content\/legal-documents\/(privacy-policy|user-agreement)\/manage$/.test(path) && ['GET', 'PATCH'].includes(request.method);
        const isLegalImport = request.method === 'POST' && /^\/content\/legal-documents\/(privacy-policy|user-agreement)\/import$/.test(path);
        const isLegalHistory = request.method === 'GET' && path === '/content/privacy-revisions/user-agreement';
        const isMediaUpload = request.method === 'POST' && path === '/content/media/upload-url';
        const isIssueRead = request.method === 'GET' && /^\/content\/issues\/[0-9a-f-]+\/history$/i.test(path);
        const isIssueWrite = request.method === 'POST' && (path === '/content/issues' || /^\/content\/issues\/[0-9a-f-]+\/publish$/i.test(path))
          || request.method === 'PATCH' && /^\/content\/issues\/[0-9a-f-]+$/i.test(path);
        const isContributionList = request.method === 'GET' && path === '/admin/discussion-contributions';
        const isContributionDetail = request.method === 'GET' && /^\/admin\/discussion-contributions\/[0-9a-f-]+$/i.test(path);
        const isContributionStatusUpdate = request.method === 'PATCH' && /^\/admin\/discussion-contributions\/[0-9a-f-]+\/status$/i.test(path);
        const isReadableContent = request.method === 'GET' && readableContentPaths.has(path);
        const isEditableContent = editableContentMethods.has(request.method) && editableContentPaths.has(path);
        if (!isLegalDraft && !isLegalImport && !isLegalHistory && !isMediaUpload && !isReadableContent && !isEditableContent && !isIssueRead && !isIssueWrite && !isContributionList && !isContributionDetail && !isContributionStatusUpdate) {
          throw new ForbiddenException('内容编辑账号仅可管理期刊、指定内容页面、用户经历审核和媒体上传');
        }
      }
      if (payload.role === 'support_readonly' && !(request.method === 'GET' && (path === '/admin/users' || /^\/admin\/users\/[0-9a-f-]+$/i.test(path) || path === '/admin/system-settings'))) {
        throw new ForbiddenException('客服只读账号仅可查看会员目录和业务设置');
      }
      request.user = { sub: payload.sub, role: payload.role };
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('管理登录已失效');
    }
  }
}
