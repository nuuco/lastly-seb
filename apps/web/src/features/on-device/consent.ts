import { readItem as read, writeItem as write } from './local-store';

const CONSENT_KEY = 'lastly.ondevice-model';
const VOICE_KEY = 'lastly.voice-guidance';

export type ModelConsent = 'granted' | 'declined' | null;

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
  write(CONSENT_KEY, null);
}

/** 기본은 켠다. 끈 적 있을 때만 끈다. */
export function isVoiceGuidanceOn(): boolean {
  return read(VOICE_KEY) !== 'off';
}

export function setVoiceGuidance(on: boolean): void {
  write(VOICE_KEY, on ? 'on' : 'off');
}
