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
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

/**
 * iOS 홈 화면 앱(standalone)은 인식 객체가 있어도 결과를 돌려주지 않는다.
 * 사파리 탭에서는 같은 기기에서 동작한다. navigator.standalone 은 iOS 사파리에만 있다.
 */
export function isIosStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** 음성 입력을 못 쓸 때 사용자에게 보일 안내. */
export function speechUnavailableMessage(): string {
  return isIosStandalone()
    ? '홈 화면 앱에서는 음성 입력이 안 돼요. 키보드로 적거나 사파리에서 열어주세요.'
    : '이 브라우저에서는 음성 입력을 쓸 수 없어요. 키보드로 적어주세요.';
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  if (isIosStandalone()) return null;
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
