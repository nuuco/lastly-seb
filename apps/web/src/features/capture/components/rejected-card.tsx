'use client';

import type { InterpretResult } from '@lastly/contracts';

/** 예정·못 함 — 저장하지 않는다는 안내. */
export function RejectedCard({
  result,
  onDismiss,
}: {
  result: InterpretResult;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-2.5 rounded-[22px] border border-line bg-card p-[16px_18px] shadow-card">
      <p className="text-12 font-bold tracking-wide2 text-ink-3">기록하지 않아요</p>
      <p className="mt-1.5 text-14 text-ink-2">“{result.transcript}”</p>
      <p className="mt-3 text-15 font-semibold leading-[1.55] text-ink">
        {result.rejectReason ?? '아직 안 한 일이나 앞으로 할 일은 기록하지 않아요.'}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3.5 w-full rounded-[13px] bg-ink py-3.5 text-center text-14 font-semibold text-white"
      >
        확인
      </button>
    </div>
  );
}
