import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { saveAiCredentialSchema, type SaveAiCredentialInput } from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { AiCredentialService } from './ai-credential.service';

@ApiTags('ai-credential')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('me/ai-credential')
export class AiCredentialController {
  constructor(private readonly credentials: AiCredentialService) {}

  @Get()
  @ApiOperation({
    summary: 'AI 키 상태와 남은 무료 횟수',
    description: '키 원문은 어떤 경우에도 담기지 않는다. 가림 문자열만 돌려준다.',
  })
  status(@CurrentUser('id') userId: string) {
    return this.credentials.status(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'AI 키 등록',
    description: '저장 전에 제공자에 한 번 물어 유효한 키인지 확인한다.',
  })
  save(
    @CurrentUser('id') userId: string,
    @Body(zodBody(saveAiCredentialSchema)) body: SaveAiCredentialInput,
  ) {
    return this.credentials.save(userId, body);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'AI 키 연결 해제' })
  async remove(@CurrentUser('id') userId: string) {
    await this.credentials.remove(userId);
  }
}
