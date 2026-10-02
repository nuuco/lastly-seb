import { isVoiceGuidanceOn } from './consent';

/** 읽고 있던 안내를 끊는다. 시트를 닫거나 다음 안내가 나올 때. */
export function stopSpeaking(): void {
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

    const voices = window.speechSynthesis.getVoices();
    const ko = voices.find((voice) => voice.lang.toLowerCase().startsWith('ko'));
    // 한국어 목소리가 없으면 다른 언어 목소리가 엉뚱하게 읽거나 소리가 나지 않는다. 읽지 않는다.
    // 목록이 비어 있으면 모르는 것이다 — 일부 Android Chrome 은 빈 목록이어도 기기 한국어 음성으로 읽는다.
    if (voices.length > 0 && !ko) {
      onend?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.05;
    if (ko) utterance.voice = ko;
    utterance.onend = () => onend?.();
    utterance.onerror = () => onend?.();
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
