import type { OnDeviceKnownItem } from '@/features/on-device/types';

import { CLOUD_PARSE_SCHEMA, CLOUD_SYSTEM_PROMPT } from './cloud-prompt.generated';

/**
 * Cloud LLM 줄. 실제 서버(apps/ai)가 Gemini 를 부르는 방식을 브라우저에서 그대로 한다.
 * 지시문·스키마·모델·thinking 설정이 같다 (gemini_provider.py, normalizer.py).
 *
 * 키는 실험실 입력칸에서 받아 이 기기에만 둔다. 코드와 배포 설정에는 넣지 않는다.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface CloudSettings {
  apiKey: string;
  model: string;
  /** 달러 / 100만 토큰. 가격은 자주 바뀌어 사람이 넣는다. */
  priceIn: number | null;
  priceOut: number | null;
}

export interface CloudResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export const EMPTY_CLOUD: CloudSettings = {
  apiKey: '',
  model: DEFAULT_GEMINI_MODEL,
  priceIn: null,
  priceOut: null,
};

const KEY = 'lastly-lab-cloud';

export function loadCloudSettings(): CloudSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_CLOUD, ...(JSON.parse(raw) as Partial<CloudSettings>) } : EMPTY_CLOUD;
  } catch {
    return EMPTY_CLOUD;
  }
}

export function saveCloudSettings(settings: CloudSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/** normalizer.py 의 _build_prompt 와 같은 모양. */
export function buildCloudUserPrompt(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): string {
  // 파이썬 weekday() 는 월요일이 0 이다.
  const day = new Date(`${referenceDate}T00:00:00`).getDay();
  const weekday = '월화수목금토일'[(day + 6) % 7];
  const lines = [`기준일: ${referenceDate} (${weekday}요일)`, '', '사용자가 이미 관리 중인 항목:'];
  if (knownItems.length > 0) {
    for (const item of knownItems) {
      lines.push(`- id=${item.id} | ${item.name} | 마지막: ${item.lastDoneOn ?? '기록 없음'}`);
    }
  } else {
    lines.push('- (없음)');
  }
  lines.push('', `사용자가 말한 문장: "${text}"`);
  return lines.join('\n');
}

export async function callGemini(
  settings: CloudSettings,
  system: string,
  user: string,
  schema: object,
): Promise<CloudResult> {
  if (!settings.apiKey) throw new Error('Gemini API 키를 먼저 넣어 주세요.');
  const response = await fetch(`${BASE_URL}/${settings.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini 오류 ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');
  if (!text.trim()) throw new Error('모델이 빈 응답을 반환했습니다.');
  const usage = body.usageMetadata ?? {};
  return {
    text,
    tokensIn: usage.promptTokenCount ?? 0,
    // 생각에 쓴 토큰도 출력 요금으로 매겨진다.
    tokensOut: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  };
}

export function callCloudParse(
  settings: CloudSettings,
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<CloudResult> {
  return callGemini(
    settings,
    CLOUD_SYSTEM_PROMPT,
    buildCloudUserPrompt(text, referenceDate, knownItems),
    CLOUD_PARSE_SCHEMA,
  );
}

/** 한 번 부르는 데 드는 돈(달러). 단가가 없으면 null. */
export function costUsd(settings: CloudSettings, tokensIn: number, tokensOut: number): number | null {
  if (settings.priceIn === null || settings.priceOut === null) return null;
  return (tokensIn * settings.priceIn + tokensOut * settings.priceOut) / 1_000_000;
}

/** v2 지시문을 Gemini 스키마로. */
export const CLOUD_V2_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['record', 'query'] },
    status: { type: 'STRING', enum: ['완료', '미완료', '미래', '애매', '조회'] },
    item_name: { type: 'STRING', nullable: true },
    days_ago: { type: 'INTEGER', nullable: true },
    stated_cadence_days: { type: 'INTEGER', nullable: true },
  },
  propertyOrdering: ['intent', 'status', 'item_name', 'days_ago', 'stated_cadence_days'],
  required: ['intent', 'status', 'item_name', 'days_ago'],
};
