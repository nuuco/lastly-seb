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
    <header className="safe-top px-1 pt-2">
      {/* 첫 줄은 날짜와 이름. 작고 흐리게 두어 아래 헤드라인이 먼저 읽히게 한다. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-13 text-ink-3">
          {formatHeaderDate(today)}
          {!empty && summary.greetingName ? ` · ${summary.greetingName}님` : ''}
        </div>

        <Link href="/settings" aria-label="설정" className="shrink-0">
          <GearIcon />
        </Link>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        {empty ? (
          <h1 className="min-w-0 text-[22px] font-bold tracking-t3 text-ink">
            안녕하세요{summary.greetingName ? `, ${summary.greetingName}님` : ''}
          </h1>
        ) : (
          <h1 className="min-w-0 text-23 font-bold tracking-t35 text-ink">{headline(summary)}</h1>
        )}
      </div>
    </header>
  );
}

/**
 * 설계 05 는 "오늘 챙길 가사 2개" 처럼 셈만 말한다.
 *
 * dueTodayCount 는 이미 밀린 항목까지 세고 있다(서버의 due 버킷 크기 그대로).
 * 여기에 overdueCount 를 더하면 밀린 것이 두 번 세어져 카드 수와 어긋난다.
 */
function headline(summary: HomeSummary): string {
  return summary.dueTodayCount > 0
    ? `오늘 챙길 가사 ${summary.dueTodayCount}개`
    : '오늘 챙길 가사가 없어요';
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
