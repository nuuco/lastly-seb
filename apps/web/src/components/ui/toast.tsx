'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  highlight?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** 되돌리기를 누를 시간을 준다. */
  durationMs?: number;
}

/** 완료 직후 토스트 (화면 05-B). 되돌리기가 붙는다. */
export function Toast({
  message,
  highlight,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 6000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-0 bottom-[88px] z-40 mx-auto w-full max-w-[430px] px-4"
    >
      <div className="flex items-center gap-3 rounded-[14px] bg-ink px-4 py-3 text-white shadow-toast">
        <p className="flex-1 text-[14px] leading-snug">
          {message}
          {highlight ? <strong className="ml-1 font-semibold">{highlight}</strong> : null}
        </p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-[14px] font-semibold text-white/90 underline underline-offset-2"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
