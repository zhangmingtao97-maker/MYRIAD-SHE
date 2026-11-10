import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('discussion/subscription-config')
export class DiscussionSubscriptionController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    const enabledValue = String(this.config.get('DISCUSSION_REPLY_NOTIFICATIONS_ENABLED', 'true')).trim().toLowerCase();
    const templateId = String(this.config.get('WECHAT_SUBSCRIBE_TEMPLATE_DISCUSSION_REPLY', '') ?? '').trim();
    const enabled = !['false', '0', 'off', 'no'].includes(enabledValue)
      && /^[A-Za-z0-9_-]{10,128}$/.test(templateId);
    return enabled ? { enabled: true, templateId } : { enabled: false };
  }
}
