import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { LegalDocumentsController } from './content/legal-documents.controller';
import { ContentController } from './content/content.controller';
import { DiscussionPageController } from './content/discussion-page.controller';
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
import { DiscussionReportController } from './discussion/discussion-report.controller';
import { AdminDiscussionContributionController } from './admin/admin-discussion-contribution.controller';
import { AdminDiscussionReportController } from './admin/admin-discussion-report.controller';
import { AdminDiscussionRestrictionController } from './admin/admin-discussion-restriction.controller';
import { AdminNotificationController } from './admin/admin-notification.controller';
import { AdminNotificationService } from './admin/admin-notification.service';
import { AdminModuleStateController } from './admin/admin-module-state.controller';
import { AdminModuleStateService } from './admin/admin-module-state.service';
import { DiscussionReplyNotificationService } from './discussion/discussion-reply-notification.service';
import { DiscussionSubscriptionController } from './discussion/discussion-subscription.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '../.env.local'], validate: validateEnvironment }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get('JWT_ACCESS_SECRET') }),
    }),
  ],
  controllers: [HealthController, AuthController, ContentController, DiscussionPageController, LegalDocumentsController, ObservationController, DiscussionContributionController, DiscussionReportController, DiscussionSubscriptionController, UserController, AdminObservationController, AdminDiscussionContributionController, AdminDiscussionReportController, AdminDiscussionRestrictionController, AdminAuditController, AdminPrivacyController, AdminSystemController, AdminManagementController, AdminNotificationController, AdminModuleStateController],
  providers: [DatabaseService, AuthService, AdminAuthGuard, UserAuthGuard, StorageService, RedisService, AuditService, PrivacyService, DataEncryptionService, AdminNotificationService, DiscussionReplyNotificationService, AdminModuleStateService],
})
export class AppModule {}
