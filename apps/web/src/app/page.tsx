import type { HomeFeed } from '@lastly/contracts';
import { redirect } from 'next/navigation';

import { HomeScreen } from '@/features/home/home-screen';
import { serverFetch } from '@/lib/api/server';
import { createClient } from '@/lib/supabase/server';

/**
 * 홈 피드를 서버에서 미리 가져와 내려보낸다.
 * 클라이언트는 그 데이터로 즉시 그리고 이후 갱신만 맡는다.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 전에는 홈을 보여줄 데이터가 없다.
  // 에러 화면 대신 로그인으로 보낸다 — 여기서 막히면 사용자는 앱이 고장난 줄 안다.
  if (!user) {
    redirect('/login');
  }

  const initialFeed = await serverFetch<HomeFeed>('/home/feed');
  return <HomeScreen initialFeed={initialFeed} />;
}
