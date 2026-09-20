'use client';

import type { HomeFeed, Item } from '@lastly/contracts';
import { differenceInCalendarDays, parseISO } from 'date-fns';

import { nextDueAfter } from '@/lib/date';

/** 서버의 UPCOMING_WINDOW_DAYS 와 같은 값이어야 한다. */
const UPCOMING_WINDOW_DAYS = 14;

/**
 * 마지막으로 받은 홈 목록을 기기에 복사해 둔다.
 *
 * 연결이 끊긴 자리에서 앱을 열면 "목록을 못 가져왔어요" 만 뜬다. 그런데 이 앱은
 * 집 밖에서 문득 떠올라 여는 일이 많다 — 지하철, 엘리베이터, 지하 주차장.
 * 그때 적어도 무엇이 밀렸는지는 보여야 한다.
 *
 * 서버가 최종이다. 여기 있는 것은 사본이라, 서버에서 새로 받으면 그대로 덮어쓴다.
 */
const KEY = 'lastly.home-feed';

export function saveFeed(feed: HomeFeed) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), feed }));
  } catch {
    // 저장 공간이 없거나 막힌 브라우저. 캐시가 없을 뿐 앱은 그대로 돈다.
  }
}

export function loadFeed(): HomeFeed | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { feed: HomeFeed }).feed ?? null;
  } catch {
    return null;
  }
}

/** 사본을 언제 받았는지. 화면이 "언제 기준" 인지 말해주기 위한 것. */
export function loadFeedAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? ((JSON.parse(raw) as { at: number }).at ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * 연결이 끊긴 자리에서 남긴 기록을 사본에도 반영한다.
 *
 * 저장은 됐는데 목록이 그대로면 안 된 것처럼 보인다. 사용자는 올라갔는지
 * 아닌지를 알 필요가 없어야 한다 — 그건 우리 사정이다.
 *
 * 다음 예정일과 분류는 서버·DB 와 같은 규칙으로 계산한다(lib/date.ts, UPCOMING_WINDOW_DAYS).
 * 연결되면 서버가 계산한 값으로 덮어써진다.
 */
export function applyLocalLog(itemId: string, doneOn: string, today: string): HomeFeed | null {
  const feed = loadFeed();
  if (!feed) return null;

  const all = [...feed.due, ...feed.upcoming, ...feed.later];
  const target = all.find((i) => i.id === itemId);
  if (!target) return null;

  const nextDueOn = nextDueAfter(doneOn, target.cadence);
  const daysUntilDue = differenceInCalendarDays(parseISO(nextDueOn), parseISO(today));

  const moved: Item = {
    ...target,
    lastDoneOn: doneOn,
    nextDueOn,
    daysUntilDue,
    daysSinceLastDone: differenceInCalendarDays(parseISO(today), parseISO(doneOn)),
    logCount: target.logCount + 1,
    bucket: target.snoozedUntil ? 'later' : daysUntilDue <= 0 ? 'due' : daysUntilDue <= UPCOMING_WINDOW_DAYS ? 'upcoming' : 'later',
  };

  const rest = all.filter((i) => i.id !== itemId);
  const bucketOf = (b: Item['bucket']) => [...rest, moved].filter((i) => i.bucket === b);

  const updated: HomeFeed = {
    ...feed,
    due: bucketOf('due'),
    upcoming: bucketOf('upcoming'),
    later: bucketOf('later'),
    summary: { ...feed.summary, dueTodayCount: bucketOf('due').length },
  };

  saveFeed(updated);
  return updated;
}

export function clearFeed() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지우지 못해도 다음 저장이 덮어쓴다.
  }
}
