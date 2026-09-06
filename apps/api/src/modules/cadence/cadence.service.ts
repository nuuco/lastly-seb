import { Injectable } from '@nestjs/common';
import type { CadenceRule, IsoDate, ItemBucket } from '@lastly/contracts';
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns';

/** 홈 화면 섹션 분기 기준. */
const UPCOMING_WINDOW_DAYS = 14;

/**
 * 주기 계산의 단일 소스.
 * supabase/migrations의 calc_next_due()와 규칙이 동일해야 한다.
 * 둘 중 하나를 고치면 반드시 같이 고칠 것.
 */
@Injectable()
export class CadenceService {
  nextDueOn(lastDoneOn: IsoDate | null, rule: CadenceRule): IsoDate | null {
    if (!lastDoneOn) return null;

    const from = parseISO(lastDoneOn);
    const base =
      rule.unit === 'day'
        ? addDays(from, rule.interval)
        : rule.unit === 'week'
          ? addWeeks(from, rule.interval)
          : addMonths(from, rule.interval);

    if (rule.unit !== 'week' || rule.weekdays.length === 0) {
      return format(base, 'yyyy-MM-dd');
    }

    // 지정 요일 중 base 이후(당일 포함) 가장 이른 날로 스냅한다.
    const baseDow = getDay(base);
    const bestDelta = Math.min(...rule.weekdays.map((d) => (d - baseDow + 7) % 7));
    return format(addDays(base, bestDelta), 'yyyy-MM-dd');
  }

  daysUntil(dueOn: IsoDate | null, today: Date): number | null {
    return dueOn ? differenceInCalendarDays(parseISO(dueOn), today) : null;
  }

  daysSince(lastDoneOn: IsoDate | null, today: Date): number | null {
    return lastDoneOn ? differenceInCalendarDays(today, parseISO(lastDoneOn)) : null;
  }

  /** 밀렸거나 오늘이면 due, 2주 안이면 upcoming, 나머지는 later. */
  bucketFor(daysUntilDue: number | null): ItemBucket {
    if (daysUntilDue === null) return 'due';
    if (daysUntilDue <= 0) return 'due';
    return daysUntilDue <= UPCOMING_WINDOW_DAYS ? 'upcoming' : 'later';
  }

  /** "2주마다", "45일마다" 처럼 화면에 그대로 쓰는 문자열. */
  describe(rule: CadenceRule): string {
    const unitLabel = { day: '일', week: '주', month: '달' }[rule.unit];
    const base = `${rule.interval}${unitLabel}마다`;
    if (rule.unit !== 'week' || rule.weekdays.length === 0) return base;

    const names = ['일', '월', '화', '수', '목', '금', '토'];
    const days = [...rule.weekdays].sort((a, b) => a - b).map((d) => `${names[d]}요일`);
    return `${base} ${days.join('·')}`;
  }

  /** 주기를 일수로 환산 — 개인 평균과 비교할 때 쓴다. */
  toApproxDays(rule: CadenceRule): number {
    const perUnit = { day: 1, week: 7, month: 30 }[rule.unit];
    return rule.interval * perUnit;
  }
}
