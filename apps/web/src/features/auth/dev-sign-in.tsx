'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * 개발·데모용 이메일 로그인.
 *
 * 카카오·구글 OAuth는 각 개발자 콘솔에 앱을 등록해야 쓸 수 있어서,
 * 그 전에 앱을 확인할 수 있도록 두는 임시 통로다.
 *
 * NEXT_PUBLIC_ENABLE_DEV_LOGIN=true 일 때만 뜬다. 빌드 종류가 아니라
 * 배포 설정으로 정하는 이유는, OAuth를 붙이기 전 배포에서도 들어가 봐야 하기 때문이다.
 * OAuth를 붙인 뒤에는 이 변수를 지우면 사라진다.
 *
 * 계정은 `node scripts/seed-dev-user.mjs` 가 만든다.
 * 공개된 저장소에 비밀번호가 함께 올라가므로, 공개 배포에서는
 * LASTLY_DEV_PASSWORD 로 다른 값을 정해 두는 편이 낫다.
 */
export function DevSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? 'dev@lastly.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== 'true') return null;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const { error } = await createClient().auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }

    // 서버 컴포넌트가 새 세션으로 홈 피드를 다시 가져오게 한다.
    router.replace('/');
    router.refresh();
  };

  return (
    <form onSubmit={signIn} className="mt-8 rounded-md border border-dashed border-line-muted p-4">
      <p className="text-12.5 font-semibold text-ink-3">개발용 로그인 (OAuth 설정 전 임시)</p>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="이메일"
        className="mt-3 h-11 w-full rounded-sm border border-line bg-surface px-3 text-[16px] text-ink outline-none focus:border-accent-ink"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="비밀번호"
        className="mt-2 h-11 w-full rounded-sm border border-line bg-surface px-3 text-[16px] text-ink outline-none focus:border-accent-ink"
      />

      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || !password}
        className="mt-3 h-11 w-full rounded-sm bg-ink text-15 font-semibold text-white disabled:opacity-60"
      >
        {pending ? '들어가는 중…' : '개발 계정으로 들어가기'}
      </button>
    </form>
  );
}
