import { Module } from '@nestjs/common';

import { HomeController } from './home.controller';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';
import { LogsController } from './logs.controller';
import { LogsRepository } from './logs.repository';
import { LogsService } from './logs.service';

/**
 * 항목과 그 수행 기록은 한 덩어리다.
 * 기록은 항목 없이 존재할 수 없고 서로를 참조하므로,
 * 모듈을 쪼개면 forwardRef 없이는 순환 의존을 풀 수 없다.
 */
@Module({
  controllers: [ItemsController, HomeController, LogsController],
  providers: [ItemsService, ItemsRepository, LogsService, LogsRepository],
  exports: [ItemsService, ItemsRepository, LogsService, LogsRepository],
})
export class ItemsModule {}
