'use client';

import Link from 'next/link';

import { Sheet } from '@/components/ui/sheet';

/**
 * 약 670MB를 받기 전에 한 번 묻는다. 기록은 막지 않는다.
 */
export function ModelConsentSheet({
  open,
  onAccept,
  onLater,
}: {
  open: boolean;
  onAccept: () => void;
  onLater: () => void;
}) {
  return (
    <Sheet open={open} onClose={onLater} label="이 기기에서 이해하기">
      <p className="text-13 font-bold text-accent-ink">말을 더 잘 이해하기 위해</p>
      <h2 className="mt-2 text-[22px] font-bold leading-[1.4] tracking-[-.03em] text-ink">
        AI 모델을 받을까요?
        <br />
        약 670MB예요
      </h2>
      <p className="mt-4 text-[14.5px] leading-[1.7] text-ink-2">
        Wi-Fi에서 받기를 권해요. 안 받아도 규칙으로 동작해요.{' '}
        {'"설정 > 이 기기에서 이해하기"'}에서 다시 받거나 삭제할 수 있어요.
      </p>
      <p className="mt-3 text-[13.5px] leading-[1.7] text-ink-3">
        이 파일은 Google Gemma 모델입니다. 받으면{' '}
        <Link href="/legal/terms" className="font-semibold text-accent-ink underline underline-offset-2">
          Lastly 이용약관
        </Link>
        과{' '}
        <a
          href="https://ai.google.dev/gemma/terms"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent-ink underline underline-offset-2"
        >
          Gemma 이용약관
        </a>
        에 동의하는 것입니다.
      </p>

      <button
        type="button"
        onClick={onAccept}
        className="mt-[18px] flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white"
      >
        지금 받기
      </button>
      <button
        type="button"
        onClick={onLater}
        className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-lg border border-line bg-card text-15.5 font-semibold text-ink-2"
      >
        나중에
      </button>
    </Sheet>
  );
}
