import { assertNotFuture } from './logs.service';

describe('assertNotFuture', () => {
  const today = new Date('2026-09-06T12:00:00');

  it('오늘과 지난 날짜는 통과한다', () => {
    expect(() => assertNotFuture('2026-09-06', today)).not.toThrow();
    expect(() => assertNotFuture('2025-01-01', today)).not.toThrow();
  });

  it('오늘 이후 날짜는 거절한다', () => {
    expect(() => assertNotFuture('2026-09-07', today)).toThrow('오늘 이후 날짜로는 기록할 수 없어요.');
  });
});
