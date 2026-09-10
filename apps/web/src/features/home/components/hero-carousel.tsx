'use client';

import type { Item } from '@lastly/contracts';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { describeCadence, formatDueBadge, formatShortDate } from '@/lib/date';

/**
 * "오늘 챙길 것" 캐러셀 — 설계 05.
 *
 * 오늘 챙길 게 여럿이면 세로로 쌓지 않고 옆으로 넘긴다.
 * 쌓아 올리면 목록이 되어 "오늘은 이것만" 이라는 인상이 사라진다.
 *
 * 오른쪽을 화면 밖으로 24px 밀어내(-mr-6) 다음 카드가 살짝 걸치게 둔다.
 * 넘길 게 더 있다는 걸 점보다 이 걸침이 먼저 알려준다.
 */
export function HeroCarousel({
  items,
  onComplete,
  completingId,
}: {
  items: Item[];
  onComplete: (item: Item) => void;
  completingId: string | null;
}) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  /** 스크롤 위치에서 현재 카드를 되짚는다. 카드 폭 + 간격이 한 칸이다. */
  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const step = 300 + 10;
    setActive(Math.round(track.scrollLeft / step));
  };

  return (
    <div className="mt-4">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="-mr-6 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scrollbar-none"
      >
        {items.map((item) => (
          <HeroCard
            key={item.id}
            item={item}
            onComplete={onComplete}
            completing={completingId === item.id}
          />
        ))}
      </div>

      {items.length > 1 ? (
        <div className="mt-2.5 flex justify-center gap-[5px]" aria-hidden>
          {items.map((item, i) => (
            <span
              key={item.id}
              className={cn(
                'block h-1.5 rounded-[3px] transition-all duration-200',
                i === active ? 'w-4 bg-dot-on' : 'w-1.5 bg-dot-off',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HeroCard({
  item,
  onComplete,
  completing,
}: {
  item: Item;
  onComplete: (item: Item) => void;
  completing: boolean;
}) {
  const overdue = (item.daysUntilDue ?? 0) < 0;

  return (
    <div className="w-[300px] shrink-0 snap-start rounded-card border border-line bg-card p-[18px_20px] shadow-hero-card">
      <Link href={`/items/${item.id}`} className="block">
        <div className="flex items-baseline gap-2.5">
          <span className="min-w-0 flex-1 truncate text-19 font-bold tracking-t35 text-ink">
            {item.name}
          </span>
          {/* 밀린 항목만 붉다. 오늘치는 주 액션과 같은 색으로 둔다. */}
          <span
            className={cn(
              'shrink-0 text-13 font-bold tracking-t3',
              overdue ? 'text-danger' : 'text-accent-ink',
            )}
          >
            {formatDueBadge(item.daysUntilDue)}
          </span>
        </div>

        <div className="mt-[9px] flex items-baseline gap-1.5">
          <span className="text-26 font-bold leading-none tracking-t55 text-ink">
            {item.daysSinceLastDone ?? '—'}
          </span>
          <span className="text-13.5 font-semibold text-ink-2">일 전에 했어요</span>
        </div>

        <p className="mt-1.5 text-12 text-ink-3">
          {describeCadence(item.cadence)}
          {item.lastDoneOn ? ` · ${formatShortDate(item.lastDoneOn)}` : ''}
        </p>
      </Link>

      {/* 꽉 찬 버튼이 아니라 옅게 깔린 면이다 — 카드가 이미 강조라 두 번 강조하지 않는다. */}
      <button
        type="button"
        onClick={() => onComplete(item)}
        disabled={completing}
        className="mt-3.5 flex h-12 w-full items-center justify-center rounded-soft bg-action-soft text-15 font-semibold text-action-soft-ink active:bg-[#F0E0D4] disabled:opacity-60"
      >
        {completing ? '기록하는 중…' : '오늘 했어요'}
      </button>
    </div>
  );
}
