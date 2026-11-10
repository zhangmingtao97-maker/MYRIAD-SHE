import { Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { parsePagination } from '../pagination';
import { AdminNotificationService } from './admin-notification.service';

type AdminRequest = Request & { user: { sub: string; role: string } };

@Controller('admin/notifications')
@UseGuards(AdminAuthGuard)
export class AdminNotificationController {
  constructor(private readonly notifications: AdminNotificationService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() request: AdminRequest,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    const { limit, offset } = parsePagination(limitValue, offsetValue, {
      defaultLimit: 30,
      maxLimit: 100,
      label: '通知分页',
    });
    return this.notifications.list(request.user.sub, limit, offset);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  unreadCount(@Req() request: AdminRequest) {
    return this.notifications.unreadCount(request.user.sub);
  }

  @Post('read-all')
  @Header('Cache-Control', 'no-store')
  markAllRead(@Req() request: AdminRequest) {
    return this.notifications.markAllRead(request.user.sub);
  }

  @Post(':id/read')
  @Header('Cache-Control', 'no-store')
  markRead(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(request.user.sub, id);
  }
}
