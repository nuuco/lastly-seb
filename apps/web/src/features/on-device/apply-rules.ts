import { readUtterance } from '@lastly/parser';

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
 * 1B는 칸을 자주 틀린다. 의도·날짜·주기·이름·저장 여부는 규칙이 먼저 채우고,
 * 모델 값은 규칙이 비울 때만 쓴다. 못/안·완료는 Gemma가 뒤집지 못한다.
 */
export function overlayWithRules(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
  llm: OnDeviceParseResult,
): OnDeviceParseResult {
  const facts = readUtterance(text, new Date(`${referenceDate}T00:00:00`));
  const itemName = facts.sawAction ? facts.name : llm.itemName;

  return {
    ...llm,
    intent: facts.intent,
    itemName,
    daysAgo: facts.intent === 'query' ? 0 : facts.sawDate ? facts.daysAgo : llm.daysAgo,
    statedCadenceDays: facts.statedCadenceDays ?? llm.statedCadenceDays,
    matchedItemId: matchKnown(itemName, knownItems),
    willSave: facts.willSave,
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
  return !parsed.willSave || Boolean(parsed.itemName);
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
