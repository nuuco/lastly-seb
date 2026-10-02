export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionEventLike {
  /** 이번 이벤트에서 새로 바뀐 첫 결과의 위치. continuous 에서 의미가 있다. */
  resultIndex?: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export function detachRecognition(recognition: SpeechRecognitionLike) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

/** 인식 오류 중 권한 때문에 막힌 것. 마이크 거부와 음성 인식(Siri) 거부 둘 다다. */
export function isPermissionError(code: string): boolean {
  return code === 'not-allowed' || code === 'service-not-allowed';
}

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

function queryMicPermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return Promise.resolve(null);
  }
  return navigator.permissions
    .query({ name: 'microphone' as PermissionName })
    .catch(() => null);
}

/**
 * 마이크 권한 상태. 팝업을 띄우지 않고 읽기만 한다.
 * Permissions API 가 없거나 microphone 을 모르는 브라우저는 'unknown' — 부르는 쪽은 기존처럼 시도한다.
 */
export async function getMicPermission(): Promise<MicPermission> {
  return (await queryMicPermission())?.state ?? 'unknown';
}

/**
 * 마이크 권한을 지켜본다. 처음 한 번 알리고, 브라우저가 바뀌었다고 알려 오면 다시 알린다.
 * 주소창 사이트 설정에서 바로 바꾸면 화면 전환이 없어서 이 신호로만 알 수 있다.
 */
export function watchMicPermission(onChange: (state: MicPermission) => void): () => void {
  let status: PermissionStatus | null = null;
  let stopped = false;
  const notify = () => {
    if (status) onChange(status.state);
  };

  void queryMicPermission().then((s) => {
    if (stopped) return;
    if (!s) {
      onChange('unknown');
      return;
    }
    status = s;
    notify();
    s.addEventListener('change', notify);
  });

  return () => {
    stopped = true;
    status?.removeEventListener('change', notify);
  };
}

export type MicSettingsPlatform = 'ios' | 'mac-safari' | 'android' | 'other';

/** 권한을 켜는 설정 경로가 기기마다 달라서 나눈다. */
export function getMicSettingsPlatform(): MicSettingsPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // iPadOS 는 데스크톱 Safari 처럼 자신을 Mac 으로 알린다. 터치 지점 수로 가른다.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    // iPhone 의 Chrome·Firefox·Edge 는 설정 위치가 Safari 와 다르다.
    return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'other' : 'ios';
  }
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) {
    return 'mac-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}
