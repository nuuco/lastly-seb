import { ConflictException, NotFoundException } from '@nestjs/common';

import type { AiClient } from '../../infra/ai/ai.client';
import { CadenceService } from '../cadence/cadence.service';
import type { ItemRow, ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';
import type { LogsRepository } from './logs.repository';

/**
 * 이름 유일성은 쓰고 있는 항목끼리만 따진다.
 * 지운 항목은 보관으로 남으므로, 되살릴 때 그 사이 생긴 같은 이름과 부딪칠 수 있다.
 */

const row = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: 'item-old',
  user_id: 'user-1',
  name: '이불 빨래',
  status: 'archived',
  cadence_unit: 'week',
  cadence_interval: 2,
  cadence_weekdays: [],
  notify_time: null,
  cadence_source: 'personal',
  last_done_on: '2026-08-25',
  next_due_on: '2026-09-08',
  snoozed_until: null,
  average_interval_days: 14,
  log_count: 4,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
});

function buildService(activeWithSameName: ItemRow | null) {
  const items = {
    findById: jest.fn().mockResolvedValue(row()),
    findByName: jest.fn().mockResolvedValue(activeWithSameName),
    restore: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ItemsService(
    items as unknown as ItemsRepository,
    {} as LogsRepository,
    new CadenceService(),
    {} as AiClient,
  );
  return { service, items };
}

describe('ItemsService.restore', () => {
  it('같은 이름을 쓰는 항목이 없으면 되살린다', async () => {
    const { service, items } = buildService(null);

    await service.restore('user-1', 'item-old');

    expect(items.findByName).toHaveBeenCalledWith('user-1', '이불 빨래');
    expect(items.restore).toHaveBeenCalledWith('user-1', 'item-old');
  });

  it('지운 뒤 같은 이름으로 새로 만들었으면 되살리지 않는다', async () => {
    const { service, items } = buildService(row({ id: 'item-new', status: 'active' }));

    await expect(service.restore('user-1', 'item-old')).rejects.toBeInstanceOf(ConflictException);
    expect(items.restore).not.toHaveBeenCalled();
  });
});

describe('ItemsService.create', () => {
  it('첫 기록이 오늘 이후 날짜면 항목을 만들기 전에 거절한다', async () => {
    const items = { findByName: jest.fn().mockResolvedValue(null), insert: jest.fn() };
    const ai = { embed: jest.fn() };
    const service = new ItemsService(
      items as unknown as ItemsRepository,
      {} as LogsRepository,
      new CadenceService(),
      ai as unknown as AiClient,
    );

    await expect(
      service.create(
        'user-1',
        {
          name: '화분 물주기',
          cadence: { unit: 'week', interval: 1, weekdays: [], notifyTimeLocal: null },
          cadenceSource: 'user',
          firstDoneOn: '2026-09-07',
        },
        new Date('2026-09-06T12:00:00'),
      ),
    ).rejects.toThrow('오늘 이후 날짜로는 기록할 수 없어요.');
    expect(items.insert).not.toHaveBeenCalled();
  });
});

describe('ItemsService — 지운 항목', () => {
  const gone = () => {
    const items = {
      findActiveById: jest.fn().mockRejectedValue(new NotFoundException('항목을 찾을 수 없습니다.')),
      update: jest.fn(),
    };
    const service = new ItemsService(
      items as unknown as ItemsRepository,
      {} as LogsRepository,
      new CadenceService(),
      {} as AiClient,
    );
    return { service, items };
  };

  it('상세를 열지 않는다', async () => {
    const { service } = gone();
    await expect(service.findOne('user-1', 'item-old')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('이름·주기·쉬어가기를 고치지 않는다', async () => {
    const { service, items } = gone();
    await expect(service.update('user-1', 'item-old', { snoozedUntil: null })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(items.update).not.toHaveBeenCalled();
  });
});
