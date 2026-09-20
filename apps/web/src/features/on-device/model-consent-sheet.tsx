'use client';

import Link from 'next/link';

import { Sheet } from '@/components/ui/sheet';

import { isMeteredConnection } from './consent';

/**
 * 약 670MB를 받기 전에 한 번 묻는다. 기록은 막지 않는다.
 * 셀룰러·네트워크를 모를 때는 기본이 나중에다.
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
  const metered = isMeteredConnection();

  return (
    <Sheet open={open} onClose={onLater} label="이 기기에서 이해하기">
      <p className="text-13 font-bold text-accent-ink">이 기기에서 더 잘 이해하려면</p>
      <h2 className="mt-2 text-[22px] font-bold leading-[1.4] tracking-[-.03em] text-ink">
        모델을 받을까요?
        <br />
        약 670MB예요
      </h2>
      <p className="mt-4 text-[14.5px] leading-[1.7] text-ink-2">
        {metered
          ? '지금 연결은 데이터가 나갈 수 있어요. 나중에 Wi-Fi에서 받기를 권해요. 그동안은 규칙과 서버로 이해합니다.'
          : 'Wi-Fi에서 받기를 권해요. 받는 동안에도 기록은 그대로 할 수 있어요.'}
      </p>
      <p className="mt-3 text-[13.5px] leading-[1.7] text-ink-3">
        이 파일은 Google Gemma 모델입니다. 받기면{' '}
        <Link href="/legal/terms" className="font-semibold text-accent-ink underline underline-offset-2">
          이용약관
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
        {metered ? '데이터로도 받기' : '지금 받기'}
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
