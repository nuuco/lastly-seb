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

  it('쉬는 중이면 날짜와 상관없이 여유 있는 항목으로 내린다', () => {
    // 일주일만 쉬기로 해도 마찬가지다. 쉬기로 한 일이 "다가오는 항목" 에
    // D-7 로 남아 있으면 사용자는 자기가 누른 게 먹었는지 알 수 없다.
    expect(service.bucketFor(7, '2026-09-17')).toBe('later');
    expect(service.bucketFor(-3, '2026-09-17')).toBe('later');
    expect(service.bucketFor(0, '2026-09-17')).toBe('later');
    // 쉬지 않으면 원래대로.
    expect(service.bucketFor(7, null)).toBe('upcoming');
  });

  it('주기를 화면 문구로 옮긴다', () => {
    expect(service.describe(rule({ unit: 'week', interval: 2 }))).toBe('2주마다');
    expect(service.describe(rule({ weekdays: [6] }))).toBe('2주마다 토요일');
  });
});
