import type { CaseOutcome, EngineId, RunMode } from './evaluate';

/**
 * 실험 결과를 이 브라우저에 쌓아 둔다. 엔진을 바꾸거나 새로고침해도 표가 남는다.
 * 저장이 막힌 브라우저에서도 화면은 돌아가야 해서 읽기·쓰기를 모두 감싼다.
 */
const KEY = 'lastly-lab-v1';

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
  referenceDate: string;
  at: string;
  outcomes: Record<number, CaseOutcome>;
}

export interface LabState {
  bench: Partial<Record<EngineId, BenchRecord>>;
  runs: Record<string, RunRecord>;
}

export const EMPTY_STATE: LabState = { bench: {}, runs: {} };

export function runKey(engine: EngineId, mode: RunMode, setVersion: string): string {
  return `${engine}|${mode}|${setVersion}`;
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
