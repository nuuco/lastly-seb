import { overlayWithRules } from '../../../../web/src/features/on-device/apply-rules';
import {
  GOLDEN_CASES,
  GOLDEN_KNOWN_ITEMS,
  GOLDEN_REF_DATE,
} from '../../../../web/src/features/on-device/eval-fixtures';
import { marksOk, scoreGolden } from '../../../../web/src/features/on-device/score-golden';
import type { OnDeviceParseResult } from '../../../../web/src/features/on-device/types';
import { readName } from './utterance-rules';

const EMPTY_LLM: OnDeviceParseResult = {
  intent: 'record',
  itemName: null,
  daysAgo: 0,
  matchedItemId: null,
  candidateIds: [],
  confidence: 0,
  statedCadenceDays: null,
  willSave: true,
  raw: '',
};

function nameMark(pred: string | null, gold: string | null): 'exact' | 'partial' | 'miss' {
  if (!gold) return pred ? 'partial' : 'exact';
  if (!pred) return 'miss';
  if (pred === gold) return 'exact';
  if (pred.includes(gold) || gold.includes(pred)) return 'partial';
  return 'miss';
}

describe('골든셋 이름', () => {
  it('규칙 이름이 골든셋을 빗나가지 않는다', () => {
    const miss: string[] = [];
    for (const row of GOLDEN_CASES) {
      const got = readName(row.text);
      if (nameMark(got, row.itemName) === 'miss') {
        miss.push(`${row.n} want ${row.itemName} got ${got}`);
      }
    }
    expect(miss).toEqual([]);
  });

  it('규칙만으로 슬롯을 채운다', () => {
    const tally = { intent: 0, name: 0, days: 0, match: 0, cadence: 0, save: 0, all: 0 };
    let daysGraded = 0;
    const failedAll: string[] = [];
    for (const row of GOLDEN_CASES) {
      const got = overlayWithRules(row.text, GOLDEN_REF_DATE, GOLDEN_KNOWN_ITEMS, EMPTY_LLM);
      const marks = scoreGolden(got, row);
      if (marks.intent) tally.intent++;
      if (marks.name !== 'miss') tally.name++;
      if (marks.days !== 'skip') {
        daysGraded++;
        if (marks.days) tally.days++;
      }
      if (marks.match) tally.match++;
      if (marks.cadence) tally.cadence++;
      if (marks.save) tally.save++;
      if (marksOk(marks)) tally.all++;
      else failedAll.push(`${row.n} ${row.text}`);
    }
    console.log(
      `\n  전부 ${tally.all}/${GOLDEN_CASES.length}` +
        `\n  의도 ${tally.intent} · 이름 ${tally.name} · 날짜 ${tally.days}/${daysGraded}` +
        ` · 매칭 ${tally.match} · 주기 ${tally.cadence} · 저장 ${tally.save}\n`,
    );
    expect(tally).toEqual({
      intent: 78,
      name: 79,
      days: 45,
      match: 77,
      cadence: 78,
      save: 76,
      all: 70,
    });
    expect(daysGraded).toBe(48);
    expect(failedAll).toHaveLength(9);
  });
});
