import { cadenceDays } from './eval-fixtures';
import type { GoldenCase } from './eval-fixtures';
import type { OnDeviceParseResult } from './types';

export interface SlotMarks {
  intent: boolean;
  days: boolean | 'skip';
  name: 'exact' | 'partial' | 'miss';
  match: boolean;
  cadence: boolean;
  /** 예정·못 함·조회는 로그로 남기면 실패. */
  save: boolean;
}

function nameMark(pred: string | null, gold: string | null): SlotMarks['name'] {
  if (!gold) return pred ? 'partial' : 'exact';
  if (!pred) return 'miss';
  if (pred === gold) return 'exact';
  if (pred.includes(gold) || gold.includes(pred)) return 'partial';
  return 'miss';
}

export function scoreGolden(got: OnDeviceParseResult, gold: GoldenCase): SlotMarks {
  const wantCadence = cadenceDays(gold.cadence);
  const wouldSave = got.willSave;
  return {
    intent: got.intent === gold.intent,
    days: gold.daysAgo == null ? 'skip' : got.daysAgo === gold.daysAgo,
    name: nameMark(got.itemName, gold.itemName),
    match: (got.matchedItemId || null) === (gold.matchId || null),
    cadence: got.statedCadenceDays === wantCadence,
    save: gold.save ? wouldSave : !wouldSave,
  };
}

export function marksOk(marks: SlotMarks): boolean {
  return (
    marks.intent &&
    marks.days !== false &&
    marks.name !== 'miss' &&
    marks.match &&
    marks.cadence &&
    marks.save
  );
}
