import { generateOnDevice } from '@/features/on-device/engine';
import { interpretLocally } from '@/features/on-device/parse-local';
import type { OnDeviceKnownItem } from '@/features/on-device/types';

import { callCloudParse, callGemini, CLOUD_EXPERIMENT_SCHEMA, type CloudSettings } from './cloud-gemini';
import { resolveDaysAgo, type GoldenCase, type GoldenStatus } from './golden';
import { buildExperimentInstruction, parseExperiment, RESPONSE_SCHEMA_EXPERIMENT } from './prompt-experiment';

/**
 * 엔진이 낸 결과를 표 2 칸으로 바꿔 채점한다.
 *
 * 앱 경로: 캡처 화면과 같은 interpretLocally. 앱 지시문(parse-prompt.ts)을 쓰고, 했는지 여부는 규칙이 정한다.
 *   → 저장 / 저장 안 함 만 알 수 있어서 Status 는 그 두 갈래로만 맞춘다.
 * 실험 지시문: prompt-experiment.ts 를 모델에 그대로 보내 status 를 직접 묻는다. 규칙 없음.
 */
export type EngineId = 'rule' | 'gemma3-1b' | 'gemma3-270m' | 'chrome-nano' | 'cloud-gemini';
export type RunMode = 'app' | 'experiment';

export const ENGINE_LABELS: Record<EngineId, string> = {
  rule: 'Rule Engine',
  'gemma3-1b': 'Gemma 3 1B',
  'gemma3-270m': 'Gemma 3 270M',
  'chrome-nano': 'Chrome Gemini Nano',
  'cloud-gemini': 'Cloud LLM (Gemini)',
};

export const isOnDevice = (engine: EngineId) => engine !== 'rule' && engine !== 'cloud-gemini';

export const MODE_LABELS: Record<RunMode, string> = {
  app: '앱 경로',
  experiment: '실험 지시문',
};

/** 고른 엔진·방식에서 문장 하나가 거치는 순서. 실험실 화면 설명용. */
export function modeSteps(engine: EngineId, mode: RunMode): string[] {
  if (mode === 'experiment') {
    return [
      '규칙은 쓰지 않아요.',
      '실험 지시문(prompt-experiment.ts, ⑧에서 고쳤으면 수정본)을 모델에 바로 보내요.',
      '모델이 status 를 "완료"로 답한 문장만 저장한 것으로 봐요.',
    ];
  }
  const tail = [
    '못 한 일 · 앞으로 할 일 · 애매한 말이면 "아직 안 한 일은 기록하지 않아요" 로 끝나고 저장하지 않아요.',
    '나머지는 서버로 보낼 칸(이름 · 날짜)이 정해져요. 서버의 항목 매칭은 재지 않아요.',
  ];
  if (engine === 'rule') {
    return ['규칙만으로 의도 · 이름 · 날짜 · 저장 여부를 정해요. 모델은 부르지 않아요.', ...tail];
  }
  if (engine === 'cloud-gemini') {
    return [
      '규칙이 먼저 해석해요. 규칙으로 끝나면 여기서 멈춰요.',
      '규칙이 못 끝낸 문장만 Gemini 에 apps/ai 와 같은 지시문으로 보내요.',
      '※ 지금 앱 서버는 이 단계 없이 되묻기로 가요. 이 줄은 "서버에 Gemini 해석을 둔다면" 가정이에요.',
      ...tail,
    ];
  }
  return [
    '규칙이 먼저 해석해요. 규칙으로 끝나면 모델을 부르지 않아요.',
    '규칙이 못 끝낸 문장만 모델에 앱 지시문(parse-prompt.ts)을 보내요.',
    '모델이 낸 값 위에 규칙을 덧씌워요. 저장 여부는 규칙이 정해요.',
    ...tail,
  ];
}

/** 표 1 정확도와 같은 기준: Intent · Status · Activity(정확) · Date 가 모두 맞음. */
export function isCorrect(m: CaseMarks): boolean {
  return m.intent && m.status && m.activity !== 'miss' && m.activity !== 'partial' && m.date !== false;
}

/** 앱 경로는 "저장 안 함" 이 미완료·미래·애매 중 무엇인지 모른다. */
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
  /** Cloud 만. 입력·출력 토큰. */
  tokensIn?: number;
  tokensOut?: number;
}

