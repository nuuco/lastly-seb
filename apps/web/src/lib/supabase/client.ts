'use client';

import { createBrowserClient } from '@supabase/ssr';

/** 브라우저용 Supabase 클라이언트. anon key만 쓰므로 RLS가 유일한 방어선이다. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
