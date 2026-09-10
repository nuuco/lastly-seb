import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * ':id' 보다 먼저 선언해야 한다. NestJS 는 선언 순서대로 맞춰보므로
   * 뒤에 두면 /items/search 가 :id 로 먼저 잡혀 UUID 검증에서 튕긴다.
   */
  @Get('search')
  @ApiOperation({ summary: '항목 이름과 기록 메모에서 찾기 — 화면 05-D' })
  search(@CurrentUser('id') userId: string, @Query('q') q: string) {
    return this.items.search(userId, q ?? '');
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
  @ApiOperation({
    summary: '항목 삭제 — 실제로는 보관 처리',
    description: '기록까지 함께 잃지 않도록 status 만 archived 로 바꾼다. 되돌리기가 가능하다.',
  })
  async remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.items.remove(userId, id);
  }

  @Post(':id/restore')
  @HttpCode(204)
  @ApiOperation({ summary: '삭제 되돌리기 — 토스트의 "되돌리기"' })
  async restore(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.items.restore(userId, id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '"오늘 했어요" — 오늘 날짜로 기록 (되돌리기 토큰 포함)' })
  complete(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.logs.completeToday(userId, id);
  }
}
