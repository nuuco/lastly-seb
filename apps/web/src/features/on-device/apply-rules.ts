import {
  readCadenceDays,
  readDaysAgo,
  readIntent,
  readNameWithAction,
} from '@lastly/parser';

import type { OnDeviceKnownItem, OnDeviceParseResult } from './types';

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

/**
 * 1B는 칸을 자주 틀린다. 본선과 같이 의도·날짜·주기·이름은 규칙이 먼저 채우고,
 * 모델 값은 규칙이 비울 때만 쓴다.
 *
 * 이름은 sawAction까지 봐야 한다. 행동을 못 찾았으면 readName은 문장 조각을
 * 남기는데, 그건 이름이 아니다. 그럴 땐 모델 값을 쓴다.
 */
export function overlayWithRules(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
  llm: OnDeviceParseResult,
): OnDeviceParseResult {
  const reference = new Date(`${referenceDate}T00:00:00`);
  const intent = readIntentFixed(text);
  const { name: named, sawAction } = readNameWithAction(text);
  const dated = readDaysAgo(text, reference);
  const cadence = readCadenceDays(text);
  const itemName = sawAction ? named : llm.itemName;
  const matchedItemId = matchKnown(itemName, knownItems);
  const daysAgo = intent === 'query' ? 0 : dated.saw ? dated.daysAgo : llm.daysAgo;

  return {
    ...llm,
    intent,
    itemName,
    daysAgo,
    statedCadenceDays: cadence ?? llm.statedCadenceDays,
    matchedItemId,
    willSave: intent === 'query' ? false : shouldRecordLog(text),
  };
}

export function parseWithRulesOnly(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): OnDeviceParseResult {
  return overlayWithRules(text, referenceDate, knownItems, EMPTY_LLM);
}

/** 규칙이 이름(행동 확인)을 뽑았거나, 저장하지 않을 말이면 모델을 안 돌린다. */
export function rulesFinished(parsed: OnDeviceParseResult): boolean {
  if (!parsed.willSave) return true;
  return Boolean(parsed.itemName);
}

/** "빨았어, 일주일마다 알려줘" 는 조회가 아니라 기록+알림이다. */
export function readIntentFixed(text: string): 'record' | 'query' {
  const intent = readIntent(text);
  if (intent !== 'query') return intent;
  if (!/알려\s*줘|알려줄래/.test(text)) return intent;
  if (/(?:언제|얼마나|며칠|얼마만|몇\s*일|지\s*(?:얼마|몇)|\?|？)/.test(text)) return 'query';
  if (DONE_VERB.test(text)) return 'record';
  return intent;
}

const DONE_VERB =
  /(?:했어|했다|했음|빨았어|빨아놨어|갈았어|닦았어|돌렸어|버렸어|끝냈어|시켰어|청소했어)/;

export function shouldRecordLog(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  const hardFail =
    /못\s*했|안\s*했|하지\s*못|아직(?:이야|\s*안|\s*못)|안\s*(?:빨았|갈았|닦았|시켰)|못\s*한|안\s*한/.test(
      t,
    );
  if (hardFail) return false;

  const future =
    /내일|모레|이따가|예정|하려고|할(?:래|게)|할\s*거야|빨\s*거야|시킬게|버릴게|돌릴\s*예정|다음\s*주/.test(
      t,
    );
  const only = /만\s*(?:빨|갈|닦|했|끝냈)/.test(t);
  if (future && only && DONE_VERB.test(t)) return true;
  if (future) return false;
  return true;
}

export function matchKnown(name: string | null, items: OnDeviceKnownItem[]): string | null {
  if (!name || items.length === 0) return null;
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const exact = items.filter((item) => item.name === trimmed);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) return null;

  const contained = items.filter(
    (item) => item.name.includes(trimmed) || trimmed.includes(item.name),
  );
  if (contained.length === 1) return contained[0]!.id;
  return null;
}
