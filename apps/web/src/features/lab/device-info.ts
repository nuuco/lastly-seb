import { chromeNanoAvailability } from '@/features/on-device/chrome-nano-model';

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
 * - Gemma: https + WebGPU 어댑터 (mediapipe-model.ts createWebGpuDevice)
 * - Nano: LanguageModel API + availability (chrome-nano-model.ts)
 */
export function engineVerdicts(device: DeviceInfo): Record<'rule' | 'gemma' | 'nano' | 'app', Verdict> {
  const gemma: Verdict = !device.secure
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
      : {
          ok: true,
          text: `가능${device.shaderF16 === false ? ' (shader-f16 없음 — 느릴 수 있어요)' : ''}`,
        };
  const nano: Verdict =
    device.nano === 'API 없음'
      ? { ok: false, text: 'Chrome 내장 AI API 가 없어요 (Android Chrome 은 미지원)' }
      : device.nano === 'available'
        ? { ok: true, text: '가능 (받아 둔 모델 있음)' }
        : device.nano === 'downloadable' || device.nano === 'downloading'
          ? { ok: true, text: `가능 (Chrome 이 모델을 받아야 해요: ${device.nano})` }
          : { ok: false, text: `API 는 있지만 이 기기 사양으로는 못 써요 (${device.nano})` };
  const app: Verdict = nano.ok
    ? { ok: true, text: '규칙 → Nano' }
    : gemma.ok
      ? { ok: true, text: '규칙 → Gemma (Nano 대신)' }
      : { ok: false, text: '규칙만 (규칙이 못 끝낸 문장은 서버에서 되묻기)' };
  return { rule: { ok: true, text: '항상 가능' }, gemma, nano, app };
}
