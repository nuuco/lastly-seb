'use client';

import type { SignupPrompt } from '@lastly/contracts';
import { useState } from 'react';

import { Sheet } from '@/components/ui/sheet';
import { createClient } from '@/lib/supabase/client';

/**
 * 가입 유도 — 설계 12-B.
 *
 * 로그인 없이 쓰게 열어두는 대신, 계정이 사주는 것이 아쉬워지는 순간에 한 번 권한다.
 * 아무것도 막지 않는다. "나중에 할게요" 를 누르면 그 이유로는 다시 묻지 않는다.
 *
 * 같은 요청이므로 상황이 달라도 같은 모양으로 낸다. 배지와 제목만 갈린다.
 */
const COPY: Record<SignupPrompt, { badge: string; title: string[] }> = {
  records: {
    badge: '기록 3개째',
    title: ['잘 쌓이고 있어요.', '이 기록, 안전하게 보관할까요?'],
  },
  notifications: {
    badge: '알림 설정',
    title: ['알림을 받으시려면', '계정을 연결해 주세요.'],
  },
};

export function SignupPromptSheet({
  prompt,
  onDismiss,
}: {
  prompt: SignupPrompt;
  onDismiss: () => void;
}) {
  const [pending, setPending] = useState(false);
  const { badge, title } = COPY[prompt];

  /**
   * 익명으로 쓰던 계정에 구글 신원을 붙인다.
   *
   * signInWithOAuth 를 쓰면 새 계정으로 갈아타서 지금까지 적은 기록이 주인을 잃는다.
   * linkIdentity 는 user_id 를 그대로 두므로 옮길 것이 없다.
   */
  const connect = async () => {
    setPending(true);

    const supabase = createClient();
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', '/');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const options = { redirectTo: callback.toString() };
    const { error } = user?.is_anonymous
      ? await supabase.auth.linkIdentity({ provider: 'google', options })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options });

    if (error) setPending(false);
  };

  return (
    <Sheet open onClose={onDismiss} label="기록을 계정에 보관하기">
      <span className="inline-block rounded-[9px] bg-accent-soft px-3 py-1.5 text-12 font-bold tracking-wide2 text-accent-ink">
        {badge}
      </span>

      <h2 className="mt-3.5 text-22 font-bold leading-[1.45] tracking-t35 text-ink">
        {title[0]}
        <br />
        {title[1]}
      </h2>

      <p className="mt-2.5 break-keep text-14 leading-[1.75] text-ink-2">
        계정을 연결해두면 폰을 바꾸거나 앱을 지워도
        <br />
        지금까지의 기록이 그대로 남아요.
      </p>

      {/* 카카오는 콘솔 등록 전이라 내려두었다. 등록이 끝나면 여기에 한 줄 더한다. */}
      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={connect}
          disabled={pending}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-card text-16 font-semibold text-ink disabled:opacity-60"
        >
          <span
            className="block h-[19px] w-[19px] rounded-full border-[3px] border-[#4285F4] border-b-[#FBBC05] border-r-[#EA4335]"
            aria-hidden
          />
          {pending ? '연결하는 중…' : '구글로 계속하기'}
        </button>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        disabled={pending}
        className="mt-4 w-full text-center text-14 text-ink-3 disabled:opacity-60"
      >
        나중에 할게요
      </button>
    </Sheet>
  );
}
