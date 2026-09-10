import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';

import { envSchema } from './config/env.schema';
import { AiModule } from './infra/ai/ai.module';
import { CryptoModule } from './infra/crypto/crypto.module';
import { AiCredentialModule } from './modules/ai-credential/ai-credential.module';
import { PushModule } from './infra/push/push.module';
import { SupabaseModule } from './infra/supabase/supabase.module';
import { CadenceModule } from './modules/cadence/cadence.module';
import { CaptureModule } from './modules/capture/capture.module';
import { HealthModule } from './modules/health/health.module';
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
    CryptoModule,
    AiCredentialModule,
    PushModule,
    CadenceModule,
    HealthModule,
    ItemsModule,
    CaptureModule,
    NotificationsModule,
    ProfileModule,
  ],
})
export class AppModule {}
