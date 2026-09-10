import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CalendarMark,
  CalendarMonth,
  CreateItemInput,
  HomeFeed,
  Item,
  SearchResult,
  UpdateItemInput,
} from '@lastly/contracts';
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfWeek } from 'date-fns';

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
    await this.items.archive(userId, itemId);
  }

  /**
   * 항목 이름과 기록 메모를 함께 뒤진다 — 설계 05-D.
   *
   * 메모를 같이 찾는 게 요점이다. "필터 두 장 남음" 처럼 그때 적어둔 말은
   * 항목 이름에는 없지만 사용자가 기억하는 단서다.
   */
  async search(userId: string, query: string, today = new Date()): Promise<SearchResult> {
    const q = query.trim();
    if (!q) return { items: [], notes: [] };

    const [rows, notes] = await Promise.all([
      this.items.searchByName(userId, q),
      this.logs.searchByNote(userId, q),
    ]);

    return {
      items: rows.map((row) => toItem(row, this.cadence, today)),
      notes: notes.map((n) => ({
        logId: n.id,
        itemId: n.item_id,
        itemName: n.items.name,
        doneOn: n.done_on,
        note: n.note,
      })),
    };
  }

  /**
   * 한 달치 달력 — 설계 05-C.
   *
   * 예정일은 각 항목의 다음 한 번만 찍는다. 주기로 앞날을 계속 그려내면
   * 아직 일어나지 않은 일이 사실처럼 보이는데, 주기는 기록이 쌓이면 바뀐다.
   */
  async calendar(userId: string, month: string, today = new Date()): Promise<CalendarMonth> {
    const from = `${month}-01`;
    const to = format(endOfMonth(parseISO(from)), 'yyyy-MM-dd');
    const todayIso = format(today, 'yyyy-MM-dd');

    const [rows, logs] = await Promise.all([
      this.items.listActive(userId),
      this.logs.listBetween(userId, from, to),
    ]);

    const days: Record<string, CalendarMark[]> = {};
    const push = (date: string, mark: CalendarMark) => {
      (days[date] ??= []).push(mark);
    };

    for (const log of logs) {
      push(log.done_on, {
        itemId: log.item_id,
        name: log.items.name,
        kind: 'done',
        overdueDays: null,
      });
    }

    for (const row of rows) {
      const due = row.next_due_on;
      if (!due || due < from || due > to) continue;

      const overdue = due < todayIso;
      push(due, {
        itemId: row.id,
        name: row.name,
        kind: overdue ? 'overdue' : 'due',
        overdueDays: overdue ? differenceInCalendarDays(parseISO(todayIso), parseISO(due)) : null,
      });
    }

    return { month, days };
  }

  async restore(userId: string, itemId: string): Promise<void> {
    await this.items.restore(userId, itemId);
  }

  /** 사용자의 전체 평균 주기 — AI가 개인 성향을 보정할 때 참고한다. */
  async userAverageInterval(userId: string): Promise<number | null> {
    const rows = await this.items.listActive(userId);
    const values = rows.map((r) => r.average_interval_days).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
}
