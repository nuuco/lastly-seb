import type { CadenceRule, Item } from '@lastly/contracts';

import { CadenceService } from '../cadence/cadence.service';
import type { ItemRow } from './items.repository';

export function toCadenceRule(row: ItemRow): CadenceRule {
  return {
    unit: row.cadence_unit,
    interval: row.cadence_interval,
    weekdays: row.cadence_weekdays ?? [],
    notifyTimeLocal: row.notify_time ? row.notify_time.slice(0, 5) : null,
  };
}

/** DB 행 → API 응답. 파생값(경과일·D-n·버킷)은 여기서 한 번만 계산한다. */
export function toItem(row: ItemRow, cadence: CadenceService, today: Date): Item {
  const daysUntilDue = cadence.daysUntil(row.next_due_on, today);

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    cadence: toCadenceRule(row),
    cadenceSource: row.cadence_source,
    lastDoneOn: row.last_done_on,
    nextDueOn: row.next_due_on,
    snoozedUntil: row.snoozed_until,
    daysSinceLastDone: cadence.daysSince(row.last_done_on, today),
    daysUntilDue,
    bucket: cadence.bucketFor(daysUntilDue),
    averageIntervalDays: row.average_interval_days,
    logCount: row.log_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
