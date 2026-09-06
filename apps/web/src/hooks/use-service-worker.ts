'use client';

import { useEffect } from 'react';

/** 푸시 알림 수신을 위해 서비스워커를 등록한다. 등록 실패는 무시한다 — 앱 자체는 동작한다. */
export function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 개발 중 HTTPS가 아니거나 브라우저가 지원하지 않는 경우.
    });
  }, []);
}
