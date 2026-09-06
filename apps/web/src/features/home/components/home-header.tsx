import type { HomeSummary } from '@lastly/contracts';
import Link from 'next/link';

import { formatHeaderDate, formatShortDate } from '@/lib/date';

/** 설계 05 상단 — 날짜·백업 상태·헤드라인, 오른쪽에 설정. */
export function HomeHeader({
  summary,
  today,
  empty,
}: {
  summary: HomeSummary;
  today: Date;
  /** 설계 04 — 기록이 없으면 인사만 건넨다. */
  empty?: boolean;
}) {
  return (
    <header className="safe-top flex items-start justify-between px-1 pt-2">
      <div className="min-w-0">
        <div className="flex items-center gap-[7px] text-13 text-ink-3">
          <span className="truncate">
            {formatHeaderDate(today)}
            {!empty && summary.greetingName ? ` · ${summary.greetingName}님` : ''}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-semibold text-sage-ink">
            <span className="block h-[5px] w-[5px] rounded-full bg-sage" />
            백업됨
          </span>
        </div>

        {empty ? (
          <h1 className="mt-1 text-[22px] font-bold tracking-[-.03em] text-ink">
            안녕하세요{summary.greetingName ? `, ${summary.greetingName}님` : ''}
          </h1>
        ) : (
          <h1 className="mt-[5px] text-23 font-bold tracking-t35 text-ink">{headline(summary)}</h1>
        )}
      </div>

      <Link href="/settings" aria-label="설정" className="shrink-0 pl-3 pt-1">
        <GearIcon />
      </Link>
    </header>
  );
}

function headline(summary: HomeSummary): string {
  if (summary.overdueCount > 0) return `밀린 가사 ${summary.overdueCount}개가 있어요`;
  if (summary.dueTodayCount > 0) return `오늘 챙길 가사 ${summary.dueTodayCount}개가 있어요`;
  return '오늘 챙길 가사는 없어요';
}

/** "이번 주 3개 완료 · 평균 주기 18일 · 밀린 항목 없음" */
export function HomeSummaryLine({ summary }: { summary: HomeSummary }) {
  const parts = [
    `이번 주 ${summary.completedThisWeek}개 완료`,
    summary.averageIntervalDays ? `평균 주기 ${summary.averageIntervalDays}일` : null,
    summary.overdueCount > 0 ? `밀린 항목 ${summary.overdueCount}개` : '밀린 항목 없음',
  ].filter(Boolean);

  return <p className="mt-2.5 px-1.5 text-12.5 text-ink-3">{parts.join(' · ')}</p>;
}

/** 오늘 할 게 없을 때 (설계 05-B). */
export function AllDoneCard({ summary }: { summary: HomeSummary }) {
  return (
    <div className="mt-3 rounded-hero border border-line-2 bg-hero px-5 py-6 text-center shadow-hero">
      <p className="text-17 font-bold tracking-t35 text-ink">오늘 할 건 다 하셨어요</p>
      {summary.nextUp ? (
        <p className="mt-2 text-13 text-ink-3">
          다음은 {formatShortDate(summary.nextUp.dueOn)} · {summary.nextUp.name}예요
        </p>
      ) : null}
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink-2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.11a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.11A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.72h.08A1.6 1.6 0 0 0 10 3.25V3a2 2 0 1 1 4 0v.11a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.28 9v.08a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.11a1.6 1.6 0 0 0-1.47.97Z" />
    </svg>
  );
}
