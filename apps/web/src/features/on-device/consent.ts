const CONSENT_KEY = 'lastly.ondevice-model';
const VOICE_KEY = 'lastly.voice-guidance';

export type ModelConsent = 'granted' | 'declined' | null;

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 사생활 모드 등에서 실패해도 기록은 막지 않는다.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getModelConsent(): ModelConsent {
  const value = read(CONSENT_KEY);
  if (value === 'granted' || value === 'declined') return value;
  return null;
}

export function hasModelConsent(): boolean {
  return getModelConsent() === 'granted';
}

export function setModelConsent(value: 'granted' | 'declined'): void {
  write(CONSENT_KEY, value);
}

export function clearModelConsent(): void {
  remove(CONSENT_KEY);
}

/** 기본은 켠다. 끈 적 있을 때만 끈다. */
export function isVoiceGuidanceOn(): boolean {
  return read(VOICE_KEY) !== 'off';
}

export function setVoiceGuidance(on: boolean): void {
  write(VOICE_KEY, on ? 'on' : 'off');
}

/**
 * 셀룰러이거나 네트워크를 모를 때(iOS 등)는 과금으로 본다.
 * 그때는 받기 시트를 띄워도 기본은 받지 않는다.
 */
export function isMeteredConnection(): boolean {
  if (typeof navigator === 'undefined') return true;
  const connection = (
    navigator as Navigator & {
      connection?: { type?: string; saveData?: boolean };
    }
  ).connection;
  if (!connection) return true;
  if (connection.saveData) return true;
  return connection.type === 'cellular';
}
