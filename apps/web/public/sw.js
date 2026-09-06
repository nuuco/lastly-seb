/**
 * 이 서비스워커의 목적은 오프라인 캐싱이 아니라 푸시 알림 수신이다.
 * iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다 (화면 02-A).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const ACTION_LABELS = {
  complete: '완료',
  snooze_3d: '3일 뒤에',
  snooze_weekend: '주말에',
};

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      tag: `item-${payload.itemId}`,
      data: { itemId: payload.itemId },
      actions: (payload.actions ?? []).map((action) => ({
        action,
        title: ACTION_LABELS[action] ?? action,
      })),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { itemId } = event.notification.data ?? {};

  // 액션 없이 알림 본체를 누르면 항목 상세로 바로 연다 (화면 14-B).
  if (!event.action) {
    event.waitUntil(self.clients.openWindow(`/items/${itemId}?from=notification`));
    return;
  }

  // 액션은 앱을 열지 않고 백그라운드에서 처리한다.
  event.waitUntil(
    fetch(`/api/notifications/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId, action: event.action }),
    }).catch(() => self.clients.openWindow(`/items/${itemId}`)),
  );
});
