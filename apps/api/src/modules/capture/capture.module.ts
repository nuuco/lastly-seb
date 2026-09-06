import { Module } from '@nestjs/common';

import { ItemsModule } from '../items/items.module';
import { CaptureController } from './capture.controller';
import { CaptureService } from './capture.service';
import { DraftTokenService } from './draft-token.service';

@Module({
  imports: [ItemsModule],
  controllers: [CaptureController],
  providers: [CaptureService, DraftTokenService],
  exports: [CaptureService],
})
export class CaptureModule {}
