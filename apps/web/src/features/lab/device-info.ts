import { chromeNanoAvailability } from '@/features/on-device/chrome-nano-model';

export interface DeviceInfo {
  userAgent: string;
  /** 브라우저가 알려 주는 RAM 등급(GB). 0.25~8 로 뭉개져 나온다. */
  deviceMemory: number | null;
  cores: number | null;
  webgpu: string;
  nano: string;
  storageUsedMB: number | null;
  storageQuotaMB: number | null;
}

type GpuAdapterInfo = { vendor?: string; architecture?: string; description?: string };

export async function readDeviceInfo(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: { requestAdapter(): Promise<{ info?: GpuAdapterInfo } | null> };
  };

  let webgpu = '없음';
  if (nav.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter();
      const info = adapter?.info;
      webgpu = adapter
        ? ['있음', info?.vendor, info?.architecture].filter(Boolean).join(' · ')
        : '어댑터 없음';
    } catch {
      webgpu = '오류';
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
