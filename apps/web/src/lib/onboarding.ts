/**
 * 온보딩을 한 번 본 표시.
 *
 * 로그인 전이라 서버에 저장할 곳이 없어 쿠키를 쓴다. 미들웨어가 이 값으로
 * 처음 온 사람과 이미 본 사람을 가른다.
 */
export const SEEN_ONBOARDING = 'lastly.seen-onboarding';

export function markOnboardingSeen(): void {
  document.cookie = `${SEEN_ONBOARDING}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
