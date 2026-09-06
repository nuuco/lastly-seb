'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

interface ToastProps {
  message: string;
  highlight?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** 되돌리기를 누를 시간을 준다. */
  durationMs?: number;
}

/**
 * 완료 직후 토스트 — 설계 05-B.
 *
 * 입력 바 바로 위에 앉아 방금 무슨 일이 일어났는지 말하고,
 * 되돌릴 기회를 6초간 열어 둔다. 실수로 눌렀을 때 되돌릴 수 없으면
 * 사용자는 "오늘 했어요"를 누르기 전에 망설이게 된다.
 */
export function Toast({
  message,
  highlight,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 6000,
}: ToastProps) {
  // 아래에서 살짝 올라오며 나타난다. 갑자기 튀어나오면 놓치기 쉽다.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(onDismiss, durationMs);

    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(timer);
    };
  }, [durationMs, onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[104px] z-40 mx-auto w-full max-w-[430px] px-[22px]"
    >
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-3 rounded-row bg-ink px-4 py-3.5 shadow-toast',
          'transition-all duration-200 ease-out motion-reduce:transition-none',
          shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        <p className="flex-1 text-[13.5px] leading-[1.55] text-paper">
          {message}
          {highlight ? <strong className="ml-1 font-bold">{highlight}</strong> : null}
        </p>

        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-13 font-bold text-[#E3B27A]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
