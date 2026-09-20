'use client';

import { createClient } from './client';

/**
 * 저장하기 직전에 계정을 마련한다.
 *
 * 둘러보기만 하는 사람에게는 계정을 만들지 않는다. 예전에는 홈에 들어서는 순간
 * 만들었는데, 그러면 링크만 열어보고 나간 사람과 검색 봇까지 계정이 생겼다 —
 * 실제로 25개 중 18개가 아무것도 남기지 않은 빈 계정이었다.
 *
 * 익명 로그인에는 IP 당 시간당 횟수 제한이 있다. 만드는 수를 줄이면 그 한도도 아낀다.
 */
export async function ensureSession(): Promise<string | null> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session.access_token;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // 계정을 못 만들면 저장도 못 한다. 부르는 쪽이 평소의 실패 화면을 내도록 던진다.
    throw new Error('계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return data.session?.access_token ?? null;
}
