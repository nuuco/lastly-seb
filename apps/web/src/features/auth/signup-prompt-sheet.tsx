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
const COPY: Record<SignupPrompt, { badge: string; title: string[]; body: string[] }> = {
  records: {
    badge: '기록 3개째',
    title: ['잘 쌓이고 있어요.', '이 기록, 안전하게 보관할까요?'],
    body: ['계정을 연결해두면 폰을 바꾸거나 앱을 지워도', '지금까지의 기록이 그대로 남아요.'],
  },
  /**
   * 계정이 없어도 알림은 온다. 익명도 진짜 계정이라 배치가 그대로 집어간다.
   * 그러니 "계정이 있어야 알림을 받는다" 고 말하면 거짓말이 된다.
   *
   * 진짜 문제는 이 브라우저의 쿠키가 유일한 열쇠라는 것이다. 그걸 잃으면
   * 계정과 함께 알림도 끊기는데, 주기가 2주·한 달인 앱이라 한동안 안 여는 것이
   * 정상이라 더 그렇다.
   */
  notifications: {
    badge: '알림 설정',
    title: ['알림은 지금도 받으실 수 있어요.', '다만 이 기기에서만요.'],
    body: ['브라우저를 비우거나 폰을 바꾸면 알림이 끊겨요.', '계정을 연결해두면 그대로 이어집니다.'],
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
  const { badge, title, body } = COPY[prompt];

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
        {body[0]}
        <br />
        {body[1]}
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
