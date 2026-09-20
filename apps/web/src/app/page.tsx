import type { HomeFeed } from '@lastly/contracts';

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

  /**
   * 계정이 아직 없을 수 있다. 처음 저장할 때 만들어지기 때문이다.
   * 그 사람에게는 서버를 부르지 않고 빈 홈을 보여준다 — 첫 기록을 남기면 그때 계정이 생긴다.
   */
  if (!user) {
    return <HomeScreen initialFeed={null} signedIn={false} />;
  }

  const initialFeed = await serverFetch<HomeFeed>('/home/feed');
  return <HomeScreen initialFeed={initialFeed} signedIn />;
}
