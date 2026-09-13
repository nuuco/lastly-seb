import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  signupPromptSchema,
  updateNotificationSettingsSchema,
  type SignupPrompt,
  type UpdateNotificationSettingsInput,
} from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/guards/supabase-auth.guard';
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

  @Post('signup-prompts')
  @HttpCode(204)
  @ApiOperation({
    summary: '가입 유도를 보여줬다고 표시',
    description: '같은 이유로 두 번 묻지 않기 위한 것. "나중에 할게요" 를 눌렀을 때 부른다.',
  })
  async seenPrompt(
    @CurrentUser('id') userId: string,
    @Body(zodBody(z.object({ prompt: signupPromptSchema }))) body: { prompt: SignupPrompt },
  ): Promise<void> {
    await this.profile.markSignupPromptSeen(userId, body.prompt);
  }

  @Get('notification-settings')
  @ApiOperation({ summary: '알림 설정 조회 (화면 13)' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.getNotificationSettings(user.id, user.isAnonymous);
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
