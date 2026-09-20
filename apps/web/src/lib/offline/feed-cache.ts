'use client';

import type { HomeFeed } from '@lastly/contracts';

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

export function clearFeed() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지우지 못해도 다음 저장이 덮어쓴다.
  }
}
