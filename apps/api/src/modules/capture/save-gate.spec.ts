import { shouldRecordLog } from './save-gate';

describe('저장 게이트', () => {
  it.each([
    ['오늘 이불 빨았어', true],
    ['베개만 빨았어', true],
    ['내일 이불 빨 거야', false],
    ['오늘 이불 못 빨았어', false],
    ['필터 아직 안 갈았어', false],
    ['청소는 내일로 미루고 설거지만 했어', true],
  ])('%s → %s', (text, want) => {
    expect(shouldRecordLog(text)).toBe(want);
  });
});
