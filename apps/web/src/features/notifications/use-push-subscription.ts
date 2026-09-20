'use client';

import { useCallback, useEffect, useState } from 'react';

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

  /**
   * 브라우저가 기억하는 허용 여부. 앱이 바꿀 수 없다.
   *
   * 한 번 "차단" 이 되면 다시 물어볼 수조차 없어서, 호출부가 기기 설정으로 안내해야 한다.
   *
   * 그릴 때가 아니라 화면이 붙은 뒤에 읽는다. 서버에는 브라우저가 없어 null 인데
   * 첫 렌더에서 곧바로 읽으면 서버와 결과가 갈려 화면을 통째로 다시 그리게 된다.
   */
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
  }, [status]);

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

  /**
   * 이 기기로 보내는 주소를 없앤다.
   *
   * 브라우저 권한은 그대로 둔다 — 앱이 취소할 수 없기도 하고, 다시 켤 때
   * 아무것도 묻지 않고 바로 켜지는 편이 낫다.
   */
  const unsubscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    // 서버부터 지운다. 브라우저 쪽만 지우면 서버가 죽은 주소로 계속 보낸다.
    await profileApi.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();

    setStatus('idle');
    return true;
  }, []);

  return { status, permission, subscribe, unsubscribe, isStandalone: useIsStandalone() };
}

/** 홈 화면에 추가된 상태인지. iOS는 navigator.standalone, 그 외는 display-mode 미디어쿼리. */
function useIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
