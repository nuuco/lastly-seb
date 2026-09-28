export const CANCELLED = 'cancelled';
export const GPU_UNAVAILABLE =
  '이 브라우저는 기기 이해를 지원하지 않아요. Chrome에서 localhost로 열어 주세요.';
export const GPU_INSECURE = '이 주소에서는 쓸 수 없어요. localhost로 열어 주세요.';

export function cancelledError() {
  return new Error(CANCELLED);
}

export function isEngineCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === CANCELLED;
}

export function engineErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  // 이미 고른 문구면 그대로 둔다. 두 문구 모두 "localhost로 열어" 를 담고 있다.
  if (raw === GPU_UNAVAILABLE || raw === GPU_INSECURE) return raw;
  if (/secure context|isSecureContext/i.test(raw)) return GPU_INSECURE;
  if (/can not be cloned|cannot be cloned|DataCloneError/i.test(raw)) return GPU_UNAVAILABLE;
  if (/Unable to request adapter|navigator\.gpu|WebGPU is enabled/i.test(raw)) {
    if (typeof window !== 'undefined' && !window.isSecureContext) return GPU_INSECURE;
    return GPU_UNAVAILABLE;
  }
  return raw || '모델을 준비하지 못했어요.';
}

/** 기기가 모델을 못 올린 경우(GPU·컴파일·메모리). 네트워크 실패와 달리 다시 해도 안 된다. */
export const LOCAL_AI_UNSUPPORTED = '이 기기에서는 AI 모델을 쓸 수 없어요. 기록은 그대로 할 수 있어요.';

export function deviceFailure(err: unknown): Error {
  const error = err instanceof Error ? err : new Error(String(err ?? ''));
  (error as Error & { deviceFailure?: boolean }).deviceFailure = true;
  return error;
}

export function isDeviceFailure(err: unknown): boolean {
  return err instanceof Error && (err as Error & { deviceFailure?: boolean }).deviceFailure === true;
}
