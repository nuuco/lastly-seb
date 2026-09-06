'use client';

import { addMonths, format } from 'date-fns';
import { useState } from 'react';

import { Chevron } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/lib/date';

const PRESETS = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
] as const;

/**
 * 당분간 쉬어가기 — 주기 시트 안에서 고른다.
 *
 * 주기 수정과 다른 점: 리듬(cadence)은 그대로 두고 다음 차례만 미룬다.
 * 겨울에 에어컨 필터를 4개월 쉬어도, 돌아오면 다시 45일 리듬을 탄다.
 * 기간이 지나면 스스로 돌아오므로 보관함처럼 잊혀질 자리가 생기지 않는다.
 */
export function SnoozePicker({
  snoozedUntil,
  onPick,
  onCancel,
  onBack,
}: {
  snoozedUntil: string | null;
  onPick: (until: string) => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const today = new Date();
  const [customDate, setCustomDate] = useState('');

  return (
    <>
      <div className="flex items-center">
        <button type="button" onClick={onBack} className="text-14 text-ink-3">
          뒤로
        </button>
        <span className="ml-auto text-19 font-bold tracking-[-.03em] text-ink">쉬어가기</span>
        <span className="ml-auto w-8" aria-hidden />
      </div>

      <p className="mt-5 text-[13.5px] leading-[1.7] text-ink-3">
        그동안 알림을 보내지 않아요. 기간이 지나면 원래 주기로 스스로 돌아옵니다.
      </p>

      <div className="mt-5 flex flex-col gap-[9px]">
        {PRESETS.map((preset) => {
          const until = format(addMonths(today, preset.months), 'yyyy-MM-dd');
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onPick(until)}
              className="flex items-center justify-between rounded-lg border border-line px-[18px] py-4 text-left"
            >
              <span className="text-16 font-semibold text-ink">{preset.label}</span>
              <span className="text-13 text-ink-3">{formatShortDate(until)}까지</span>
            </button>
          );
        })}

        <label className="flex items-center justify-between rounded-lg border border-line px-[18px] py-4">
          <span className="text-16 font-semibold text-ink">직접 고르기</span>
          <input
            type="date"
            value={customDate}
            min={format(today, 'yyyy-MM-dd')}
            onChange={(e) => {
              setCustomDate(e.target.value);
              if (e.target.value) onPick(e.target.value);
            }}
            className="bg-transparent text-13 text-ink-3 outline-none"
          />
        </label>
      </div>

      {snoozedUntil ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 flex h-[52px] w-full items-center justify-center rounded-lg border border-line bg-card text-15.5 font-semibold text-ink-2"
        >
          지금 다시 시작하기
        </button>
      ) : null}
    </>
  );
}

/** 주기 시트 하단에 붙는 진입 행. */
export function SnoozeEntry({
  snoozedUntil,
  onClick,
}: {
  snoozedUntil: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mt-5 flex w-full items-center justify-between border-t border-line pt-5 text-left',
      )}
    >
      <span className="text-15.5 font-semibold text-ink-2">
        {snoozedUntil ? '쉬는 중' : '당분간 쉬어갈래요'}
      </span>
      <span className="flex items-center gap-2.5 text-13 text-ink-3">
        {snoozedUntil ? `${formatShortDate(snoozedUntil)}까지` : null}
        <Chevron className="border-[1.6px] border-b-0 border-l-0" />
      </span>
    </button>
  );
}
