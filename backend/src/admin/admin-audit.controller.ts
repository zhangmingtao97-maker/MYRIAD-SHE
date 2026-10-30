import { BadRequestException, Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AuditService } from './audit.service';
import { parsePagination } from '../pagination';

@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query('limit') limitValue?: string, @Query('offset') offsetValue?: string, @Query('actorType') actorType?: string, @Query('action') action?: string, @Req() request?: Request & { user?: { sub: string } }) {
    if (actorType && !['user', 'admin', 'system'].includes(actorType)) throw new BadRequestException('审计执行者筛选无效');
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 100, maxLimit: 200, label: '审计分页' });
    const parsedActorType = actorType && ['user', 'admin', 'system'].includes(actorType) ? actorType as 'user' | 'admin' | 'system' : undefined;
    const normalizedAction = action?.trim() || undefined;
    if (normalizedAction && normalizedAction.length > 120) throw new BadRequestException('审计操作筛选无效');
    const parsedAction = normalizedAction;
    const page = await this.audit.list(limit, offset, parsedActorType, parsedAction);
    if (request?.user?.sub) await this.audit.record({ actorType: 'admin', actorId: request.user.sub, action: 'audit.logs.viewed', resourceType: 'audit_logs', metadata: { actorType: parsedActorType ?? 'all', action: parsedAction ?? 'all', limit, offset } });
    return page;
  }
}
