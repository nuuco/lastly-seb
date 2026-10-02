import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * 카카오/구글 OAuth 리다이렉트 착지점 (화면 12).
 *
 * 실패하면 왜 실패했는지 로그인 화면까지 들고 간다. 예전에는 전부 `error=auth`
 * 하나로 뭉뚱그려서, 이미 그 이메일을 쓰는 계정이 있다는 것도 연동이 꺼져 있다는
 * 것도 같은 문구로 보였다 — 어디를 봐야 하는지 알 수 없었다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  /** 로그인 화면으로 돌려보내며 사유를 붙인다. */
  const back = (reason: string, detail?: string | null) => {
    const url = new URL('/login', origin);
    url.searchParams.set('error', reason);
    if (detail) url.searchParams.set('detail', detail.slice(0, 200));
    return NextResponse.redirect(url);
  };

  // 공급자나 Supabase 가 먼저 거절한 경우. code 없이 error 만 붙어서 돌아온다.
  const provider = searchParams.get('error') ?? searchParams.get('error_code');
  if (provider) return back(provider, searchParams.get('error_description'));

  if (!code) return back('no_code');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return back(error.code ?? 'exchange_failed', error.message);

  return NextResponse.redirect(`${origin}${next}`);
}
