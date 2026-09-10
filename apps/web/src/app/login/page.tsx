'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { DevSignIn } from '@/features/auth/dev-sign-in';
import { createClient } from '@/lib/supabase/client';

/**
 * 설계 12 — 로그인.
 *
 * 원 설계는 로그인 없이 쓰다가 필요할 때 권하는 구조였다. 계정에 묶이지 않은
 * 기록은 폰을 바꾸거나 브라우저를 비우면 주인을 잃는데, 마지막으로 언제 했는지
 * 기억해주는 앱에서 그건 존재 이유가 무너지는 일이다. 그래서 들어오는 문으로 옮겼다.
 * "나중에" 도 같은 이유로 뺐다 — 나중이 없다.
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
  // 막혀서 돌아온 자리. 로그인 뒤 그리로 데려간다.
  const next = params.get('next') ?? '/';
  const failed = params.get('error') === 'auth';
  const [pending, setPending] = useState<'kakao' | 'google' | null>(null);

  const signIn = async (provider: 'kakao' | 'google') => {
    setPending(provider);
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', next);

    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
    if (error) setPending(null);
  };

  return (
    <main className="safe-top flex min-h-dvh flex-col px-[30px] pb-9 pt-10">
      <h1 className="mt-[22px] text-26 font-bold leading-[1.45] tracking-t3 text-ink">
        마지막으로 언제 했는지
        <br />
        기억해드릴게요
      </h1>

      <p className="mt-3 text-[14.5px] leading-[1.75] text-ink-2">
        계정에 담아두면 폰을 바꾸거나 앱을 지워도
        <br />
        지금까지의 기록이 그대로 남아요.
      </p>

      {failed ? (
        <p className="mt-4 rounded-md border border-line bg-accent-soft px-4 py-3 text-[13.5px] leading-[1.7] text-accent-ink">
          로그인이 끝까지 되지 않았어요. 한 번만 다시 해주세요.
        </p>
      ) : null}

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

      </div>
    </main>
  );
}
