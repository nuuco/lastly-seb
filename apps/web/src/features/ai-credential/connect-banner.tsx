'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { aiCredentialApi } from '@/lib/api/ai-credential';

/**
 * 무료 체험을 다 썼을 때만 뜬다.
 *
 * 남아 있는 동안에는 아무 말도 하지 않는다. 아직 필요 없는 일을 미리 시키면
 * 앱을 써 보기도 전에 설정으로 내몰게 된다.
 *
 * 키가 없어도 기록 자체는 계속 된다 — 이름을 직접 정하면 저장된다.
 * 그래서 막는 문구가 아니라 권하는 문구로 쓴다.
 */
export function ConnectBanner() {
  const status = useQuery({ queryKey: ['ai-credential'], queryFn: aiCredentialApi.status });

  const needsKey = status.data && !status.data.credential && status.data.trialRemaining === 0;
  if (!needsKey) return null;

  return (
    <Link
      href="/settings"
      className="mt-4 flex items-center gap-3 rounded-md border border-line bg-accent-soft px-4 py-3.5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-action-pressed">
          무료 체험을 다 쓰셨어요
        </span>
        <span className="mt-1 block break-keep text-12.5 leading-[1.6] text-ink-2">
          AI를 연결하면 말한 문장을 다시 알아서 정리해드려요.
        </span>
      </span>
      <span
        className="block h-1.5 w-1.5 shrink-0 rotate-45 border-r-[1.5px] border-t-[1.5px] border-ink-4"
        aria-hidden
      />
    </Link>
  );
}
