import { toZonedTime } from 'date-fns-tz';

/**
 * "오늘" 을 서버 시계가 아니라 사용자가 사는 시간대로 잡는다.
 *
 * 배포 서버는 UTC 로 돈다. 한국은 UTC+9 라서 서버 시계를 그대로 쓰면
 * 자정부터 아침 9시까지 아홉 시간 동안 날짜가 하루 어긋난다 —
 * 아침에 남긴 기록이 어제 한 일이 되고, 오늘 할 일이 내일로 밀려 보인다.
 *
 * 알림(NotificationsService) 은 이미 profiles.timezone 을 읽어 시간대를 맞춘다.
 * 나머지 경로는 요청마다 프로필을 읽지 않으므로 앱 기본 시간대를 쓴다.
 * 해외 사용자를 받게 되면 이 함수의 인자로 사용자 시간대를 넘기면 된다.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Seoul';

/**
 * 그 시간대의 지금. 날짜 부분만 쓰는 곳에서 부른다.
 *
 * 돌려주는 Date 는 시간대가 옮겨진 값이라 getDate()·format() 같은
 * 지역 시간 기준 함수에 그대로 넣으면 그 시간대의 날짜가 나온다.
 */
export function appToday(now: Date = new Date(), timezone: string = APP_TIMEZONE): Date {
  return toZonedTime(now, timezone);
}
