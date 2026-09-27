/**
 * 온디바이스 기능이 이 기기에 남기는 값(동의·음성 안내·로컬 AI 판정).
 * 사생활 모드 등에서 저장소를 못 써도 기능은 막지 않는다. 읽기는 null, 쓰기는 무시.
 */
export function readItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** null 이면 지운다. */
export function writeItem(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
