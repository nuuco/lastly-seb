'use client';

import { useEffect, useState } from 'react';

import { createClient } from './client';

/**
 * 계정이 있는지. 아직 아무것도 저장하지 않은 사람은 없다.
 *
 * 확인하기 전에는 null 이다. 서버에는 브라우저 저장소가 없어 첫 렌더에서 알 수 없고,
 * 그릴 때 바로 읽으면 서버와 결과가 갈려 화면을 다시 그리게 된다.
 */
export function useSignedIn(initial: boolean | null = null): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(initial);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });

    /**
     * 계정은 처음 저장할 때 생긴다. 그 순간을 화면이 알아야 한다.
     *
     * 예전에는 첫 화면을 그릴 때의 값만 보고 끝냈다. 그래서 첫 기록으로 계정이 생겨도
     * 목록을 부르지 않는 상태가 유지됐고, 방금 남긴 것이 화면에 안 나타났다.
     * 다른 화면에 갔다 와야 보였다.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setSignedIn(Boolean(session));
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}

/**
 * 익명 계정인지. 확인 전에는 null.
 *
 * 익명은 이 브라우저의 토큰이 유일한 열쇠라, 로그아웃처럼 그 열쇠를 버리는 길을
 * 열어두면 안 된다. 화면이 그 구분을 할 수 있어야 한다.
 */
export function useAnonymous(): boolean | null {
  const [anonymous, setAnonymous] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!alive) return;
        setAnonymous(data.user ? Boolean(data.user.is_anonymous) : null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return anonymous;
}
