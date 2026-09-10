'use client';

import type { CalendarMark } from '@lastly/contracts';
import { useQuery } from '@tanstack/react-query';
import { addMonths, format, getDay, getDaysInMonth, parseISO } from 'date-fns';
import Link from 'next/link';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { itemsApi } from '@/lib/api/items';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 달력 뷰 — 설계 05-C.
 *
 * 예정일은 각 항목의 다음 한 번만 찍는다. 주기로 앞날을 계속 그려내면
 * 아직 일어나지 않은 일이 사실처럼 보이는데, 주기는 기록이 쌓이면 바뀐다.
 */
export function CalendarView({
  today,
  month,
  onMonthChange,
}: {
  today: Date;
  /** YYYY-MM. 헤더의 연·월과 같은 값을 봐야 해서 밖에서 들고 있는다. */
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const cursor = parseISO(`${month}-01`);
  const todayIso = format(today, 'yyyy-MM-dd');
  const [selected, setSelected] = useState(todayIso);

  const data = useQuery({
    queryKey: ['calendar', month],
    queryFn: () => itemsApi.calendar(month),
  });

  const days = data.data?.days ?? {};
  const first = cursor;
  const blanks = getDay(first);
  const count = getDaysInMonth(first);
  const picked = days[selected] ?? [];

  const goto = (delta: number) => {
    const next = addMonths(cursor, delta);
    const nextMonth = format(next, 'yyyy-MM');
    onMonthChange(nextMonth);
    // 달을 옮기면 그 달 1일을 고른다. 지난 달의 날짜가 남아 있으면 목록이 빈다.
    setSelected(nextMonth === format(today, 'yyyy-MM') ? todayIso : `${nextMonth}-01`);
  };

  return (
    <div>
      <div className="mt-3.5 rounded-card border border-line bg-card px-3 pb-3 pt-4 shadow-card">
        <div className="flex items-center justify-between px-2 pb-3">
          <button type="button" onClick={() => goto(-1)} aria-label="이전 달" className="p-1">
            <span className="block h-2 w-2 rotate-45 border-b-[1.7px] border-l-[1.7px] border-ink-3" />
          </button>
          <span className="text-15 font-bold tracking-t2 text-ink">{format(cursor, 'M')}월</span>
          <button type="button" onClick={() => goto(1)} aria-label="다음 달" className="p-1">
            <span className="block h-2 w-2 rotate-45 border-r-[1.7px] border-t-[1.7px] border-ink-3" />
          </button>
        </div>

        <div className="flex pb-1.5">
          {WEEKDAYS.map((w, i) => (
            <span
              key={w}
              className={cn(
                'flex-1 text-center text-[11.5px] font-semibold',
                i === 0 ? 'text-danger' : 'text-ink-3',
              )}
            >
              {w}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: blanks }).map((_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: count }).map((_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`;
            return (
              <DayCell
                key={date}
                day={i + 1}
                marks={days[date] ?? []}
                isToday={date === todayIso}
                isSelected={date === selected}
                onSelect={() => setSelected(date)}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3.5 px-1.5 text-12 text-ink-3">
        <Legend className="bg-action" label="예정일" />
        <Legend className="bg-dot-mute" label="완료 이력" />
        <Legend className="bg-danger" label="밀린 항목" />
      </div>

      <p className="mt-3.5 px-1 text-13 font-bold text-ink">
        {format(parseISO(selected), 'M월 d일')}
        {selected === todayIso ? ' · 오늘' : ''}
      </p>

      {picked.length > 0 ? (
        <div className="mt-2 rounded-[20px] border border-line bg-card px-4 shadow-card">
          {picked.map((mark, i) => (
            <Link
              key={`${mark.itemId}-${mark.kind}`}
              href={`/items/${mark.itemId}`}
              className={cn(
                'flex items-center gap-2.5 px-0.5 py-[13px]',
                i === picked.length - 1 || 'border-b border-line',
              )}
            >
              <span
                className={cn(
                  'flex-1 truncate text-15 font-semibold',
                  mark.kind === 'done' ? 'text-ink-2' : 'text-ink',
                )}
              >
                {mark.name}
              </span>
              <span className={cn('shrink-0 text-12.5 font-bold', kindTone(mark.kind))}>
                {kindLabel(mark)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-center text-13 text-ink-3">이 날은 비어 있어요</p>
      )}
    </div>
  );
}

function DayCell({
  day,
  marks,
  isToday,
  isSelected,
  onSelect,
}: {
  day: number;
  marks: CalendarMark[];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="flex flex-col items-center py-[5px]">
      <span
        className={cn(
          'flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13.5px] font-medium',
          isToday && 'bg-action font-bold text-white',
          !isToday && isSelected && 'bg-accent-soft font-bold text-accent-ink',
          !isToday && !isSelected && (marks.length ? 'text-ink' : 'text-ink-faint'),
        )}
      >
        {day}
      </span>

      {/* 점은 최대 세 개까지만. 그 이상은 줄이 흔들린다. */}
      <span className="mt-[3px] flex h-[7px] gap-[3px]">
        {marks.slice(0, 3).map((mark, i) => (
          <span
            key={i}
            className={cn('block h-1 w-1 rounded-full', kindDot(mark.kind))}
            aria-hidden
          />
        ))}
      </span>
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span className={cn('block h-[5px] w-[5px] rounded-full', className)} aria-hidden />
      {label}
    </span>
  );
}

const kindDot = (kind: CalendarMark['kind']) =>
  kind === 'due' ? 'bg-action' : kind === 'overdue' ? 'bg-danger' : 'bg-dot-mute';

const kindTone = (kind: CalendarMark['kind']) =>
  kind === 'due' ? 'text-action' : kind === 'overdue' ? 'text-danger' : 'text-ink-3';

function kindLabel(mark: CalendarMark): string {
  if (mark.kind === 'done') return '했어요';
  if (mark.kind === 'overdue') return `${mark.overdueDays}일 밀림`;
  return '예정';
}
