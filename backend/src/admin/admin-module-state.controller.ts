import { Body, Controller, ForbiddenException, Get, Header, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminModuleStateService } from './admin-module-state.service';

type AdminRequest = Request & { user?: { sub: string; role: string } };

@Controller('admin/module-states')
@UseGuards(AdminAuthGuard)
export class AdminModuleStateController {
  constructor(private readonly moduleStates: AdminModuleStateService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list() {
    return this.moduleStates.list();
  }

  @Patch(':id/transition')
  @Header('Cache-Control', 'no-store')
  transition(@Req() request: AdminRequest, @Param('id') id: string, @Body() body: unknown) {
    if (request.user?.role !== 'super_admin') throw new ForbiddenException('只有超级管理员可以调整模块状态');
    return this.moduleStates.transition(
      id,
      body && typeof body === 'object' && !Array.isArray(body) ? body as { nextState?: unknown; reason?: unknown } : {},
      request.user.sub,
    );
  }
}
