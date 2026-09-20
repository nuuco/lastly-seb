import { GOLDEN_CASES } from './eval-fixtures';
import { shouldRecordLog } from './save-gate';
import { readName } from './utterance-rules';

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

  it('저장 게이트가 골든셋 save 와 맞는다', () => {
    const miss: string[] = [];
    for (const row of GOLDEN_CASES) {
      if (row.intent === 'query') continue;
      const will = shouldRecordLog(row.text);
      if (will !== row.save) {
        miss.push(`${row.n} want save=${row.save} got ${will} · ${row.text}`);
      }
    }
    expect(miss).toEqual([]);
  });
});
