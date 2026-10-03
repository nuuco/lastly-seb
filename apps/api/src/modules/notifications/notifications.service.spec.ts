import { NotFoundException } from '@nestjs/common';

import { CadenceService } from '../cadence/cadence.service';
import { NotificationsService } from './notifications.service';

/** 지운 항목의 알림이 알림센터에 남아 있다가 눌려도 아무것도 바꾸지 않는다. */
describe('NotificationsService.handleAction — 지운 항목', () => {
  it('미루기를 적용하지 않는다', async () => {
    const items = {
      findActiveById: jest.fn().mockRejectedValue(new NotFoundException('항목을 찾을 수 없습니다.')),
      update: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue('false') };
    const service = new NotificationsService(
      {} as never,
      {} as never,
      items as never,
      {} as never,
      new CadenceService(),
      config as never,
    );

    await expect(service.handleAction('user-1', 'item-old', 'snooze_3d')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(items.update).not.toHaveBeenCalled();
  });
});
