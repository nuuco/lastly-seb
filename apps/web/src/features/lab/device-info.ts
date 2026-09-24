import { chromeNanoAvailability } from '@/features/on-device/chrome-nano-model';
import { defaultModelId, FALLBACK_MODEL, getModel, type ModelId } from '@/features/on-device/models';

import type { EngineId } from './evaluate';
import type { BenchRecord } from './lab-store';

export interface DeviceInfo {
  userAgent: string;
  /** 브라우저가 알려 주는 RAM 등급(GB). 0.25~8 로 뭉개져 나온다. */
  deviceMemory: number | null;
  cores: number | null;
  webgpu: string;
  /** https 또는 localhost 인지. 아니면 WebGPU 를 못 쓴다. */
  secure: boolean;
  /** Core 어댑터. 앱 엔진(MediaPipe)은 이것만 쓴다. */
  gpuAdapter: boolean;
  /** Compatibility 모드 어댑터. 앱 엔진은 쓰지 않지만 기기 비교용으로 남긴다. */
  compatAdapter: boolean | null;
  shaderF16: boolean | null;
  /** 한 버퍼에 올릴 수 있는 최대 크기(MB). 모델 가중치가 이 안에 들어가야 한다. */
  maxBufferMB: number | null;
  maxStorageBindingMB: number | null;
  compatMaxBufferMB: number | null;
  compatMaxStorageBindingMB: number | null;
  nano: string;
  storageUsedMB: number | null;
  storageQuotaMB: number | null;
}

type GpuAdapterInfo = { vendor?: string; architecture?: string; description?: string };
type GpuAdapterLike = {
  info?: GpuAdapterInfo;
  features?: { has(name: string): boolean };
  limits?: { maxBufferSize?: number; maxStorageBufferBindingSize?: number };
};

export async function readDeviceInfo(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: {
      requestAdapter(options?: { powerPreference?: string; featureLevel?: string }): Promise<GpuAdapterLike | null>;
    };
  };

  let webgpu = '없음';
  let gpuAdapter = false;
  let shaderF16: boolean | null = null;
  let maxBufferMB: number | null = null;
  let maxStorageBindingMB: number | null = null;
  let compatAdapter: boolean | null = null;
  let compatMaxBufferMB: number | null = null;
  let compatMaxStorageBindingMB: number | null = null;
  const toMB = (n?: number) => (n ? Math.round(n / 1_048_576) : null);
  if (nav.gpu) {
    try {
      // 엔진(mediapipe-model.ts)과 같은 옵션으로 묻는다.
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      const info = adapter?.info;
      gpuAdapter = Boolean(adapter);
      if (adapter) {
        shaderF16 = adapter.features?.has('shader-f16') ?? null;
        maxBufferMB = toMB(adapter.limits?.maxBufferSize);
        maxStorageBindingMB = toMB(adapter.limits?.maxStorageBufferBindingSize);
      }
      webgpu = adapter
        ? ['있음', info?.vendor, info?.architecture].filter(Boolean).join(' · ')
        : '어댑터 없음';
    } catch {
      webgpu = '오류';
    }
    // nuuco/test-ai-demo 와 같은 확인. Core 가 없어도 호환 모드로는 잡히는 기기가 있다.
    try {
      const compat = await nav.gpu.requestAdapter({ featureLevel: 'compatibility' });
      compatAdapter = Boolean(compat);
      compatMaxBufferMB = toMB(compat?.limits?.maxBufferSize);
      compatMaxStorageBindingMB = toMB(compat?.limits?.maxStorageBufferBindingSize);
    } catch {
      compatAdapter = false;
    }
  }

  let storageUsedMB: number | null = null;
  let storageQuotaMB: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate?.usage !== undefined) storageUsedMB = Math.round(estimate.usage / 1_048_576);
    if (estimate?.quota !== undefined) storageQuotaMB = Math.round(estimate.quota / 1_048_576);
  } catch {
    // ignore
  }

  const nanoApi = 'LanguageModel' in self;
  return {
    userAgent: navigator.userAgent,
    deviceMemory: nav.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    webgpu,
    secure: window.isSecureContext,
    gpuAdapter,
    compatAdapter,
    shaderF16,
    maxBufferMB,
    maxStorageBindingMB,
    compatMaxBufferMB,
    compatMaxStorageBindingMB,
    nano: nanoApi ? await chromeNanoAvailability() : 'API 없음',
    storageUsedMB,
    storageQuotaMB,
  };
}

