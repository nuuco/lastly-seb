import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createLogSchema, updateLogSchema, type CreateLogInput, type UpdateLogInput } from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { LogsService } from './logs.service';

@ApiTags('logs')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get('items/:itemId/logs')
  @ApiOperation({ summary: '지난 기록 (화면 11)' })
  list(@CurrentUser('id') userId: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.logs.listByItem(userId, itemId);
  }

  @Post('items/:itemId/logs')
  @ApiOperation({ summary: '기록 추가 — 과거 날짜 지정 가능' })
  add(
    @CurrentUser('id') userId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zodBody(createLogSchema)) body: CreateLogInput,
  ) {
    return this.logs.add(userId, itemId, body);
  }

  @Patch('logs/:id')
  @ApiOperation({ summary: '기록 날짜/메모 수정 (화면 11-B)' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateLogSchema)) body: UpdateLogInput,
  ) {
    return this.logs.update(userId, id, body);
  }

  @Delete('logs/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '기록 삭제' })
  async remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.logs.remove(userId, id);
  }

  @Post('logs/undo')
  @HttpCode(204)
  @ApiOperation({ summary: '완료 토스트의 되돌리기' })
  async undo(@CurrentUser('id') userId: string, @Body('undoToken') undoToken: string) {
    await this.logs.undo(userId, undoToken);
  }
}
