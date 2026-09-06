import 'server-only';

import { createClient } from '@/lib/supabase/server';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * 서버 컴포넌트에서 apps/api를 부른다.
 *
 * 실패(비로그인·네트워크·5xx)를 던지지 않고 null을 돌려주는 이유:
 * 초기 데이터는 있으면 좋은 것이지 없으면 안 되는 게 아니다.
 * null이면 클라이언트가 평소대로 다시 가져가고, 화면은 스켈레톤부터 시작한다.
 *
 * 세션 검증은 하지 않는다 — 토큰을 그대로 넘기고 apps/api가 검증한다.
 */
export async function serverFetch<T>(path: string): Promise<T | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  try {
    const res = await fetch(`${BASE_URL}/v1${path}`, {
      headers: { authorization: `Bearer ${session.access_token}` },
      // 사용자별 데이터라 캐시하지 않는다.
      cache: 'no-store',
    });

    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
