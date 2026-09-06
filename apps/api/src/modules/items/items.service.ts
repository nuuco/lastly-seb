import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateItemInput, HomeFeed, Item, UpdateItemInput } from '@lastly/contracts';
import { startOfWeek } from 'date-fns';

import { AiClient } from '../../infra/ai/ai.client';
import { CadenceService } from '../cadence/cadence.service';
import { LogsRepository } from './logs.repository';
import { toCadenceRule, toItem } from './items.mapper';
import { ItemsRepository } from './items.repository';

@Injectable()
export class ItemsService {
  constructor(
    private readonly items: ItemsRepository,
    private readonly logs: LogsRepository,
    private readonly cadence: CadenceService,
    private readonly ai: AiClient,
  ) {}

  async list(userId: string, today = new Date()): Promise<Item[]> {
    const rows = await this.items.listActive(userId);
    return rows.map((row) => toItem(row, this.cadence, today));
  }

  async findOne(userId: string, itemId: string, today = new Date()): Promise<Item> {
    return toItem(await this.items.findById(userId, itemId), this.cadence, today);
  }

  /** 홈 화면(04/05/05-B) 한 번의 호출로 필요한 전부. */
  async homeFeed(userId: string, displayName: string | null, today = new Date()): Promise<HomeFeed> {
    const all = await this.list(userId, today);

    const due = all.filter((i) => i.bucket === 'due');
    const upcoming = all.filter((i) => i.bucket === 'upcoming');
    const later = all.filter((i) => i.bucket === 'later');

    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const completedThisWeek = await this.logs.countSince(userId, weekStart);

    const intervals = all.map((i) => i.averageIntervalDays).filter((v): v is number => v !== null);
    const averageIntervalDays = intervals.length
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : null;

    const nextUp = [...upcoming, ...later]
      .filter((i) => i.nextDueOn)
      .sort((a, b) => (a.nextDueOn! < b.nextDueOn! ? -1 : 1))[0];

    return {
      summary: {
        greetingName: displayName,
        completedThisWeek,
        averageIntervalDays,
        overdueCount: due.filter((i) => (i.daysUntilDue ?? 0) < 0).length,
        dueTodayCount: due.length,
        nextUp: nextUp ? { itemId: nextUp.id, name: nextUp.name, dueOn: nextUp.nextDueOn! } : null,
      },
      due,
      upcoming,
      later,
    };
  }

  async create(userId: string, input: CreateItemInput, today = new Date()): Promise<Item> {
    if (await this.items.findByName(userId, input.name)) {
      throw new ConflictException('같은 이름의 항목이 이미 있어요.');
    }

    // 임베딩은 있으면 좋고 없어도 되는 값이다. 실패해도 항목 생성은 진행한다.
    const embedding = (await this.ai.embed(input.name))?.embedding ?? null;

    const row = await this.items.insert(userId, {
      name: input.name,
      cadence: input.cadence,
      cadenceSource: input.cadenceSource,
      embedding,
    });

    if (input.firstDoneOn) {
      await this.logs.insert(userId, row.id, { doneOn: input.firstDoneOn, note: null }, 'manual');
      return this.findOne(userId, row.id, today);
    }

    return toItem(row, this.cadence, today);
  }

  async update(userId: string, itemId: string, input: UpdateItemInput, today = new Date()): Promise<Item> {
    const patch: Record<string, unknown> = {};

    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.cadenceSource !== undefined) patch.cadence_source = input.cadenceSource;
    if (input.cadence) {
      patch.cadence_unit = input.cadence.unit;
      patch.cadence_interval = input.cadence.interval;
      patch.cadence_weekdays = input.cadence.weekdays;
      patch.notify_time = input.cadence.notifyTimeLocal;
      // 사용자가 직접 고른 주기는 AI 제안보다 우선한다.
      patch.cadence_source ??= 'user';
    }

    if (input.snoozedUntil !== undefined) {
      patch.snoozed_until = input.snoozedUntil;

      // 쉬어가기는 주기를 건드리지 않는다. 다음 차례만 그 날짜로 옮긴다.
      // 해제하면 원래 주기가 만들어내는 날짜로 되돌린다.
      const current = await this.items.findById(userId, itemId);
      patch.next_due_on =
        input.snoozedUntil ??
        this.cadence.nextDueOn(current.last_done_on, input.cadence ?? toCadenceRule(current));
    }

    return toItem(await this.items.update(userId, itemId, patch), this.cadence, today);
  }
  async remove(userId: string, itemId: string): Promise<void> {
    await this.items.remove(userId, itemId);
  }

  /** 사용자의 전체 평균 주기 — AI가 개인 성향을 보정할 때 참고한다. */
  async userAverageInterval(userId: string): Promise<number | null> {
    const rows = await this.items.listActive(userId);
    const values = rows.map((r) => r.average_interval_days).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
}
