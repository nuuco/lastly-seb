import { extractJsonObject } from '@/features/on-device/parse-prompt';
import type { OnDeviceKnownItem } from '@/features/on-device/types';

import type { GoldenStatus } from './golden';

/**
 * 실험실 전용 지시문 v2. 앱은 parse-prompt.ts 의 v1 을 쓴다.
 *
 * v1 은 의도·이름·날짜만 묻고, 했는지 여부는 규칙이 정한다.
 * 그래서 v1 로는 엔진마다 False Completion 이 같다.
 * v2 는 모델에게 status 를 직접 묻고, 앞으로의 날짜를 음수로 받는다.
 * 예시 문장은 골든셋과 겹치지 않게 골랐다.
 */
const INSTRUCTIONS_V2 = `문장 하나를 JSON 한 개로 완성해. 설명 금지.

status 규칙:
- 완료: 이미 한 일 (했어, 빨았어, 갈았어)
- 미완료: 못 했거나 안 한 일 (못, 안, 아직)
- 미래: 앞으로 할 일 (할 거야, 하려고, 할게, 예정)
- 애매: 했는지 확실하지 않음 (것 같은데, 했나, 기억이 안 나)
- 조회: 언제 했는지 묻는 말 (언제, 얼마나, ?)

days_ago 규칙 (기준일 기준, 정수만):
- 오늘 / 시간 없음 → 0
- 어제 → 1, 그저께 → 2
- 내일 → -1, 모레 → -2 (앞으로는 음수)
- 조회이거나 알 수 없으면 null

item_name은 행동까지 명사구. 빨았어→빨래, 갈았어→교체, 닦았어→청소.

예1 어제 수건 삶았어
{"intent":"record","status":"완료","item_name":"수건 삶기","days_ago":1,"stated_cadence_days":null}

예2 내일 창문 닦을 거야
{"intent":"record","status":"미래","item_name":"창문 청소","days_ago":-1,"stated_cadence_days":null}

예3 베란다 청소 아직 못 했어
{"intent":"record","status":"미완료","item_name":"베란다 청소","days_ago":0,"stated_cadence_days":null}

예4 운동화 빨았던 것 같은데
{"intent":"record","status":"애매","item_name":"운동화 빨래","days_ago":null,"stated_cadence_days":null}

예5 수건 언제 삶았지?
{"intent":"query","status":"조회","item_name":"수건 삶기","days_ago":null,"stated_cadence_days":null}`;

export function buildInstructionV2(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): string {
  const weekday = '일월화수목금토'[new Date(`${referenceDate}T00:00:00`).getDay()] ?? '';
  const items =
    knownItems.length === 0
      ? '(없음)'
      : knownItems.map((item) => `id=${item.id} | ${item.name}`).join('\n');
  return [
    INSTRUCTIONS_V2,
    `기준일 ${referenceDate} (${weekday}요일)`,
    '기존 항목:',
    items,
    `문장: ${text}`,
  ].join('\n');
}

export const RESPONSE_SCHEMA_V2 = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['record', 'query'] },
    status: { type: 'string', enum: ['완료', '미완료', '미래', '애매', '조회'] },
    item_name: { type: ['string', 'null'] },
    days_ago: { type: ['integer', 'null'] },
    stated_cadence_days: { type: ['integer', 'null'] },
  },
  required: ['intent', 'status', 'item_name', 'days_ago'],
};

export interface V2Result {
  intent: 'record' | 'query';
  status: GoldenStatus | null;
  itemName: string | null;
  daysAgo: number | null;
}

export function parseV2(raw: string): V2Result {
  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const status = parsed.status;
  const days = Number(parsed.days_ago);
  const intent = parsed.intent === 'query' || status === '조회' ? 'query' : 'record';
  return {
    intent,
    status:
      intent === 'query'
        ? '조회'
        : typeof status === 'string' && ['완료', '미완료', '미래', '애매'].includes(status)
          ? (status as GoldenStatus)
          : null,
    itemName: typeof parsed.item_name === 'string' ? parsed.item_name : null,
    daysAgo: parsed.days_ago === null || !Number.isFinite(days) ? null : Math.round(days),
  };
}
