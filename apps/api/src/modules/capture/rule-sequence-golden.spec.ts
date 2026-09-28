import { classifySave, readUtterance } from '@lastly/parser';
import {
  RULE_SEQUENCE_GOLDEN_CASES,
} from './rule-sequence-golden.cases';
import {
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

function evaluate(golden: RuleGoldenCase) {
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

describe('Rule Engine 500-sentence completion-and-cadence corpus', () => {
  it('contains exactly 500 deterministic sentences', () => {
    expect(RULE_SEQUENCE_GOLDEN_CASES).toHaveLength(500);
    expect(new Set(RULE_SEQUENCE_GOLDEN_CASES.map((golden) => golden.id)).size).toBe(500);
  });

  it.each([...RULE_SEQUENCE_GOLDEN_CASES])('$id: $text', (golden) => {
    const actual = evaluate(golden);

    expect(actual.intent).toBe(golden.expected.intent);
    expect(actual.recordCandidate).toBe(golden.expected.recordCandidate);
    expect(actual.daysAgo).toBe(golden.expected.daysAgo);
    expect(actual.cadenceDays).toBe(golden.expected.cadenceDays);
    expect(actual.normalizedName).toBe(golden.expected.normalizedName);
  });

  it('does not produce a false completion in the whole corpus', () => {
    const falseCompletions = RULE_SEQUENCE_GOLDEN_CASES.filter(
      (golden) => !golden.expected.recordCandidate && evaluate(golden).recordCandidate,
    );
    expect(falseCompletions).toEqual([]);
  });
});
