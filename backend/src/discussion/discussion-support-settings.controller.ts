import { Controller, Get, Header } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { readDiscussionSupportSettings } from './discussion-support-settings';

@Controller('content')
export class DiscussionSupportSettingsController {
  constructor(private readonly database: DatabaseService) {}

  @Get('support-settings')
  @Header('Cache-Control', 'no-store')
  get() {
    return readDiscussionSupportSettings(this.database);
  }
}