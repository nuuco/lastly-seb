'use client';

import { useEffect, useState } from 'react';

import { createClient } from './client';

/**
 * 계정이 있는지. 아직 아무것도 저장하지 않은 사람은 없다.
 *
 * 확인하기 전에는 null 이다. 서버에는 브라우저 저장소가 없어 첫 렌더에서 알 수 없고,
 * 그릴 때 바로 읽으면 서버와 결과가 갈려 화면을 다시 그리게 된다.
 */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) setSignedIn(Boolean(data.session));
      });
    return () => {
      alive = false;
    };
  }, []);

  return signedIn;
}
