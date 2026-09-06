'use client';

import type { Item } from '@lastly/contracts';
import Link from 'next/link';

import { describeCadence, formatShortDate } from '@/lib/date';

/**
 * "오늘 챙길 것" 강조 카드 — 설계 05.
 * 이 화면에서 유일하게 그라디언트와 큰 그림자를 쓴다. 오늘 할 일을 하나로 좁혀 보여주기 위해서다.
 */
export function HeroCard({
  item,
  onComplete,
  completing,
}: {
  item: Item;
  onComplete: (item: Item) => void;
  completing: boolean;
}) {
  return (
    <div className="rounded-hero border border-line-2 bg-hero p-[18px_20px] shadow-hero transition-transform active:scale-[.995]">
      <Link href={`/items/${item.id}`} className="block">
        <div className="flex items-center gap-2">
          <span className="block h-1.5 w-1.5 rounded-full bg-dot-warn" />
          <span className="text-12.5 font-bold tracking-wide2 text-accent-ink">오늘 챙길 것</span>
        </div>

        <p className="mt-3 text-21 font-bold tracking-t35 text-ink">{item.name}</p>

        <div className="mt-2 flex items-baseline gap-[7px]">
          <span className="text-30 font-bold leading-none tracking-t55 text-ink">
            {item.daysSinceLastDone ?? '—'}
          </span>
          <span className="text-14 font-semibold text-ink-2">일 전에 했어요</span>
          <span className="ml-auto text-12.5 text-ink-3">
            {describeCadence(item.cadence)}
            {item.lastDoneOn ? ` · ${formatShortDate(item.lastDoneOn)}` : ''}
          </span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onComplete(item)}
        disabled={completing}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-row bg-action text-15.5 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
      >
        {completing ? '기록하는 중…' : '오늘 했어요'}
      </button>
    </div>
  );
}
