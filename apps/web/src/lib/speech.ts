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
  onaudiostart?: (() => void) | null;
}

export interface SpeechRecognitionEventLike {
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

/**
 * iOS 홈 화면 앱(standalone)은 인식 객체가 있어도 마이크를 열지 않는 경우가 많다.
 * 사파리 탭에서는 같은 기기에서 동작한다. navigator.standalone 은 iOS 사파리에만 있다.
 */
export function isIosStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * iOS 홈 화면 앱에서 인식이 마이크를 못 연 횟수. iOS 버전별로 센다.
 * OS 가 바뀌면 다시 시도하도록 키에 버전을 넣는다.
 */
const STANDALONE_FAILS_KEY = 'lastly.speech-standalone-fails';
const STANDALONE_FAILS_LIMIT = 2;

function iosVersion(): string {
  return /OS (\d+[_\d]*)/.exec(navigator.userAgent)?.[1] ?? 'unknown';
}

function readStandaloneFails(): number {
  try {
    const raw = window.localStorage.getItem(STANDALONE_FAILS_KEY);
    if (!raw) return 0;
    const saved = JSON.parse(raw) as { os?: string; count?: number };
    return saved.os === iosVersion() ? (saved.count ?? 0) : 0;
  } catch {
    return 0;
  }
}

function writeStandaloneFails(count: number) {
  try {
    if (count === 0) window.localStorage.removeItem(STANDALONE_FAILS_KEY);
    else
      window.localStorage.setItem(
        STANDALONE_FAILS_KEY,
        JSON.stringify({ os: iosVersion(), count }),
      );
  } catch {
    // ignore
  }
}

/** 마이크를 못 열었다. 연달아 두 번이면 이 OS 버전에서는 더 시도하지 않는다. */
export function recordStandaloneFailure() {
  writeStandaloneFails(readStandaloneFails() + 1);
}

/** 마이크가 열렸다. 실패 기록을 지운다. */
export function recordStandaloneSuccess() {
  writeStandaloneFails(0);
}

/** iOS 홈 화면 앱에서 이미 연달아 실패해 시도하지 않는 상태인지. */
export function isStandaloneSpeechBlocked(): boolean {
  return isIosStandalone() && readStandaloneFails() >= STANDALONE_FAILS_LIMIT;
}

/** 음성 입력을 못 쓸 때 사용자에게 보일 안내. */
export function speechUnavailableMessage(): string {
  return isIosStandalone()
    ? '홈 화면 앱에서는 음성 입력이 안 돼요. 키보드로 적거나 사파리에서 열어주세요.'
    : '이 브라우저에서는 음성 입력을 쓸 수 없어요. 키보드로 적어주세요.';
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
  recognition.onaudiostart = null;
}