export interface RunContext {
  rules?: boolean;
  cloud?: CloudSettings;
  /** 실험실 ⑧에서 고친 실험 지시문 본문. 없으면 원본. */
  experimentBody?: string;
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
  context: RunContext = {},
): Promise<CaseOutcome & { detail: unknown }> {
  const started = performance.now();
  const base = { text, n: 0 };
  let tokens: { tokensIn?: number; tokensOut?: number } = {};

  if (mode === 'experiment' && engine !== 'rule') {
    let raw: string | null = null;
    try {
      const instruction = buildExperimentInstruction(text, referenceDate, knownItems, context.experimentBody);
      if (engine === 'cloud-gemini') {
        const res = await callGemini(context.cloud!, 'JSON 한 개로만 답한다.', instruction, CLOUD_EXPERIMENT_SCHEMA);
        raw = res.text;
        tokens = { tokensIn: res.tokensIn, tokensOut: res.tokensOut };
      } else {
        raw = await generateOnDevice({
          text,
          referenceDate,
          knownItems,
          instruction,
          responseSchema: RESPONSE_SCHEMA_EXPERIMENT,
        });
      }
      const got = parseExperiment(raw);
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
        ...tokens,
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
        ...tokens,
        detail: null,
      };
    }
  }

  const local = await interpretLocally(text, referenceDate, knownItems, {
    allowModel: isOnDevice(engine),
  });

  /**
   * Cloud 앱 경로: 기기에서 못 채운 문장은 서버가 규칙을 한 번 더 보고, 그래도 이름이 없으면
   * Gemini 를 부른다. 기기 규칙과 서버 규칙이 같은 파서라 여기서는 곧장 Gemini 로 간다.
   * 서버의 기존 항목 매칭(DB) 단계는 빠져 있어 근사치다.
   */
  if (engine === 'cloud-gemini' && local.parsed === null) {
    try {
      const res = await callCloudParse(context.cloud!, text, referenceDate, knownItems);
      const json = JSON.parse(res.text) as { intent?: string; item_name?: string | null; days_ago?: number };
      const intent = json.intent === 'query' ? 'query' : 'record';
      return {
        ...base,
        intent,
        status: intent === 'query' ? '조회' : '완료',
        activity: json.item_name ?? null,
        daysAgo: intent === 'query' ? 0 : Math.max(0, Number(json.days_ago) || 0),
        saved: intent === 'record',
        ms: Math.round(performance.now() - started),
        usedModel: true,
        toServer: false,
        raw: res.text,
        error: null,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        detail: { local, cloud: json },
      };
    } catch (err) {
      local.modelError = err instanceof Error ? err.message : String(err);
    }
  }

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

  // 앱 경로가 저장하지 않는 게 맞는 말을 저장하지 않았으면 이름·날짜는 쓰이지 않으므로 채점하지 않는다.
  const rightlyNotSaved = got.status === '저장 안 함' && statusOk;

  let activity: CaseMarks['activity'] = 'skip';
  if (gold.activity && !rightlyNotSaved) {
    const want = squash(gold.activity);
    const have = got.activity ? squash(got.activity) : '';
    activity = have === want ? 'exact' : have && (have.includes(want) || want.includes(have)) ? 'partial' : 'miss';
  }

  const wantDays = resolveDaysAgo(gold.date, referenceDate);
  const dateScored =
    wantDays !== null && wantDays >= 0 && gold.status !== '조회' && gold.status !== '미래' && !rightlyNotSaved;

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
  /** 네 칸이 모두 맞은 문장 수. */
  correctCount: number;
  avgMs: number;
  maxMs: number;
  /** 모델까지 간 문장만의 평균. 규칙으로 끝난 문장은 1ms 대라 평균을 흐린다. */
  modelAvgMs: number | null;
  tokensIn: number;
  tokensOut: number;
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
    all: rate(marks.filter(isCorrect).length, marks.length),
    correctCount: marks.filter(isCorrect).length,
    avgMs: Math.round(pairs.reduce((sum, { got }) => sum + got.ms, 0) / pairs.length),
    maxMs: Math.max(...pairs.map(({ got }) => got.ms)),
    modelAvgMs: (() => {
      const used = pairs.filter(({ got }) => got.usedModel);
      return used.length ? Math.round(used.reduce((sum, { got }) => sum + got.ms, 0) / used.length) : null;
    })(),
    tokensIn: pairs.reduce((sum, { got }) => sum + (got.tokensIn ?? 0), 0),
    tokensOut: pairs.reduce((sum, { got }) => sum + (got.tokensOut ?? 0), 0),
    total: pairs.length,
    usedModel: pairs.filter(({ got }) => got.usedModel).length,
    toServer: pairs.filter(({ got }) => got.toServer).length,
    errors: pairs.filter(({ got }) => got.error).length,
  };
}
