import type { OnDeviceKnownItem, OnDeviceParseResult } from './types';

/**
 * MediaPipe generateResponse 는 채팅 템플릿을 안 붙인다.
 * Google 웹 샘플과 같이 Gemma 3 턴을 직접 열고, 모델 턴을 `{` 로 시작해
 * 1B가 문장으로 새지 않게 한다.
 */
const INSTRUCTIONS = `문장 하나를 JSON 한 개로 완성해. 설명 금지.

days_ago 규칙 (기준일 기준, 정수만):
- 오늘 / 시간 없음 → 0
- 어제 → 1
- 그저께 → 2
- query(언제·얼마나·?) → 무조건 0

item_name은 행동까지 명사구. 빨았어→빨래, 갈았어→교체, 닦았어→청소.

예1 오늘 이불 빨았어
{"intent":"record","item_name":"이불 빨래","days_ago":0,"matched_item_id":"item-1","candidate_ids":[],"confidence":0.9,"stated_cadence_days":null}

예2 어제 정수기 필터 갈았어
{"intent":"record","item_name":"정수기 필터 교체","days_ago":1,"matched_item_id":"item-2","candidate_ids":[],"confidence":0.9,"stated_cadence_days":null}

예3 이불 언제 빨았지?
{"intent":"query","item_name":"이불 빨래","days_ago":0,"matched_item_id":"item-1","candidate_ids":[],"confidence":0.9,"stated_cadence_days":null}`;

function weekdayLabel(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00`).getDay();
  return '일월화수목금토'[day] ?? '';
}

/** 모델에 줄 지시문. 채팅 템플릿은 런타임마다 다르게 붙인다. */
export function buildParseInstruction(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): string {
  const items =
    knownItems.length === 0
      ? '(없음)'
      : knownItems.map((item) => `id=${item.id} | ${item.name}`).join('\n');

  return [
    INSTRUCTIONS,
    `기준일 ${referenceDate} (${weekdayLabel(referenceDate)}요일)`,
    '기존 항목:',
    items,
    `문장: ${text}`,
  ].join('\n');
}

/** Gemma 3 턴을 직접 열고 모델 턴을 `{` 로 시작한다. */
export function buildParsePrompt(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): string {
  const user = buildParseInstruction(text, referenceDate, knownItems);
  return `<start_of_turn>user\n${user}<end_of_turn>\n<start_of_turn>model\n{`;
}

export function parseModelJson(raw: string): OnDeviceParseResult {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  const daysAgo = Number(parsed.days_ago);
  const stated = parsed.stated_cadence_days;
  const statedDays =
    typeof stated === 'number' && stated >= 1 && stated <= 730 ? Math.round(stated) : null;

  return {
    intent: parsed.intent === 'query' ? 'query' : 'record',
    itemName: typeof parsed.item_name === 'string' ? parsed.item_name : null,
    daysAgo: Number.isFinite(daysAgo) ? Math.max(0, Math.round(daysAgo)) : 0,
    matchedItemId: typeof parsed.matched_item_id === 'string' ? parsed.matched_item_id : null,
    candidateIds: Array.isArray(parsed.candidate_ids)
      ? parsed.candidate_ids.filter((id): id is string => typeof id === 'string')
      : [],
    confidence: clamp01(Number(parsed.confidence)),
    statedCadenceDays: statedDays,
    willSave: parsed.intent !== 'query',
    raw,
  };
}

/**
 * 모델 출력에서 JSON 객체 하나를 꺼낸다.
 * 그대로 읽히지 않으면 키 따옴표가 빠진 경우(`status: "완료"`, `cue":"청소"`)만 고쳐 다시 읽는다.
 * 프롬프트가 '{' 로 끝나서 모델이 첫 키의 여는 따옴표를 빼먹는 일이 잦다.
 */
function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const candidates = [text, `{${text}`, `{"intent":${text}`];

  for (const candidate of candidates) {
    const json = parseObject(candidate);
    if (json) return json;
  }
  for (const candidate of candidates.slice(0, 2)) {
    const json = parseObject(candidate, quoteBareKeys);
    if (json) return json;
  }

  throw new Error(`모델이 JSON이 아니라 문장을 냈습니다: ${text.slice(0, 160)}`);
}

function parseObject(candidate: string, fix?: (slice: string) => string): string | null {
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const slice = fix ? fix(candidate.slice(start, end + 1)) : candidate.slice(start, end + 1);
  try {
    const value = JSON.parse(slice);
    return value && typeof value === 'object' && !Array.isArray(value) ? slice : null;
  } catch {
    return null;
  }
}

/** `{status: …`, `, cue": …` 처럼 따옴표가 없거나 한쪽만 있는 영문 키를 `"key":` 로. */
function quoteBareKeys(slice: string): string {
  return slice.replace(/([{,]\s*)"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:/g, '$1"$2":');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
