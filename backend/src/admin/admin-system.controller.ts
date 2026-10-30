import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { DatabaseService } from '../database/database.service';

@Controller('admin/system')
@UseGuards(AdminAuthGuard)
export class AdminSystemController {
  constructor(private readonly database: DatabaseService) {}

  @Get('migrations')
  @Header('Cache-Control', 'no-store')
  migrationStatus() {
    return this.database.migrationStatus();
  }
}
