import { classifySave, readUtterance } from '@lastly/parser';
import {
  RULE_GOLDEN_CASES,
  RULE_GOLDEN_REFERENCE_DATE,
  type GoldenIntent,
  type RuleGoldenCase,
} from './rule-golden.cases';

const REFERENCE_DATE = new Date(`${RULE_GOLDEN_REFERENCE_DATE}T00:00:00`);

function toGoldenIntent(kind: ReturnType<typeof classifySave>['kind']): GoldenIntent {
  switch (kind) {
    case 'completed':
      return 'COMPLETED';
    case 'incomplete':
      return 'NOT_COMPLETED';
    case 'planned':
      return 'PLANNED';
    case 'query':
      return 'QUERY';
    case 'uncertain':
      return 'UNCERTAIN';
    case 'none':
      return 'UNKNOWN';
  }
}

function evaluateGoldenCase(golden: RuleGoldenCase) {
  const save = classifySave(golden.text, REFERENCE_DATE);
  const utterance = readUtterance(golden.text, REFERENCE_DATE);
  return {
    intent: toGoldenIntent(save.kind),
    recordCandidate: save.willSave,
    daysAgo: utterance.daysAgo,
    cadenceDays: utterance.statedCadenceDays,
    normalizedName: utterance.name,
  };
}

describe('Rule Engine Golden Test', () => {
  it('has the minimum fixed coverage for every agreed semantic category', () => {
    expect(RULE_GOLDEN_CASES.length).toBeGreaterThanOrEqual(30);

    const categories = new Set(RULE_GOLDEN_CASES.map((golden) => golden.category));
    expect(categories).toEqual(
      new Set(['completed', 'not_completed', 'planned', 'query', 'uncertain', 'unknown', 'false_completion_date']),
    );
    expect(RULE_GOLDEN_CASES.filter((golden) => !golden.expected.recordCandidate).length).toBeGreaterThanOrEqual(20);
  });

  it.each([...RULE_GOLDEN_CASES])('$id: $text', (golden) => {
    const actual = evaluateGoldenCase(golden);

    expect(actual.intent).toBe(golden.expected.intent);
    expect(actual.recordCandidate).toBe(golden.expected.recordCandidate);

    if (golden.expected.daysAgo !== undefined) {
      expect(actual.daysAgo).toBe(golden.expected.daysAgo);
    }
    if (golden.expected.cadenceDays !== undefined) {
      expect(actual.cadenceDays).toBe(golden.expected.cadenceDays);
    }
    if (golden.expected.normalizedName !== undefined) {
      expect(actual.normalizedName).toBe(golden.expected.normalizedName);
    }
  });

  it('has zero false completions across every non-completing category', () => {
    const falseCompletions = RULE_GOLDEN_CASES.filter((golden) => {
      if (golden.expected.recordCandidate) return false;
      return evaluateGoldenCase(golden).recordCandidate;
    }).map((golden) => golden.id);

    expect(falseCompletions).toEqual([]);
  });

  it('prints a repeatable category baseline for future engine comparisons', () => {
    const started = performance.now();
    const summary = new Map<string, { total: number; passed: number }>();

    for (const golden of RULE_GOLDEN_CASES) {
      const actual = evaluateGoldenCase(golden);
      const passed =
        actual.intent === golden.expected.intent &&
        actual.recordCandidate === golden.expected.recordCandidate;
      const current = summary.get(golden.category) ?? { total: 0, passed: 0 };
      current.total += 1;
      if (passed) current.passed += 1;
      summary.set(golden.category, current);
    }

    const elapsedMs = performance.now() - started;
    const baseline = [...summary.entries()]
      .map(([category, score]) => `${category}=${score.passed}/${score.total}`)
      .join(' ');
    console.log(`[golden] cases=${RULE_GOLDEN_CASES.length} ${baseline} elapsedMs=${elapsedMs.toFixed(2)}`);

    expect([...summary.values()].every((score) => score.passed === score.total)).toBe(true);
  });
});
