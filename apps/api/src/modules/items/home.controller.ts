import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { format } from 'date-fns';

import { appToday } from '../../common/clock';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/guards/supabase-auth.guard';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { AiClient } from '../../infra/ai/ai.client';
import { SupabaseService } from '../../infra/supabase/supabase.service';
import { ItemsService } from './items.service';

@ApiTags('home')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('home')
export class HomeController {
  constructor(
    private readonly items: ItemsService,
    private readonly supabase: SupabaseService,
    private readonly ai: AiClient,
  ) {}

  @Get('feed')
  @ApiOperation({ summary: '홈 화면 전체 (요약 + 3개 섹션) — 화면 04/05/05-B' })
  async feed(@CurrentUser() user: AuthenticatedUser) {
    // 홈을 열었으면 곧 기록한다. 잠들어 있을 AI를 지금 깨워둔다 (기다리지 않는다).
    this.ai.warmUp();

    const { data } = await this.supabase.admin
      .from('profiles')
      .select('display_name, signup_prompts_seen')
      .eq('id', user.id)
      .maybeSingle<{ display_name: string | null; signup_prompts_seen: string[] }>();

    return this.items.homeFeed(user.id, data?.display_name ?? null, appToday(), {
      isAnonymous: user.isAnonymous,
      promptsSeen: data?.signup_prompts_seen ?? [],
    });
  }

  @Get('calendar')
  @ApiOperation({ summary: '한 달치 예정일·완료 이력 — 화면 05-C' })
  calendar(@CurrentUser('id') userId: string, @Query('month') month?: string) {
    // 값이 없거나 형식이 어긋나면 이번 달을 본다.
    const valid = month && /^\d{4}-\d{2}$/.test(month);
    return this.items.calendar(userId, valid ? month : format(appToday(), 'yyyy-MM'));
  }
}
