import { Global, Module } from '@nestjs/common';

import { AiCredentialController } from './ai-credential.controller';
import { AiCredentialService } from './ai-credential.service';

/**
 * 캡처 모듈이 AI 를 부를 때마다 이 서비스를 쓴다.
 * 순환 참조를 만들지 않으려고 전역으로 둔다.
 */
@Global()
@Module({
  controllers: [AiCredentialController],
  providers: [AiCredentialService],
  exports: [AiCredentialService],
})
export class AiCredentialModule {}
