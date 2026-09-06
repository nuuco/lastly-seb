import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createItemSchema,
  updateItemSchema,
  type CreateItemInput,
  type UpdateItemInput,
} from '@lastly/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { LogsService } from './logs.service';
import { ItemsService } from './items.service';

@ApiTags('items')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '활성 항목 전체' })
  list(@CurrentUser('id') userId: string) {
    return this.items.list(userId);
  }

  @Post()
  @ApiOperation({ summary: '항목 생성' })
  create(@CurrentUser('id') userId: string, @Body(zodBody(createItemSchema)) body: CreateItemInput) {
    return this.items.create(userId, body);
  }

  @Get(':id')
  @ApiOperation({ summary: '항목 상세 (화면 11)' })
  findOne(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.items.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '항목/주기 수정' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateItemSchema)) body: UpdateItemInput,
  ) {
    return this.items.update(userId, id, body);
  }


  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '항목 삭제' })
  async remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.items.remove(userId, id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '"오늘 했어요" — 오늘 날짜로 기록 (되돌리기 토큰 포함)' })
  complete(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.logs.completeToday(userId, id);
  }
}
