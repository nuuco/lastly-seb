import type { OnDeviceParseResult } from './types';

/**
 * MediaPipe generateResponse 는 채팅 템플릿을 안 붙인다.
 * Google 웹 샘플과 같이 Gemma 3 턴을 직접 열고, 모델 턴을 `{` 로 시작해
 * 문장으로 새지 않게 한다.
 *
 * 모델이 채우는 칸은 사실상 item_name 하나다. 의도·날짜·저장 여부는 규칙이 덮는다.
 * - say 에 문장을 옮겨 적게 해 이름을 문장 안에서 고르게 한다. 파서는 say 를 읽지 않는다.
 * - 기존 항목 목록은 넣지 않는다. 270M 이 목록의 이름을 베껴 답했다.
 *   항목 연결은 matchKnown·서버가 이름으로 다시 한다.
 * - 예시 id 는 넣지 않는다. 실제 항목 id 로 오인한다.
 */
const INSTRUCTIONS = `문장에서 한 일을 찾아 JSON 으로 답해.
say 에는 문장을 그대로 옮겨 적어.
item_name 에는 say 에 있는 물건 + 한 일을 명사로 적어.
한 일이 안 보이면 say 에 있는 물건 이름만 적어.
say 에 없는 물건은 쓰지 마. 물건도 없으면 item_name 은 null.

문장: 욕조 배수구 머리카락 뺌
{"say":"욕조 배수구 머리카락 뺌","item_name":"욕조 배수구 청소","intent":"record","days_ago":0}

문장: 어제 화분 분갈이
{"say":"어제 화분 분갈이","item_name":"화분 분갈이","intent":"record","days_ago":1}

문장: 고양이 화장실 모래
{"say":"고양이 화장실 모래","item_name":"고양이 화장실 모래","intent":"record","days_ago":0}

문장: 식세기 필터 싹 헹굼
{"say":"식세기 필터 싹 헹굼","item_name":"식세기 필터 청소","intent":"record","days_ago":0}

문장: 음 그거 있잖아 그거
{"say":"음 그거 있잖아 그거","item_name":null,"intent":"record","days_ago":0}`;

/** 모델에 줄 지시문. 채팅 템플릿은 런타임마다 다르게 붙인다. */
export function buildParseInstruction(text: string): string {
  return `${INSTRUCTIONS}\n\n문장: ${text}`;
}

/** Gemma 3 턴을 직접 열고 모델 턴을 `{` 로 시작한다. */
export function buildParsePrompt(text: string): string {
  return `<start_of_turn>user\n${buildParseInstruction(text)}<end_of_turn>\n<start_of_turn>model\n{`;
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
