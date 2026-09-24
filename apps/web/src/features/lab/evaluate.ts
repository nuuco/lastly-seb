import { generateOnDevice } from '@/features/on-device/engine';
import { interpretLocally } from '@/features/on-device/parse-local';
import type { OnDeviceKnownItem } from '@/features/on-device/types';

import { resolveDaysAgo, type GoldenCase, type GoldenStatus } from './golden';
import { buildInstructionV2, parseV2, RESPONSE_SCHEMA_V2 } from './prompt-v2';

/**
 * 엔진이 낸 결과를 표 2 칸으로 바꿔 채점한다.
 *
 * 실사용(v1): 캡처 화면과 같은 interpretLocally. 했는지 여부는 규칙이 정한다.
 *   → 저장 / 저장 안 함 만 알 수 있어서 Status 는 그 두 갈래로만 맞춘다.
 * 모델 판단(v2): 모델에게 status 를 직접 묻는다. 규칙 없음.
 */
export type EngineId = 'rule' | 'gemma3-1b' | 'gemma3-270m' | 'chrome-nano';
export type RunMode = 'actual' | 'model-v2';

export const ENGINE_LABELS: Record<EngineId, string> = {
  rule: 'Rule Engine',
  'gemma3-1b': 'Gemma 3 1B',
  'gemma3-270m': 'Gemma 3 270M',
  'chrome-nano': 'Chrome Gemini Nano',
};

export const MODE_LABELS: Record<RunMode, string> = {
  actual: '실사용 (앱 그대로)',
  'model-v2': '모델 판단 (v2)',
};

/** v1 은 "저장 안 함" 이 미완료·미래·애매 중 무엇인지 모른다. */
export type GotStatus = GoldenStatus | '저장 안 함' | null;

export interface CaseOutcome {
  n: number;
  text: string;
  intent: 'record' | 'query' | null;
  status: GotStatus;
  activity: string | null;
  daysAgo: number | null;
  /** 완료 기록으로 남는지. */
  saved: boolean;
  ms: number;
  usedModel: boolean;
  /** 기기에서 못 채워 서버로 넘어가는 문장. 서버 없이 규칙 값으로 채점했다. */
  toServer: boolean;
  raw: string | null;
  error: string | null;
}

export interface CaseMarks {
  intent: boolean;
  status: boolean;
  activity: 'exact' | 'partial' | 'miss' | 'skip';
  date: boolean | 'skip';
  /** 기대가 완료가 아닌데 저장했다. */
  falseCompletion: boolean;
}

