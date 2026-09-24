import type { CaseOutcome, EngineId, RunMode } from './evaluate';

/**
 * 실험 결과를 이 브라우저에 쌓아 둔다. 엔진을 바꾸거나 새로고침해도 표가 남는다.
 * 저장이 막힌 브라우저에서도 화면은 돌아가야 해서 읽기·쓰기를 모두 감싼다.
 */
const KEY = 'lastly-lab-v2';

export interface BenchRecord {
  /** 받은 파일 없이 캐시에서 올렸으면 true. 다운로드 시간은 없다. */
  fromCache: boolean;
  downloadMs: number | null;
  downloadBytes: number | null;
  prepareMs: number | null;
  jsHeapMB: number | null;
  /** 폰이 탭을 강제로 닫았는지. 사람이 체크한다. */
  crashed: boolean;
  support: string;
  at: string;
}

export interface RunRecord {
  engine: EngineId;
  mode: RunMode;
  setVersion: string;
  /** 실험실에서 바꾼 규칙으로 돌렸으면 그 표시. 원래 규칙이면 빈 문자열. */
  ruleTag: string;
  /** 실험실에서 고친 실험 지시문으로 돌렸으면 그 표시. */
  promptTag?: string;
  referenceDate: string;
  at: string;
  outcomes: Record<number, CaseOutcome>;
}

export interface LabState {
  bench: Partial<Record<EngineId, BenchRecord>>;
  runs: Record<string, RunRecord>;
}

export const EMPTY_STATE: LabState = { bench: {}, runs: {} };

export function runKey(engine: EngineId, mode: RunMode, setVersion: string, ruleTag = ''): string {
  return `${engine}|${mode}|${setVersion}|${ruleTag}`;
}

export function loadLab(): LabState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<LabState>;
    return { bench: parsed.bench ?? {}, runs: parsed.runs ?? {} };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveLab(state: LabState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장공간이 막혀도 이번 화면에서는 계속 쓴다.
  }
}

/**
 * 준비 중인 엔진을 적어 두고, 끝나면 지운다.
 * 다음에 열었을 때 남아 있으면 준비 도중 탭이 닫힌 것(대개 메모리 부족)이다.
 */
const PREPARING_KEY = 'lastly-lab-preparing';

export function markPreparing(engine: EngineId): void {
  try {
    localStorage.setItem(PREPARING_KEY, engine);
  } catch {
    // ignore
  }
}

export function clearPreparing(): void {
  try {
    localStorage.removeItem(PREPARING_KEY);
  } catch {
    // ignore
  }
}

/** 지난번 준비가 끝나지 않고 탭이 닫혔으면 그 엔진. 읽으면서 지운다. */
export function takeInterruptedPrepare(): EngineId | null {
  try {
    const engine = localStorage.getItem(PREPARING_KEY) as EngineId | null;
    localStorage.removeItem(PREPARING_KEY);
    return engine;
  } catch {
    return null;
  }
}
