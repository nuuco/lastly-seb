import { chromeNanoAvailability } from './chrome-nano-model';
import {
  failedReason,
  readCachedSupport,
  recordFailure,
  takeInterruptedCompile,
  writeCachedSupport,
  type LocalAiSupport,
} from './device-record';
import { probeWebGpu, removeStoredModel } from './mediapipe-model';
import { defaultModelId, FALLBACK_MODEL, getModel, type MediaPipeSpec, type ModelId } from './models';

export type { LocalAiKind, LocalAiSupport } from './device-record';

/**
 * 이 기기에서 로컬 AI 를 쓸 수 있는지 앱을 켤 때마다 본다.
 * 브라우저 업데이트·설정 변경으로 결과가 달라질 수 있어 저장값은 첫 화면에만 쓴다.
 *
 * 1. Chrome 내장 Nano 가 이미 받아져 있으면 Nano. 받을 것이 없다.
 * 2. https · WebGPU 어댑터 · GPU 장치 · 저장 공간이 되면 Gemma(기본 270M).
 * 3. 그 밖에는 none. 받기 안내를 띄우지 않고 서버(규칙 → Gemini)가 해석한다.
 *
 * GPU 메모리·컴파일 성공은 미리 알 수 없다. 첫 준비가 실패하면 recordFailure 로 남긴다.
 */
let checked: LocalAiSupport | null = null;
let checking: Promise<LocalAiSupport> | null = null;
const listeners = new Set<(support: LocalAiSupport) => void>();

/** 기본 Gemma 모델. 기본이 Nano 로 설정돼 있으면 대체 모델. */
function gemmaSpec(): MediaPipeSpec {
  const spec = getModel(defaultModelId());
  return spec.runtime === 'mediapipe' ? spec : (getModel(FALLBACK_MODEL) as MediaPipeSpec);
}

/** 이번 실행에서 검사한 결과. 아직이면 지난 실행의 저장값. 둘 다 없으면 null. */
export function getLocalAiSupport(): LocalAiSupport | null {
  return checked ?? readCachedSupport();
}

export function subscribeLocalAi(listener: (support: LocalAiSupport) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 판정을 받는다. 이번 실행에서 이미 봤으면 바로, 아니면 검사가 끝날 때 부른다.
 * 이후 실패로 판정이 바뀌어도 다시 부른다.
 */
export function watchLocalAi(listener: (support: LocalAiSupport) => void): () => void {
  const unsubscribe = subscribeLocalAi(listener);
  if (checked) listener(checked);
  else void checkLocalAi();
  return unsubscribe;
}

export function checkLocalAi(): Promise<LocalAiSupport> {
  if (checked) return Promise.resolve(checked);
  if (checking) return checking;
  checking = detect()
    .catch((err: unknown): LocalAiSupport => ({
      kind: 'none',
      modelId: null,
      reason: `검사 실패: ${err instanceof Error ? err.message : String(err)}`,
    }))
    .then((support) => {
      settle(support);
      return support;
    })
    .finally(() => {
      checking = null;
    });
  return checking;
}

/** 준비하다 기기 때문에 실패했을 때. 기록하고 다시 판정한다(Nano 실패면 Gemma 로 갈 수 있다). */
export function reportLocalAiFailure(id: ModelId, reason: string): Promise<LocalAiSupport> {
  recordFailure(id, reason);
  checked = null;
  return checkLocalAi();
}

function settle(support: LocalAiSupport) {
  checked = support;
  writeCachedSupport(support);
  console.info('[lastly] 로컬 AI', support);
  for (const listener of listeners) listener(support);
}

async function detect(): Promise<LocalAiSupport> {
  if (typeof window === 'undefined') return { kind: 'none', modelId: null, reason: '서버' };

  const interrupted = takeInterruptedCompile();
  if (interrupted) {
    recordFailure(interrupted, '준비 중 탭이 닫힘 (메모리 부족 추정)');
    const spec = getModel(interrupted);
    if (spec.runtime === 'mediapipe') await removeStoredModel(spec);
  }

  if (!failedReason('chrome-nano') && (await chromeNanoAvailability()) === 'available') {
    return { kind: 'nano', modelId: 'chrome-nano', reason: 'Chrome 내장 Nano 설치됨' };
  }

  const spec = gemmaSpec();
  const failed = failedReason(spec.id);
  if (failed) return { kind: 'none', modelId: null, reason: `${spec.label} 준비 실패 기록: ${failed}` };

  const gpu = await probeWebGpu();
  if (!gpu.ok) return { kind: 'none', modelId: null, reason: gpu.reason };

  const space = await hasRoomFor(spec);
  if (!space.ok) return { kind: 'none', modelId: null, reason: space.reason };

  return { kind: 'gemma', modelId: spec.id, reason: `WebGPU 가능 · ${spec.label}` };
}

/** 이미 받아 둔 파일이 있으면 공간은 보지 않는다. */
async function hasRoomFor(spec: MediaPipeSpec): Promise<{ ok: boolean; reason: string }> {
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(spec.opfsFile)).getFile();
    if (file.size >= spec.bytes) return { ok: true, reason: '' };
  } catch {
    // 아직 안 받음
  }
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota === undefined) return { ok: true, reason: '' };
    const free = estimate.quota - (estimate.usage ?? 0);
    // 받는 동안 임시 공간을 더 쓴다. 여유를 둔다.
    if (free < spec.bytes * 1.2) {
      return { ok: false, reason: `저장 공간 부족 (남은 ${Math.round(free / 1_048_576)}MB)` };
    }
  } catch {
    // 알 수 없으면 막지 않는다.
  }
  return { ok: true, reason: '' };
}
