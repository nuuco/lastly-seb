import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { SEEN_ONBOARDING } from '@/lib/onboarding';

/**
 * 로그인 없이 열어 두는 길.
 *
 * 온보딩은 계정을 만들기 전에 보는 화면이고, /auth 는 로그인 과정에서
 * 거치는 자리다. 둘을 막으면 로그인 자체를 할 수 없다.
 *
 * /legal 은 약관과 개인정보처리방침이다. 구글 OAuth 동의 화면이 이 주소를
 * 확인하고, 약관을 읽으려고 계정부터 만들라는 것도 앞뒤가 맞지 않는다.
 */
const PUBLIC_PATHS = ['/login', '/auth', '/onboarding', '/legal'];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * 세션 토큰을 갱신하고, 계정이 없으면 로그인으로 돌려보낸다.
 *
 * 로그인 없이 쓰게 두면 그 기록은 계정에 묶이지 않아 폰을 바꾸거나
 * 브라우저를 비우는 순간 주인을 잃는다. 마지막으로 언제 했는지 기억해주는
 * 앱에서 그건 앱이 존재할 이유를 무너뜨린다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: Array<{ name: string; value: string; options: CookieOptions }>) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const target = request.nextUrl.clone();

    /**
     * 처음 온 사람은 온보딩(설계 01)부터 본다.
     * 무엇을 하는 앱인지 모르는 채로 로그인부터 요구하면 이유 없이 계정을 내주는
     * 꼴이 된다. 온보딩을 한 번 본 뒤로는 로그인으로 바로 보낸다.
     */
    if (!request.cookies.get(SEEN_ONBOARDING)) {
      target.pathname = '/onboarding';
      target.search = '';
      return NextResponse.redirect(target);
    }

    target.pathname = '/login';
    // 로그인 뒤 원래 가려던 자리로 돌려보낸다.
    target.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(target);
  }

  // 이미 로그인한 사람에게 로그인 화면을 다시 보여줄 이유가 없다.
  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}
