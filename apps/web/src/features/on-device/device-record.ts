import { readItem as read, writeItem as write } from './local-store';
import type { ModelId } from './models';

/**
 * 이 기기에서 로컬 AI 를 쓸 수 있는지에 대한 기록. localStorage 에 둔다.
 * - 판정 결과: 다음 실행 첫 화면에서 검사가 끝나기 전까지 쓴다.
 * - 준비 실패: 사전 검사를 통과해도 올리다 실패한 모델. 같은 브라우저에서는 다시 권하지 않는다.
 * - 준비 중 표시: 올리는 도중 탭이 죽으면(메모리 부족) 남는다. 다음 실행에서 실패로 센다.
 */
const SUPPORT_KEY = 'lastly.local-ai';
const FAILED_KEY = 'lastly.local-ai-failed';
const COMPILING_KEY = 'lastly.local-ai-compiling';

export type LocalAiKind = 'nano' | 'gemma' | 'none';

export interface LocalAiSupport {
  kind: LocalAiKind;
  /** 쓸 모델. none 이면 null. */
  modelId: ModelId | null;
  /** 판정 사유. 콘솔·실험용. */
  reason: string;
}

type FailedRecord = Partial<Record<ModelId, { userAgent: string; reason: string; at: string }>>;

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readCachedSupport(): LocalAiSupport | null {
  const value = parse<LocalAiSupport>(read(SUPPORT_KEY));
  return value && typeof value.kind === 'string' ? value : null;
}

export function writeCachedSupport(support: LocalAiSupport): void {
  write(SUPPORT_KEY, JSON.stringify(support));
}

/** 이 브라우저(같은 userAgent)에서 준비에 실패한 모델인지. 브라우저가 바뀌면 다시 해 본다. */
export function failedReason(id: ModelId): string | null {
  const entry = parse<FailedRecord>(read(FAILED_KEY))?.[id];
  if (!entry || entry.userAgent !== navigator.userAgent) return null;
  return entry.reason;
}

export function recordFailure(id: ModelId, reason: string): void {
  const all = parse<FailedRecord>(read(FAILED_KEY)) ?? {};
  all[id] = { userAgent: navigator.userAgent, reason, at: new Date().toISOString() };
  write(FAILED_KEY, JSON.stringify(all));
}

export function markCompiling(id: ModelId): void {
  write(COMPILING_KEY, id);
}

export function clearCompiling(): void {
  write(COMPILING_KEY, null);
}

/** 지난 실행에서 올리던 중에 탭이 끝났으면 그 모델 id. 읽으면 지운다. */
export function takeInterruptedCompile(): ModelId | null {
  const id = read(COMPILING_KEY) as ModelId | null;
  if (id) clearCompiling();
  return id;
}
