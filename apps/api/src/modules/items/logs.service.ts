import { Injectable } from '@nestjs/common';
import type { CompleteItemResult, CreateLogInput, LogEntry, UpdateLogInput } from '@lastly/contracts';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

import { ItemsRepository } from './items.repository';
import { LogsRepository, type LogRow } from './logs.repository';

@Injectable()
export class LogsService {
  constructor(
    private readonly logs: LogsRepository,
    private readonly items: ItemsRepository,
  ) {}

  /**
   * 화면 11의 "지난 기록". 각 기록에 직전 기록과의 간격("16일 만에")을 붙인다.
   * 목록이 최신순이므로 다음 원소가 직전 기록이다.
   */
  async listByItem(userId: string, itemId: string): Promise<LogEntry[]> {
    const rows = await this.logs.listByItem(userId, itemId);
    return rows.map((row, index) => this.toEntry(row, rows[index + 1] ?? null));
  }

  async add(
    userId: string,
    itemId: string,
    input: CreateLogInput,
    source: LogRow['source'] = 'manual',
    rawInput: string | null = null,
  ): Promise<LogEntry> {
    const row = await this.logs.insert(userId, itemId, input, source, rawInput);
    return this.toEntry(row, null);
  }

  /** "오늘 했어요" — 화면 05/11/14의 주 액션. */
  async completeToday(userId: string, itemId: string, today = new Date()): Promise<CompleteItemResult> {
    const doneOn = format(today, 'yyyy-MM-dd');
    const row = await this.logs.insert(userId, itemId, { doneOn, note: null }, 'manual');

    // 트리거가 next_due_on을 다시 계산한 뒤의 값을 읽어야 한다.
    const item = await this.items.findById(userId, itemId);

    return {
      log: this.toEntry(row, null),
      itemId,
      itemName: item.name,
      nextDueOn: item.next_due_on,
      undoToken: row.id,
    };
  }

  /** 토스트의 "되돌리기". 방금 만든 기록만 지운다. */
  async undo(userId: string, undoToken: string): Promise<void> {
    await this.logs.remove(userId, undoToken);
  }

  async update(userId: string, logId: string, input: UpdateLogInput): Promise<LogEntry> {
    const patch: Record<string, unknown> = {};
    if (input.doneOn !== undefined) patch.done_on = input.doneOn;
    if (input.note !== undefined) patch.note = input.note;

    return this.toEntry(await this.logs.update(userId, logId, patch), null);
  }

  async remove(userId: string, logId: string): Promise<void> {
    await this.logs.remove(userId, logId);
  }

  private toEntry(row: LogRow, previous: LogRow | null): LogEntry {
    return {
      id: row.id,
      itemId: row.item_id,
      doneOn: row.done_on,
      note: row.note,
      gapDays: previous ? differenceInCalendarDays(parseISO(row.done_on), parseISO(previous.done_on)) : null,
      createdAt: row.created_at,
    };
  }
}
