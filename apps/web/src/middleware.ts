import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/** dev/ 는 온디바이스 실험실. 로그인·Supabase 없이 연다. */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|on-device-worker.js|models/|dev/).*)',
  ],
};