export async function runCase(
  engine: EngineId,
  mode: RunMode,
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<CaseOutcome & { detail: unknown }> {
  const started = performance.now();
  const base = { text, n: 0 };

  if (mode === 'model-v2' && engine !== 'rule') {
    let raw: string | null = null;
    try {
      raw = await generateOnDevice({
        text,
        referenceDate,
        knownItems,
        instruction: buildInstructionV2(text, referenceDate, knownItems),
        responseSchema: RESPONSE_SCHEMA_V2,
      });
      const got = parseV2(raw);
      return {
        ...base,
        intent: got.intent,
        status: got.status,
        activity: got.itemName,
        daysAgo: got.daysAgo,
        saved: got.intent === 'record' && got.status === '완료',
        ms: Math.round(performance.now() - started),
        usedModel: true,
        toServer: false,
        raw,
        error: null,
        detail: got,
      };
    } catch (err) {
      return {
        ...base,
        intent: null,
        status: null,
        activity: null,
        daysAgo: null,
        saved: false,
        ms: Math.round(performance.now() - started),
        usedModel: true,
        toServer: false,
        raw,
        error: err instanceof Error ? err.message : String(err),
        detail: null,
      };
    }
  }

  const local = await interpretLocally(text, referenceDate, knownItems, {
    allowModel: engine !== 'rule',
  });
  const parsed = local.parsed;
  const intent = parsed?.intent ?? 'record';
  const status: GotStatus =
    intent === 'query' ? '조회' : local.deferred ? '저장 안 함' : '완료';
  return {
    ...base,
    intent,
    status,
    activity: parsed?.itemName ?? null,
    daysAgo: parsed ? parsed.daysAgo : null,
    // 서버로 넘어가는 문장은 서버 규칙도 저장 쪽으로 간다. 보수적으로 저장으로 센다.
    saved: intent === 'record' && !local.deferred,
    ms: Math.round(performance.now() - started),
    usedModel: local.usedModel,
    toServer: parsed === null,
    raw: parsed?.raw || null,
    error: local.modelError,
    detail: local,
  };
}

const squash = (s: string) => s.replace(/\s+/g, '');

export function markCase(gold: GoldenCase, got: CaseOutcome, referenceDate: string): CaseMarks {
  const statusOk =
    got.status === gold.status ||
    (got.status === '저장 안 함' && ['미완료', '미래', '애매'].includes(gold.status));

  let activity: CaseMarks['activity'] = 'skip';
  if (gold.activity) {
    const want = squash(gold.activity);
    const have = got.activity ? squash(got.activity) : '';
    activity = have === want ? 'exact' : have && (have.includes(want) || want.includes(have)) ? 'partial' : 'miss';
  }

  const wantDays = resolveDaysAgo(gold.date, referenceDate);
  const dateScored =
    wantDays !== null && wantDays >= 0 && gold.status !== '조회' && gold.status !== '미래';

  return {
    intent: got.intent === gold.intent,
    status: statusOk,
    activity,
    date: dateScored ? got.daysAgo === wantDays : 'skip',
    falseCompletion: gold.status !== '완료' && got.saved,
  };
}

export interface Table2Row {
  intent: number;
  status: number;
  activity: number;
  activityPartial: number;
  date: number;
  falseCompletion: number;
  /** False Completion 분모: 기대가 완료가 아닌 문장 수. */
  fcBase: number;
  fcCount: number;
  /** 네 칸이 모두 맞은 비율. 표 1 정확도. */
  all: number;
  avgMs: number;
  total: number;
  usedModel: number;
  toServer: number;
  errors: number;
}

export function summarize(
  golds: GoldenCase[],
  outcomes: Record<number, CaseOutcome>,
  referenceDate: string,
): Table2Row | null {
  const pairs = golds
    .map((gold) => ({ gold, got: outcomes[gold.n] }))
    .filter((pair): pair is { gold: GoldenCase; got: CaseOutcome } => Boolean(pair.got));
  if (pairs.length === 0) return null;

  const marks = pairs.map(({ gold, got }) => markCase(gold, got, referenceDate));
  const rate = (ok: number, of: number) => (of === 0 ? 0 : ok / of);
  const activityScored = marks.filter((m) => m.activity !== 'skip');
  const dateScored = marks.filter((m) => m.date !== 'skip');
  const fcPairs = pairs.filter(({ gold }) => gold.status !== '완료');
  const fcCount = marks.filter((m) => m.falseCompletion).length;

  return {
    intent: rate(marks.filter((m) => m.intent).length, marks.length),
    status: rate(marks.filter((m) => m.status).length, marks.length),
    activity: rate(activityScored.filter((m) => m.activity === 'exact').length, activityScored.length),
    activityPartial: rate(
      activityScored.filter((m) => m.activity !== 'miss').length,
      activityScored.length,
    ),
    date: rate(dateScored.filter((m) => m.date === true).length, dateScored.length),
    falseCompletion: rate(fcCount, fcPairs.length),
    fcBase: fcPairs.length,
    fcCount,
    all: rate(
      marks.filter(
        (m) => m.intent && m.status && m.activity !== 'miss' && m.activity !== 'partial' && m.date !== false,
      ).length,
      marks.length,
    ),
    avgMs: Math.round(pairs.reduce((sum, { got }) => sum + got.ms, 0) / pairs.length),
    total: pairs.length,
    usedModel: pairs.filter(({ got }) => got.usedModel).length,
    toServer: pairs.filter(({ got }) => got.toServer).length,
    errors: pairs.filter(({ got }) => got.error).length,
  };
}
