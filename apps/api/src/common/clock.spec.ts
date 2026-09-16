import { format } from 'date-fns';

import { appToday } from './clock';

/**
 * 배포 서버는 UTC 로 돈다. 이 테스트는 그때 날짜가 밀리지 않는지 본다.
 *
 * 실제로 밀렸던 버그다 — 한국 자정부터 아침 9시 사이에 남긴 기록이
 * 전부 어제 날짜로 저장됐다. 기기 시계와 무관하게 재려고 순간을 못박아 넣는다.
 */
describe('appToday', () => {
  const asDate = (instant: string) => format(appToday(new Date(instant)), 'yyyy-MM-dd');

  it('UTC 로는 아직 어제인 한국 새벽을 오늘로 본다', () => {
    // 한국 2026-09-17 02:04 = UTC 2026-09-16 17:04
    expect(asDate('2026-09-16T17:04:00Z')).toBe('2026-09-17');
  });

  it('한국 자정 직후', () => {
    expect(asDate('2026-09-16T15:00:00Z')).toBe('2026-09-17');
  });

  it('한국 자정 직전은 아직 어제', () => {
    expect(asDate('2026-09-16T14:59:00Z')).toBe('2026-09-16');
  });

  it('낮 시간에는 UTC 와 같은 날짜', () => {
    expect(asDate('2026-09-17T05:00:00Z')).toBe('2026-09-17');
  });

  it('시간대를 지정하면 그 시간대로 본다', () => {
    const utc = format(appToday(new Date('2026-09-16T17:04:00Z'), 'UTC'), 'yyyy-MM-dd');
    expect(utc).toBe('2026-09-16');
  });
});
