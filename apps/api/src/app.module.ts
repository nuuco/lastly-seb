import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';

import { envSchema } from './config/env.schema';
import { AiModule } from './infra/ai/ai.module';
import { PushModule } from './infra/push/push.module';
import { SupabaseModule } from './infra/supabase/supabase.module';
import { CadenceModule } from './modules/cadence/cadence.module';
import { CaptureModule } from './modules/capture/capture.module';
import { ItemsModule } from './modules/items/items.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env'],
      validate: (raw) => envSchema.parse(raw),
    }),
    ScheduleModule.forRoot(),
    TerminusModule,
    SupabaseModule,
    AiModule,
    PushModule,
    CadenceModule,
    ItemsModule,
    CaptureModule,
    NotificationsModule,
    ProfileModule,
  ],
})
export class AppModule {}
