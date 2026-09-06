import type { CadenceRule } from '@lastly/contracts';

import { CadenceService } from './cadence.service';

const rule = (over: Partial<CadenceRule> = {}): CadenceRule => ({
  unit: 'week',
  interval: 2,
  weekdays: [],
  notifyTimeLocal: null,
  ...over,
});

describe('CadenceService', () => {
  const service = new CadenceService();

  it('주 단위 주기를 더한다', () => {
    expect(service.nextDueOn('2026-09-06', rule({ unit: 'week', interval: 2 }))).toBe('2026-09-20');
  });

  it('일 단위 주기를 더한다', () => {
    expect(service.nextDueOn('2026-07-23', rule({ unit: 'day', interval: 45 }))).toBe('2026-09-06');
  });

  it('월 단위 주기를 더한다', () => {
    expect(service.nextDueOn('2026-09-06', rule({ unit: 'month', interval: 3 }))).toBe('2026-12-06');
  });

  it('요일이 지정되면 그 요일로 스냅한다', () => {
    // 2026-09-06(일) + 2주 = 09-20(일) → 다음 토요일인 09-26
    expect(service.nextDueOn('2026-09-06', rule({ weekdays: [6] }))).toBe('2026-09-26');
  });

  it('기록이 없으면 예정일도 없다', () => {
    expect(service.nextDueOn(null, rule())).toBeNull();
  });

  it('밀린 항목과 오늘 항목을 due로 묶는다', () => {
    expect(service.bucketFor(-3)).toBe('due');
    expect(service.bucketFor(0)).toBe('due');
    expect(service.bucketFor(2)).toBe('upcoming');
    expect(service.bucketFor(70)).toBe('later');
  });

  it('주기를 화면 문구로 옮긴다', () => {
    expect(service.describe(rule({ unit: 'week', interval: 2 }))).toBe('2주마다');
    expect(service.describe(rule({ weekdays: [6] }))).toBe('2주마다 토요일');
  });
});
