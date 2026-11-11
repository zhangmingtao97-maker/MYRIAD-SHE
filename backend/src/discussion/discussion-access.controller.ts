import { Controller, Get, Header, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { DatabaseService } from '../database/database.service';
import { findActiveDiscussionRestriction } from './discussion-restrictions';

@Controller('me/discussion-access')
@UseGuards(UserAuthGuard)
export class DiscussionAccessController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async status(@Req() request: Request & { user?: { sub: string } }) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('需要用户身份');
    const restriction = await findActiveDiscussionRestriction(this.database, userId);
    if (!restriction) return { restricted: false, endsAt: null };
    return { restricted: true, endsAt: restriction.endsAt };
  }
}