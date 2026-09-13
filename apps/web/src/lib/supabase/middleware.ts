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
 * 세션 토큰을 갱신하고, 없으면 익명 계정을 만들어 들여보낸다.
 *
 * 가입부터 요구하면 무엇을 하는 앱인지 모르는 채로 계정을 내주게 된다.
 * 그래서 일단 쓰게 하고, 기록이 쌓였을 때 구글 계정으로 넘기자고 권한다.
 *
 * 익명이라고 해서 기록이 브라우저에만 있는 것은 아니다. Supabase 익명 로그인은
 * auth.users 에 진짜 행을 만들고 기록도 처음부터 서버에 들어간다. 나중에 구글을
 * 연결하면 같은 user_id 에 신원만 붙어서, 옮길 데이터가 없다.
 *
 * 다만 이 브라우저의 토큰을 잃으면 그 계정에 다시 닿을 길이 없다.
 * 기록이 쌓이기 전에 계정으로 넘기도록 권하는 이유가 그것이다.
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
    /**
     * 처음 온 사람은 온보딩(설계 01)부터 본다.
     * 무엇을 하는 앱인지 보여준 뒤에 들여보내는 편이 순서가 맞다.
     */
    if (!request.cookies.get(SEEN_ONBOARDING)) {
      const target = request.nextUrl.clone();
      target.pathname = '/onboarding';
      target.search = '';
      return NextResponse.redirect(target);
    }

    /**
     * 온보딩을 본 사람에게는 익명 계정을 만들어 그대로 들여보낸다.
     * 실패하면(익명 로그인이 꺼져 있거나 한도에 걸리면) 예전처럼 로그인으로 보낸다.
     */
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      const target = request.nextUrl.clone();
      target.pathname = '/login';
      target.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(target);
    }

    // 세션 쿠키가 응답에 실렸으므로 이번 요청부터 바로 쓴다.
    return response;
  }

  /**
   * 구글까지 마친 사람에게 로그인 화면을 다시 보여줄 이유가 없다.
   * 익명 사용자에게는 보여준다 — 계정으로 넘어가는 길이 그 화면이다.
   */
  if (user && !user.is_anonymous && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}
