'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { DevSignIn } from '@/features/auth/dev-sign-in';
import { createClient } from '@/lib/supabase/client';

/**
 * 설계 12 / 12-B — 로그인은 필요한 순간에만 권한다.
 * "나중에"가 항상 열려 있어야 이 앱의 태도가 유지된다.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const params = useSearchParams();
  const logCount = Number(params.get('count') ?? 0);
  const [pending, setPending] = useState<'kakao' | 'google' | null>(null);

  const signIn = async (provider: 'kakao' | 'google') => {
    setPending(provider);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setPending(null);
  };

  return (
    <main className="safe-top flex min-h-dvh flex-col px-[30px] pb-9 pt-10">
      <h1 className="mt-[22px] text-26 font-bold leading-[1.45] tracking-[-.03em] text-ink">
        기록을 안전하게
        <br />
        보관할까요?
      </h1>

      <p className="mt-3 text-[14.5px] leading-[1.75] text-ink-2">
        {logCount > 0
          ? `지금까지 쌓인 ${logCount}개의 기록을 계정에 저장해두면`
          : '계정을 연결해두면'}
        <br />
        폰을 바꿔도 그대로 남아 있어요.
      </p>

      <div className="mt-[26px] flex items-center gap-3 rounded-lg border border-line bg-card px-5 py-[18px]">
        <span className="block h-2 w-2 shrink-0 rounded-full bg-sage" />
        <span className="text-14 leading-[1.6] text-ink-2">
          기록 내용은 다른 곳에 공유하지 않아요
        </span>
      </div>

      <DevSignIn />

      <div className="mt-auto flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => signIn('kakao')}
          disabled={pending !== null}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#FEE500] text-16 font-semibold text-[#191600] disabled:opacity-60"
        >
          <span className="block h-[18px] w-5 rounded-[9px_9px_8px_8px] bg-[#191600]" aria-hidden />
          {pending === 'kakao' ? '연결하는 중…' : '카카오로 계속하기'}
        </button>

        <button
          type="button"
          onClick={() => signIn('google')}
          disabled={pending !== null}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-card text-16 font-semibold text-ink disabled:opacity-60"
        >
          <span
            className="block h-[19px] w-[19px] rounded-full border-[3px] border-[#4285F4] border-b-[#FBBC05] border-r-[#EA4335]"
            aria-hidden
          />
          {pending === 'google' ? '연결하는 중…' : '구글로 계속하기'}
        </button>

        <Link href="/" className="mt-3 text-center text-14 text-ink-3">
          나중에
        </Link>
      </div>
    </main>
  );
}
