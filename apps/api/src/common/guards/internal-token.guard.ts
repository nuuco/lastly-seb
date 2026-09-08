import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * 사람이 아니라 스케줄러가 부르는 엔드포인트를 지킨다.
 *
 * 알림 배치는 서버 안의 시계로 돌지 않고 밖에서 두드려 깨우는 구조라
 * 주소만 알면 누구나 부를 수 있다. 공유 비밀로 막는다.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('CRON_SECRET');

    // 비밀이 설정되지 않았으면 아예 열지 않는다. 빈 값과 우연히 맞아떨어지면 안 된다.
    if (!expected) throw new UnauthorizedException();

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const given = header?.startsWith('Bearer ') ? header.slice(7) : '';

    const a = Buffer.from(given);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
