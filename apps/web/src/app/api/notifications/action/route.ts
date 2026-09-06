import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * 서비스워커가 잠금화면 알림 액션을 여기로 보낸다 (화면 14).
 * 서비스워커에는 Supabase 세션이 없으므로, 쿠키를 읽을 수 있는 이 라우트를 거쳐
 * apps/api로 중계한다.
 */
export async function POST(request: NextRequest) {
  const { itemId, action } = await request.json();

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/v1/notifications/items/${itemId}/action`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action }),
    },
  );

  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
