import { Injectable } from '@nestjs/common';
import type { CadenceRule, CadenceSource, IsoDate, ItemBucket } from '@lastly/contracts';
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

  /**
   * 밀렸거나 오늘이면 due, 2주 안이면 upcoming, 나머지는 later.
   *
   * 쉬는 중이면 날짜와 무관하게 later 다. 일주일만 쉬기로 해도 마찬가지다.
   * 쉬기로 한 일이 "다가오는 항목" 에 D-7 로 남아 있으면 쉬는 것처럼 보이지 않고,
   * 사용자는 자기가 누른 게 먹었는지 알 수 없다.
   */
  bucketFor(daysUntilDue: number | null, snoozedUntil: IsoDate | null = null): ItemBucket {
    if (snoozedUntil) return 'later';
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

  /**
   * 일수를 사람이 세는 단위로 옮긴다. apps/ai 의 _to_unit 과 같은 규칙이다.
   *
   * 45일은 45일로 두고 216일은 7달로 바꾼다. 오차가 8% 안쪽일 때만 큰 단위로
   * 올린다. "216일마다" 는 아무도 그렇게 세지 않고, 45일을 1.5달로 만들면
   * 원래 리듬이 뭉개진다.
   */
  toRule(days: number): Omit<CadenceRule, 'notifyTimeLocal'> {
    const clamped = Math.max(1, Math.min(730, Math.round(days)));

    if (clamped >= 28) {
      const months = Math.round(clamped / 30);
      const tolerance = Math.max(2, clamped * 0.08);
      if (months >= 1 && Math.abs(clamped - months * 30) <= tolerance) {
        return { unit: 'month', interval: Math.min(24, months), weekdays: [] };
      }
      return { unit: 'day', interval: clamped, weekdays: [] };
    }

    if (clamped >= 7 && clamped % 7 === 0) {
      return { unit: 'week', interval: clamped / 7, weekdays: [] };
    }

    return { unit: 'day', interval: clamped, weekdays: [] };
  }

  /** 주기를 일수로 환산 — 개인 평균과 비교할 때 쓴다. */
  toApproxDays(rule: CadenceRule): number {
    const perUnit = { day: 1, week: 7, month: 30 }[rule.unit];
    return rule.interval * perUnit;
  }

  /**
   * 실제로 며칠마다 했는지. 간격의 중앙값을 쓴다.
   *
   * 평균이 아닌 이유는 한 번 오래 건너뛴 기록이 전체를 밀어버리기 때문이다.
   * 두 달 여행을 다녀온 한 번이 2주 주기를 3주로 만들면 안 된다.
   * (items.average_interval_days 는 평균이라 화면에 보여주는 용도로만 쓴다.)
   */
  observedInterval(doneOn: IsoDate[]): number | null {
    if (doneOn.length < OBSERVED_MIN_LOGS) return null;

    const days = [...new Set(doneOn)].sort().map((d) => differenceInCalendarDays(parseISO(d), EPOCH));
    const gaps: number[] = [];
    for (let i = 1; i < days.length; i += 1) {
      const gap = days[i]! - days[i - 1]!;
      if (gap > 0) gaps.push(gap);
    }

    if (gaps.length < OBSERVED_MIN_LOGS - 1) return null;
    return median(gaps);
  }

  /**
   * 지금 주기를 실제 리듬에 맞게 고치자고 제안할지.
   *
   * 차이가 작으면 말하지 않는다. 2주 주기를 15일마다 하는 걸 두고
   * 고치라고 하면 잔소리가 된다. 사용자가 직접 정한 주기는 건드리지 않는다.
   */
  driftSuggestion(
    rule: CadenceRule,
    source: CadenceSource,
    doneOn: IsoDate[],
  ): { days: number; rule: Omit<CadenceRule, 'notifyTimeLocal'> } | null {
    if (source === 'user') return null;

    const observed = this.observedInterval(doneOn);
    if (observed === null) return null;

    const current = this.toApproxDays(rule);
    const ratio = Math.abs(observed - current) / current;
    if (ratio < DRIFT_THRESHOLD) return null;

    const next = this.toRule(observed);
    // 단위가 달라도 같은 길이면 제안할 것이 없다. "14일" 과 "2주" 는 같은 말이다.
    if (this.toApproxDays({ ...next, notifyTimeLocal: null }) === current) return null;

    return { days: Math.round(observed), rule: next };
  }
}

/** 간격을 세려면 기록이 이만큼은 있어야 한다. */
const OBSERVED_MIN_LOGS = 4;

/** 실제 리듬이 이 비율 이상 어긋났을 때만 말한다. */
const DRIFT_THRESHOLD = 0.3;

/** 날짜를 일수로 바꾸는 기준점. 값 자체는 의미가 없고 차이만 쓴다. */
const EPOCH = new Date(2000, 0, 1);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
