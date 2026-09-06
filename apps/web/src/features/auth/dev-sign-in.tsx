'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * 개발용 이메일/비밀번호 로그인.
 *
 * 카카오·구글 OAuth는 각 개발자 콘솔에 앱을 등록해야 쓸 수 있어서,
 * 그 전에 앱을 확인할 수 있도록 두는 임시 통로다.
 * 프로덕션 빌드에서는 렌더되지 않는다 — 아래 가드를 지울 것.
 *
 * 계정은 `node scripts/seed-dev-user.mjs` 가 만든다.
 */
export function DevSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('dev@lastly.local');
  const [password, setPassword] = useState('lastly-dev-1234');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (process.env.NODE_ENV === 'production') return null;

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
      <p className="text-[12px] font-semibold text-ink-muted">개발용 로그인 (OAuth 설정 전 임시)</p>

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
        disabled={pending}
        className="mt-3 h-11 w-full rounded-sm bg-ink text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? '들어가는 중…' : '개발 계정으로 들어가기'}
      </button>
    </form>
  );
}
