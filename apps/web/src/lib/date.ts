import type { CadenceRule, Item } from '@lastly/contracts';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "9월 6일 일요일" — 홈 상단. */
export function formatHeaderDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

/** "8월 25일 (화)" — 기록 목록. */
export function formatLogDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** "2026년 8월 25일 (화)" — 항목 상세의 마지막 수행일. */
export function formatFullDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getFullYear()}년 ${formatLogDate(iso)}`;
}

/** "9월 20일" — 다음 알림일. */
export function formatShortDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * D-n 배지. 밀린 항목은 "지남", 오늘은 "오늘".
 * 설계에서 D-2 / D-12 / D-70 형태로 쓰인다.
 */
export function formatDueBadge(daysUntilDue: number | null): string {
  if (daysUntilDue === null) return '—';
  // 밀린 항목은 D+n 이다 — 설계 05 의 "D+2". 말로 풀어 쓰면 D-n 과 줄이 안 맞는다.
  if (daysUntilDue < 0) return `D+${Math.abs(daysUntilDue)}`;
  if (daysUntilDue === 0) return '오늘';
  return `D-${daysUntilDue}`;
}

export const todayIso = () => format(new Date(), 'yyyy-MM-dd');

export const daysSince = (iso: string) => differenceInCalendarDays(new Date(), parseISO(iso));

/** "2주마다", "45일마다" — 서버의 CadenceService.describe와 같은 규칙. */
export function describeCadence(cadence: CadenceRule): string {
  const unit = { day: '일', week: '주', month: '달' }[cadence.unit];
  const base = `${cadence.interval}${unit}마다`;
  if (cadence.unit !== 'week' || cadence.weekdays.length === 0) return base;

  const names = ['일', '월', '화', '수', '목', '금', '토'];
  const days = [...cadence.weekdays].sort((a, b) => a - b).map((d) => `${names[d]}요일`);
  return `${base} ${days.join('·')}`;
}

/** 주기를 대략 며칠로 볼지. 진행 막대 계산에만 쓴다. */
const cadenceDays = (cadence: CadenceRule) =>
  cadence.interval * { day: 1, week: 7, month: 30 }[cadence.unit];

/**
 * 주기 대비 얼마나 지났는지 (0~100).
 * 설계 05의 진행 막대가 이 값을 폭으로 쓴다 — 12일 전 / 2주 주기 = 85%.
 */
export function cycleProgress(item: Item): number {
  const elapsed = item.daysSinceLastDone;
  if (elapsed === null) return 0;

  const total = cadenceDays(item.cadence);
  if (total <= 0) return 0;

  return Math.round(Math.min(100, Math.max(0, (elapsed / total) * 100)));
}

/** "2026-09" — 달력이 다루는 달의 키. */
export const formatMonth = (d: Date) => format(d, 'yyyy-MM');

/** "2026년 9월" — 달력 뷰의 머리말. */
export const formatYearMonth = (month: string) => format(parseISO(`${month}-01`), 'yyyy년 M월');
