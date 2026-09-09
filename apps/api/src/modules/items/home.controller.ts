import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  async feed(@CurrentUser('id') userId: string) {
    // 홈을 열었으면 곧 기록한다. 잠들어 있을 AI를 지금 깨워둔다 (기다리지 않는다).
    this.ai.warmUp();

    const { data } = await this.supabase.admin
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();

    return this.items.homeFeed(userId, data?.display_name ?? null);
  }
}
