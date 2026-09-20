const CONSENT_KEY = 'lastly.ondevice.consent';

export type OnDeviceConsent = 'unset' | 'accepted' | 'declined';

export function readOnDeviceConsent(): OnDeviceConsent {
  if (typeof window === 'undefined') return 'unset';
  const v = window.localStorage.getItem(CONSENT_KEY);
  if (v === 'accepted' || v === 'declined') return v;
  return 'unset';
}

export function writeOnDeviceConsent(value: 'accepted' | 'declined'): void {
  window.localStorage.setItem(CONSENT_KEY, value);
}
