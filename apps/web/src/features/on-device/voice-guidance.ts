import { isVoiceGuidanceOn } from './consent';

/**
 * 읽는 중인 안내. Chrome 은 참조가 없는 utterance 를 회수해 onend 를 버린다.
 */
let current: SpeechSynthesisUtterance | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

/** 한 글자 0.2초로 잡은 예상 읽기 시간에 더하는 여유. onend 가 끝내 안 올 때 쓴다. */
const ONEND_GRACE_MS = 1_500;

/** 읽고 있던 안내를 끊는다. 시트를 닫거나 다음 안내가 나올 때. */
export function stopSpeaking(): void {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
  current = null;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/**
 * 설정이 켜져 있으면 한국어로 읽는다.
 * Chrome 은 목소리가 늦게 로드되고, speak 직후 paused 로 남는 경우가 있다.
 */
export function speak(text: string, onend?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis || !isVoiceGuidanceOn()) {
    onend?.();
    return;
  }

  stopSpeaking();

  let started = false;
  const run = () => {
    if (started) return;
    started = true;

    const utterance = new SpeechSynthesisUtterance(text);
    current = utterance;
    utterance.lang = 'ko-KR';
    utterance.rate = 1.05;
    const ko = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith('ko'));
    if (ko) utterance.voice = ko;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (current === utterance) {
        current = null;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      onend?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    if (onend) fallbackTimer = setTimeout(finish, text.length * 200 + ONEND_GRACE_MS);
    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  };

  if (window.speechSynthesis.getVoices().length > 0) {
    run();
    return;
  }

  window.speechSynthesis.addEventListener('voiceschanged', run, { once: true });
  window.setTimeout(run, 300);
}
