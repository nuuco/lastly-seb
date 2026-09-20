/**
 * 이 서비스워커의 목적은 오프라인 캐싱이 아니라 푸시 알림 수신이다.
 * iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다 (화면 02-A).
 */

self.addEventListener('install', () => self.skipWaiting());

/**
 * 오래된 사본은 버린다. 배포할 때마다 CACHE 이름이 바뀌므로 그 전 것이 남지 않는다.
 */
const CACHE = 'lastly-shell-v2';

self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('lastly-shell-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  ),
);

/**
 * 연결이 끊겨도 앱이 열리게 한다.
 *
 * 이 앱은 집 밖에서 문득 떠올라 여는 일이 많다 — 지하철, 엘리베이터, 지하 주차장.
 * 저장해 둔 것이 없으면 브라우저의 "연결 없음" 화면만 뜨고, 기록은커녕 목록도 못 본다.
 *
 * 화면과 코드만 저장한다. 목록 같은 개인 데이터는 서버에서 받아 기기에 따로 보관한다
 * (lib/offline/feed-cache.ts). 여기에 담으면 로그아웃해도 남는다.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 서버 호출은 손대지 않는다. 낡은 목록을 최신인 척 돌려주면 안 된다.
  if (url.pathname.startsWith('/api/')) return;

  // 항상 새로 받아보고, 못 받을 때만 저장해 둔 것을 쓴다.
  //
  // 저장해 둔 것을 먼저 쓰는 편이 빠르지만 그렇게 하지 않는다. 개발 중에는 파일 이름이
  // 그대로라 고친 코드가 반영되지 않고, 배포 뒤에도 옛 화면이 한 번 더 뜬다.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(async () => (await caches.match(request)) ?? (await caches.match('/')) ?? Response.error()),
  );
});

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
