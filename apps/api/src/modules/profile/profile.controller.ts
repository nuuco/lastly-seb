import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  updateNotificationSettingsSchema,
  type UpdateNotificationSettingsInput,
} from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: '내 프로필' })
  me(@CurrentUser('id') userId: string) {
    return this.profile.get(userId);
  }

  @Get('notification-settings')
  @ApiOperation({ summary: '알림 설정 조회 (화면 13)' })
  settings(@CurrentUser('id') userId: string) {
    return this.profile.getNotificationSettings(userId);
  }

  @Patch('notification-settings')
  @ApiOperation({ summary: '알림 시간 / 주말 알림 변경' })
  updateSettings(
    @CurrentUser('id') userId: string,
    @Body(zodBody(updateNotificationSettingsSchema)) body: UpdateNotificationSettingsInput,
  ) {
    return this.profile.updateNotificationSettings(userId, body);
  }

  @Get('export')
  @ApiOperation({ summary: '기록 내보내기 (화면 13)' })
  export(@CurrentUser('id') userId: string) {
    return this.profile.exportData(userId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: '계정과 모든 기록 영구 삭제 (화면 13-B)' })
  async deleteAccount(@CurrentUser('id') userId: string) {
    await this.profile.deleteAccount(userId);
  }
}
