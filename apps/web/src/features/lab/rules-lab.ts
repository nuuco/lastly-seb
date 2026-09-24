import {
  getRuleTables,
  setRuleOverrides,
  type RuleOverrides,
  type RuleTableName,
} from '@lastly/parser';

/**
 * 실험실에서 바꾼 규칙. 이 기기에만 저장하고, parser 의 setRuleOverrides 로 적용한다.
 * 앱 화면은 이 파일을 부르지 않으므로 원래 규칙 그대로다.
 */
export type RuleKey = RuleTableName | 'actionNouns';

export const RULE_TABLES: Array<{ key: RuleKey; constName: string; label: string; hint: string }> = [
  { key: 'incomplete', constName: 'INCOMPLETE', label: '미완료', hint: '못 했다 → 저장 안 함' },
  { key: 'planned', constName: 'PLANNED', label: '미래', hint: '할 거다 → 저장 안 함 (완료 표시가 없을 때만)' },
  { key: 'uncertain', constName: 'UNCERTAIN', label: '애매', hint: '했는지 모름 → 저장 안 함' },
  { key: 'completed', constName: 'COMPLETED', label: '완료 표시', hint: '있으면 미래보다 우선' },
  { key: 'query', constName: 'QUERY', label: '조회', hint: '묻는 말 → 기록 안 함' },
  { key: 'actionNouns', constName: 'ACTION_NOUNS', label: '동사 → 이름', hint: '"정규식 → 명사", 위에서부터 처음 맞는 것' },
];

export interface RuleEdit {
  add: Partial<Record<RuleTableName, string[]>> & { actionNouns?: Array<[string, string]> };
  disabled: Partial<Record<RuleKey, number[]>>;
}

export const EMPTY_EDIT: RuleEdit = { add: {}, disabled: {} };

const KEY = 'lastly-lab-rules';

export function baseRules() {
  return getRuleTables();
}

export function isEmptyEdit(edit: RuleEdit): boolean {
  const added = Object.values(edit.add).some((list) => (list?.length ?? 0) > 0);
  const off = Object.values(edit.disabled).some((list) => (list?.length ?? 0) > 0);
  return !added && !off;
}

/** 결과 표에서 규칙 버전을 가르는 짧은 표시. 원래 규칙이면 빈 문자열. */
export function ruleTag(edit: RuleEdit): string {
  if (isEmptyEdit(edit)) return '';
  const text = JSON.stringify(edit);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36).slice(0, 5);
}

/** 적용한다. 잘못된 정규식이면 던지고 이전 규칙을 유지한다. */
export function applyRuleEdit(edit: RuleEdit): void {
  if (isEmptyEdit(edit)) {
    setRuleOverrides(null);
    return;
  }
  setRuleOverrides(edit as RuleOverrides);
}

export function loadRuleEdit(): RuleEdit {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_EDIT;
    const parsed = JSON.parse(raw) as Partial<RuleEdit>;
    return { add: parsed.add ?? {}, disabled: parsed.disabled ?? {} };
  } catch {
    return EMPTY_EDIT;
  }
}

export function saveRuleEdit(edit: RuleEdit): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(edit));
  } catch {
    // ignore
  }
}

/** 실험실에 다시 올릴 수 있는 규칙 JSON. 원래 표도 함께 담는다. */
export function ruleEditJson(edit: RuleEdit): string {
  return JSON.stringify({ kind: 'lastly-rule-edit', base: baseRules(), ...edit }, null, 2);
}

export function parseRuleEditJson(text: string): RuleEdit {
  const parsed = JSON.parse(text) as Partial<RuleEdit> & { kind?: string };
  if (parsed.kind !== 'lastly-rule-edit') throw new Error('실험실에서 내려받은 규칙 JSON 이 아니에요.');
  return { add: parsed.add ?? {}, disabled: parsed.disabled ?? {} };
}

/**
 * utterance-rules.ts 에 그대로 붙일 배열. 바뀐 표만 낸다.
 * 추가한 패턴은 맨 앞, 끈 패턴은 뺀 모양이다.
 */
export function ruleEditTs(edit: RuleEdit): string {
  const base = baseRules();
  const blocks: string[] = [
    '// 온디바이스 실험실에서 만든 규칙. packages/parser/src/utterance-rules.ts 의 같은 이름 배열을 바꾼다.\n' +
      '// 반영한 뒤 pnpm --filter @lastly/api test 로 확인한다.',
  ];
  for (const table of RULE_TABLES) {
    const off = new Set(edit.disabled[table.key] ?? []);
    if (table.key === 'actionNouns') {
      const added = edit.add.actionNouns ?? [];
      if (added.length === 0 && off.size === 0) continue;
      const rows = [
        ...added.map(([source, noun]) => `  [/${source}/, '${noun}'], // 추가`),
        ...base.actionNouns
          .map(([source, noun], i) => (off.has(i) ? null : `  [/${source}/, '${noun}'],`))
          .filter(Boolean),
      ];
      blocks.push(`const ACTION_NOUNS: Array<[RegExp, string]> = [\n${rows.join('\n')}\n];`);
      continue;
    }
    const key = table.key as RuleTableName;
    const added = edit.add[key] ?? [];
    if (added.length === 0 && off.size === 0) continue;
    const rows = [
      ...added.map((source) => `  /${source}/, // 추가`),
      ...base[key].map((source, i) => (off.has(i) ? null : `  /${source}/,`)).filter(Boolean),
    ];
    blocks.push(`const ${table.constName} = [\n${rows.join('\n')}\n];`);
  }
  return blocks.join('\n\n') + '\n';
}
