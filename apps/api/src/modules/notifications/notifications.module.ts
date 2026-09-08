import { Module } from '@nestjs/common';

import { ItemsModule } from '../items/items.module';
import { InternalController } from './internal.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ItemsModule],
  controllers: [NotificationsController, InternalController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
