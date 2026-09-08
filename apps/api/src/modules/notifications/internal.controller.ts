import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalTokenGuard } from '../../common/guards/internal-token.guard';
import { NotificationsService } from './notifications.service';

/**
 * 스케줄러가 두드리는 문. 사람이 쓰는 API가 아니므로 문서에서 숨긴다.
 *
 * 무료 호스팅은 접속이 없으면 서버를 재우므로 서버 안의 시계를 믿을 수 없다.
 * 대신 GitHub Actions가 매시 정각에 여기를 부른다.
 */
@ApiExcludeController()
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class InternalController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('dispatch-digests')
  @HttpCode(200)
  dispatchDigests() {
    return this.notifications.dispatchDigests();
  }
}