/** JS 힙만 잰다. 모델이 쓰는 GPU 메모리는 웹에서 알 수 없다. */
export function jsHeapMB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : null;
}

export type Verdict = { ok: boolean | null; text: string };

/**
 * 엔진별로 이 기기에서 돌 수 있는지. 앱이 고르는 조건과 같게 판단한다.
 * - Gemma: https + WebGPU Core 어댑터 (mediapipe-model.ts createWebGpuDevice).
 *   270M 과 1B 는 조건이 같아도 메모리로 갈리므로 ① 준비 결과(bench)로 정한다.
 * - Nano: LanguageModel API + availability (chrome-nano-model.ts)
 * - 앱 경로: 기본 모델(models.ts defaultModelId) → Nano 를 못 쓰면 FALLBACK_MODEL → 규칙만
 */
export function engineVerdicts(
  device: DeviceInfo,
  bench: Partial<Record<EngineId, BenchRecord>>,
): Record<'rule' | 'app' | ModelId, Verdict> {
  const webgpu: Verdict = !device.secure
    ? { ok: false, text: 'https 가 아니라 WebGPU 를 쓸 수 없어요' }
    : !device.gpuAdapter
      ? {
          ok: false,
          text:
            device.webgpu === '없음'
              ? '이 브라우저에 WebGPU 가 없어요'
              : device.compatAdapter
                ? 'Core 어댑터가 없어요 (호환 모드만 있음 — 앱 엔진은 호환 모드를 쓰지 않아요)'
                : 'WebGPU 어댑터를 못 받았어요 (Core · 호환 모드 모두 없음)',
        }
      : { ok: true, text: '' };
  const f16 = device.shaderF16 === false ? ' · shader-f16 없음, 느릴 수 있어요' : '';

  const gemma = (id: 'gemma3-270m' | 'gemma3-1b'): Verdict => {
    if (!webgpu.ok) return webgpu;
    const b = bench[id];
    if (b?.crashed) return { ok: false, text: '준비 중 탭이 닫혔어요 (메모리 부족 추정)' };
    if (b?.support === '지원') return { ok: true, text: `준비 성공 (실측)${f16}` };
    if (b && b.support !== '—') return { ok: false, text: `${b.support} (실측)` };
    return { ok: null, text: `WebGPU 조건은 충족 — ① 준비로 확인${f16}` };
  };

  const nano: Verdict =
    device.nano === 'API 없음'
      ? { ok: false, text: 'Chrome 내장 AI API 가 없어요 (Android Chrome 은 미지원)' }
      : bench['chrome-nano']?.support.startsWith('미지원')
        ? { ok: false, text: '준비해 보니 이 기기에서 못 써요 (실측)' }
        : device.nano === 'available'
          ? { ok: true, text: '가능 (받아 둔 모델 있음)' }
          : device.nano === 'downloadable' || device.nano === 'downloading'
            ? { ok: true, text: `가능 (Chrome 이 모델을 받아야 해요: ${device.nano})` }
            : { ok: false, text: `API 는 있지만 이 기기 사양으로는 못 써요 (${device.nano})` };

  const verdicts = { 'gemma3-270m': gemma('gemma3-270m'), 'gemma3-1b': gemma('gemma3-1b'), 'chrome-nano': nano };

  const chosen = defaultModelId();
  const used: ModelId = chosen === 'chrome-nano' && !nano.ok ? FALLBACK_MODEL : chosen;
  const usedLabel = getModel(used).label;
  const fallbackNote = used !== chosen ? ` (기본 ${getModel(chosen).label} 대신)` : '';
  const app: Verdict =
    verdicts[used].ok === true
      ? { ok: true, text: `규칙 → ${usedLabel}${fallbackNote}` }
      : verdicts[used].ok === null
        ? { ok: null, text: `규칙 → ${usedLabel}${fallbackNote} · ① 준비로 확인` }
        : {
            ok: false,
            text: `규칙만 — ${usedLabel} 사용 불가. 다른 모델로 자동으로 바꾸지 않아요`,
          };

  return { rule: { ok: true, text: '항상 가능' }, ...verdicts, app };
}
