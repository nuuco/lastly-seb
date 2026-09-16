/**
 * 배포 서버와 같은 시간대로 돌린다.
 *
 * 한국 시간대인 노트북에서만 테스트하면 날짜가 밀리는 버그를 잡지 못한다.
 * 실제로 그렇게 지나간 버그가 있었다 — 새벽 기록이 어제 날짜로 저장됐다.
 */
process.env.TZ = 'UTC';

/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts'],
};
