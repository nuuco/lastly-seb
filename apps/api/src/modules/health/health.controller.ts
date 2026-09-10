import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

/**
 * 호스팅 서비스가 "이 인스턴스가 살아 있나"를 확인하는 곳.
 *
 * 인증을 걸지 않는다. 여기서 막히면 배포가 계속 실패로 판정된다.
 * DB나 AI 상태는 보지 않는다 — 그것들이 잠시 흔들려도 서버 자체는 살아 있고,
 * 여기서 실패로 답하면 호스팅이 멀쩡한 인스턴스를 재시작해 버린다.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      /**
       * 선택 기능이 실제로 연결됐는지. 값이 아니라 참·거짓만 담는다.
       *
       * 환경변수가 빠지면 기능이 조용히 꺼진 채로 돌아 원인을 밖에서 알 수 없다.
       * 무료 체험 키를 lastly-ai 에만 넣고 lastly-api 에 빠뜨려 하루를 쓴 적이 있다.
       */
      integrations: {
        credentialSecret: Boolean(this.config.get('CREDENTIALS_SECRET')),
        trialKey: Boolean(this.config.get('ANTHROPIC_API_KEY')),
        push: Boolean(this.config.get('VAPID_PRIVATE_KEY')),
      },
    };
  }
}
