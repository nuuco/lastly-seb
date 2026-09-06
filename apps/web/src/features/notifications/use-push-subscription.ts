'use client';

import { useCallback, useState } from 'react';

import { profileApi } from '@/lib/api/profile';

/**
 * base64url VAPID 공개키를 PushManager가 받는 형태로 바꾼다.
 * ArrayBuffer로 반환하는 이유는 Uint8Array의 buffer 타입이
 * SharedArrayBuffer일 수 있어 BufferSource에 그대로 넣을 수 없기 때문이다.
 */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);

  return bytes.buffer;
}

export type PushStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

/**
 * 화면 03의 "알림 켜기".
 * iOS 사파리는 홈 화면에 추가된 PWA에서만 동작하므로(화면 02-A),
 * standalone 여부를 함께 노출해 호출부가 안내 화면으로 유도할 수 있게 한다.
 */
export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('idle');

  const subscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return false;
    }

    setStatus('requesting');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });

    const json = subscription.toJSON();

    await profileApi.subscribePush({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
      userAgent: navigator.userAgent,
    });

    setStatus('granted');
    return true;
  }, []);

  return { status, subscribe, isStandalone: useIsStandalone() };
}

/** 홈 화면에 추가된 상태인지. iOS는 navigator.standalone, 그 외는 display-mode 미디어쿼리. */
function useIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
