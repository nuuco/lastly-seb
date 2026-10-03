import { NotFoundException } from '@nestjs/common';

import { assertNotFuture, LogsService } from './logs.service';

describe('assertNotFuture', () => {
  const today = new Date('2026-09-06T12:00:00');

  it('오늘과 지난 날짜는 통과한다', () => {
    expect(() => assertNotFuture('2026-09-06', today)).not.toThrow();
    expect(() => assertNotFuture('2025-01-01', today)).not.toThrow();
  });

  it('오늘 이후 날짜는 거절한다', () => {
    expect(() => assertNotFuture('2026-09-07', today)).toThrow('오늘 이후 날짜로는 기록할 수 없어요.');
  });
});

describe('LogsService — 지운 항목', () => {
  const gone = () => {
    const items = {
      findActiveById: jest.fn().mockRejectedValue(new NotFoundException('항목을 찾을 수 없습니다.')),
    };
    const logs = { insert: jest.fn(), listByItem: jest.fn() };
    const service = new LogsService(logs as never, items as never);
    return { service, logs };
  };

  it('기록을 더하지 않는다', async () => {
    const { service, logs } = gone();
    await expect(service.add('user-1', 'item-old', { doneOn: '2020-01-01', note: null })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(logs.insert).not.toHaveBeenCalled();
  });

  it('"오늘 했어요" 를 기록하지 않는다', async () => {
    const { service, logs } = gone();
    await expect(service.completeToday('user-1', 'item-old')).rejects.toBeInstanceOf(NotFoundException);
    expect(logs.insert).not.toHaveBeenCalled();
  });

  it('지난 기록을 보여주지 않는다', async () => {
    const { service, logs } = gone();
    await expect(service.listByItem('user-1', 'item-old')).rejects.toBeInstanceOf(NotFoundException);
    expect(logs.listByItem).not.toHaveBeenCalled();
  });
});
