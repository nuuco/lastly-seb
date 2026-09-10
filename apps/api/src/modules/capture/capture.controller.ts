import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cadencePreviewRequestSchema,
  commitRequestSchema,
  interpretRequestSchema,
  type CadencePreviewRequest,
  type CommitRequest,
  type InterpretRequest,
} from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { CaptureService } from './capture.service';

@ApiTags('capture')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('capture')
export class CaptureController {
  constructor(private readonly capture: CaptureService) {}

  @Post('interpret')
  @ApiOperation({
    summary: '자연어 한 문장 해석 — 화면 06/07 입력이 여기로 온다',
    description:
      'outcome에 따라 프론트가 화면을 고른다. ' +
      'matched_existing → 08, new_item → 09, ambiguous/unrecognized → 07-B.',
  })
  interpret(@CurrentUser('id') userId: string, @Body(zodBody(interpretRequestSchema)) body: InterpretRequest) {
    return this.capture.interpret(userId, body);
  }

  @Post('cadence')
  @ApiOperation({
    summary: '이름을 고쳤을 때 주기 다시 묻기 — 화면 08-B',
    description: '이미 쓰던 이름이면 그 항목의 주기로 돌아온다.',
  })
  previewCadence(
    @CurrentUser('id') userId: string,
    @Body(zodBody(cadencePreviewRequestSchema)) body: CadencePreviewRequest,
  ) {
    return this.capture.previewCadence(userId, body);
  }

  @Post('commit')
  @ApiOperation({ summary: '확인 시트의 "이대로 저장하기" — 화면 08/09' })
  commit(@CurrentUser('id') userId: string, @Body(zodBody(commitRequestSchema)) body: CommitRequest) {
    return this.capture.commit(userId, body);
  }
}
