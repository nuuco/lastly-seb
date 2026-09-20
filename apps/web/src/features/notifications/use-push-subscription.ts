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
  /** 켜지 못한 이유. 화면이 그대로 보여준다 — 원인을 알아야 사용자가 손쓸 수 있다. */
  const [error, setError] = useState<string | null>(null);

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
      setError('이 브라우저에서는 알림을 켤 수 없어요.');
      return false;
    }

    setStatus('requesting');
    setError(null);

    /**
     * 실패를 삼키지 않는다.
     *
     * 예전에는 예외가 그대로 터져 나가 화면에 아무 말도 남지 않았다. 사용자는
     * 토글이 잠깐 켜졌다 꺼지는 것만 보고 무엇이 잘못됐는지 알 수 없었다.
     * 이유를 그대로 들고 나와야 기기 설정 문제인지 다른 문제인지 가릴 수 있다.
     */
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        setError('알림을 허용해야 켤 수 있어요. 기기 설정에서 이 앱의 알림을 확인해주세요.');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      // 예전 구독이 남아 있으면 새로 만들지 못한다. 있으면 그것을 그대로 쓴다.
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        }));

      const json = subscription.toJSON();

      await profileApi.subscribePush({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
        userAgent: navigator.userAgent,
      });

      setStatus('granted');
      return true;
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : '알림을 켜지 못했어요.');
      return false;
    }
  }, []);

  /**
   * 이 기기로 보내는 주소를 서버에서 지운다.
   *
   * 브라우저 쪽 구독은 그대로 둔다. 그것까지 지우면 다시 켤 때 애플·구글 서버에
   * 새 주소를 받아와야 해서 몇 초씩 걸린다. 남겨 두면 다시 켜는 것이 즉시 끝난다.
   * 주소가 서버에 없으면 어차피 아무것도 보내지 않으므로 알림은 오지 않는다.
   *
   * 브라우저 권한도 건드리지 않는다 — 앱이 취소할 수 없고, 다시 켤 때 묻지 않는 편이 낫다.
   */
  const unsubscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await profileApi.unsubscribePush(subscription.endpoint);

      setStatus('idle');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알림을 끄지 못했어요.');
      return false;
    }
  }, []);

  return { status, permission, error, subscribe, unsubscribe, isStandalone: useIsStandalone() };
}

/** 홈 화면에 추가된 상태인지. iOS는 navigator.standalone, 그 외는 display-mode 미디어쿼리. */
function useIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
