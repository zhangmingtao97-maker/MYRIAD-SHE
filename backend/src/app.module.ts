import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { LegalDocumentsController } from './content/legal-documents.controller';
import { ContentController } from './content/content.controller';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health.controller';
import { ObservationController } from './observation/observation.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { UserAuthGuard } from './auth/user-auth.guard';
import { UserController } from './user/user.controller';
import { AdminObservationController } from './admin/admin-observation.controller';
import { StorageService } from './storage/storage.service';
import { AuditService } from './admin/audit.service';
import { AdminAuditController } from './admin/admin-audit.controller';
import { AdminPrivacyController } from './admin/admin-privacy.controller';
import { PrivacyService } from './privacy/privacy.service';
import { DataEncryptionService } from './security/data-encryption.service';
import { validateEnvironment } from './config/environment';
import { RedisService } from './cache/redis.service';
import { AdminSystemController } from './admin/admin-system.controller';
import { AdminManagementController } from './admin/admin-management.controller';
import { DiscussionContributionController } from './discussion/discussion-contribution.controller';
import { AdminDiscussionContributionController } from './admin/admin-discussion-contribution.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '../.env.local'], validate: validateEnvironment }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get('JWT_ACCESS_SECRET') }),
    }),
  ],
  controllers: [HealthController, AuthController, ContentController, LegalDocumentsController, ObservationController, DiscussionContributionController, UserController, AdminObservationController, AdminDiscussionContributionController, AdminAuditController, AdminPrivacyController, AdminSystemController, AdminManagementController],
  providers: [DatabaseService, AuthService, AdminAuthGuard, UserAuthGuard, StorageService, RedisService, AuditService, PrivacyService, DataEncryptionService],
})
export class AppModule {}
