import { Controller, Get } from '@nestjs/common';
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
  @Get()
  check() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
