'use client';

import type { Item } from '@lastly/contracts';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { cycleProgress, describeCadence, formatDueBadge, formatShortDate } from '@/lib/date';

/**
 * 설계 05는 버킷마다 행 모양이 다르다. 하나로 합치면 화면이 평평해진다.
 *  - 다가오는 항목: 이름 + D-n 크게, 아래에 경과 진행 막대
 *  - 여유 있는 항목: 목록이 아니라 "가장 가까운 건 ○○" 한 줄
 */

/** 항목들을 묶는 둥근 카드. 행 사이는 구분선으로만 나눈다. */
export function RowGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-card border border-line bg-card px-4 shadow-card">{children}</div>
  );
}

export function UpcomingRow({ item, last }: { item: Item; last: boolean }) {
  const progress = cycleProgress(item);
  // 곧 다가온 항목은 진하게, 아직 여유가 있으면 옅게 칠한다.
  const near = (item.daysUntilDue ?? 99) <= 7;

  return (
    <Link
      href={`/items/${item.id}`}
      className={cn('block px-0.5 py-3.5 transition-colors active:bg-surface-alt', !last && 'border-b border-line')}
    >
      <div className="flex items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-16 font-semibold tracking-t25 text-ink">
          {item.name}
        </span>
        <span
          className={cn(
            'shrink-0 font-bold leading-none tracking-t4',
            near ? 'text-16 text-action' : 'text-14 text-ink-2',
          )}
        >
          {formatDueBadge(item.daysUntilDue)}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-2.5">
        <span className="relative block h-1 flex-1 overflow-hidden rounded-[2px] bg-bar-track">
          <span
            className={cn(
              'absolute inset-y-0 left-0 block rounded-[2px]',
              near ? 'bg-bar-near' : 'bg-bar-far',
            )}
            style={{ width: `${progress}%` }}
          />
        </span>
        <span className="shrink-0 text-12 text-ink-3">
          {item.daysSinceLastDone !== null ? `${item.daysSinceLastDone}일 전` : '기록 없음'} ·{' '}
          {describeCadence(item.cadence)}
        </span>
      </div>
    </Link>
  );
}

/**
 * 여유 있는 항목 — 설계 05 는 이걸 목록으로 펼치지 않는다.
 * "가장 가까운 건 ○○" 한 줄로 접어두고 전체는 눌러서 본다.
 * 아직 한참 남은 일이 화면을 차지하면 오늘 할 일이 묻히기 때문이다.
 */
export function LaterSummaryRow({ items }: { items: Item[] }) {
  const nearest = items[0];
  if (!nearest) return null;

  return (
    <Link
      href={`/items/${nearest.id}`}
      className="flex items-center gap-2.5 px-0.5 py-3.5 transition-colors active:bg-surface-alt"
    >
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-2">
        {/* 쉬는 중이면 언제 돌아오는지 말한다 — 숨겨두고 잊게 두지 않는다. */}
        {nearest.snoozedUntil
          ? `${nearest.name}은 ${formatShortDate(nearest.snoozedUntil)}까지 쉬는 중`
          : `가장 가까운 건 ${nearest.name}`}
      </span>
      <span className="shrink-0 text-12.5 font-semibold tracking-[-.02em] text-ink-3">
        {nearest.snoozedUntil ? '휴식' : formatDueBadge(nearest.daysUntilDue)}
      </span>
      <Chevron />
    </Link>
  );
}

/** 오른쪽 끝 꺾쇠. 설계가 SVG 대신 테두리 두 개를 돌려서 그렸다. */
function Chevron() {
  return (
    <span
      className="block h-1.5 w-1.5 shrink-0 rotate-45 border-r-[1.5px] border-t-[1.5px] border-ink-4"
      aria-hidden
    />
  );
}

export function SectionHeader({
  label,
  count,
  dim,
}: {
  label: string;
  count: number;
  dim?: boolean;
}) {
  return (
    <div className="mt-4 flex items-baseline gap-1.5 px-1">
      <span
        className={cn('text-13 font-bold tracking-t1', dim ? 'text-ink-2' : 'text-ink')}
      >
        {label}
      </span>
      <span className="text-12.5 text-ink-3">{count}</span>
    </div>
  );
}
