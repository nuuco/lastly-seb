import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  notificationActionSchema,
  pushSubscriptionSchema,
  type NotificationAction,
  type PushSubscriptionInput,
} from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('subscribe')
  @HttpCode(204)
  @ApiOperation({ summary: '웹푸시 구독 등록 (화면 03에서 권한 허용 직후)' })
  async subscribe(
    @CurrentUser('id') userId: string,
    @Body(zodBody(pushSubscriptionSchema)) body: PushSubscriptionInput,
  ) {
    await this.notifications.subscribe(userId, body);
  }

  @Delete('subscribe')
  @HttpCode(204)
  @ApiOperation({ summary: '웹푸시 구독 해제' })
  async unsubscribe(@CurrentUser('id') userId: string, @Body('endpoint') endpoint: string) {
    await this.notifications.unsubscribe(userId, endpoint);
  }

  @Post('items/:itemId/action')
  @ApiOperation({ summary: '잠금화면 알림 액션 — 완료 / 3일 뒤 / 주말에 (화면 14)' })
  action(
    @CurrentUser('id') userId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body('action') rawAction: unknown,
  ) {
    const action: NotificationAction = notificationActionSchema.parse(rawAction);
    return this.notifications.handleAction(userId, itemId, action);
  }
}
