'use client';

import { useEffect, useState } from 'react';

/**
 * 지금 연결돼 있는지.
 *
 * 처음에는 true 로 둔다. 서버에는 이 값이 없어서, 그릴 때 바로 읽으면 서버와 결과가
 * 갈려 화면을 다시 그리게 된다.
 *
 * 브라우저가 "연결됨" 이라고 해도 실제로는 막혀 있을 수 있다(로그인이 필요한 공용 와이파이 등).
 * 그래서 부르기 실패와 함께 본다.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);

    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
