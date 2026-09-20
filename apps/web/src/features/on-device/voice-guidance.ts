import { isVoiceGuidanceOn } from './consent';

/** 읽고 있던 안내를 끊는다. 시트를 닫거나 다음 안내가 나올 때. */
export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/**
 * 설정이 켜져 있으면 한국어로 읽는다.
 * 끝나면 onend. TTS가 없거나 막히면 바로 onend.
 */
export function speak(text: string, onend?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis || !isVoiceGuidanceOn()) {
    onend?.();
    return;
  }

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.05;
  utterance.onend = () => onend?.();
  utterance.onerror = () => onend?.();
  window.speechSynthesis.speak(utterance);
}
