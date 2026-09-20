'use client';

import { readUtterance } from '@lastly/parser';

import { todayIso } from '@/lib/date';
import { loadFeed } from './feed-cache';
import { addRaw, addResolved } from './pending-captures';

/** 이름 비교용. 띄어쓰기와 대소문자를 지운다 — 서버의 squash 와 같은 규칙이다. */
const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * 연결이 끊긴 자리에서 한 말을 기기에서 풀어 본다.
 *
 * 규칙 파서는 순수 계산이라 서버가 없어도 돈다. 저장해 둔 목록과 맞춰보면
 * "이미 있는 항목에 오늘 기록 하나" 까지는 기기 혼자 정할 수 있다.
 * 평가셋에서 규칙만으로 끝나는 문장이 열에 일곱이 넘는다.
 *
 * 새 항목은 여기서 만들지 않는다. 주기를 모르고, 이름이 틀려도 사용자가
 * 확인할 기회가 없기 때문이다. 그런 말은 그대로 적어 두었다가 연결되면 묻는다.
 *
 * @returns 화면에 띄울 안내 문구
 */
export function resolveOffline(text: string, mode: 'voice' | 'text'): string {
  const today = todayIso();
  const facts = readUtterance(text, new Date(`${today}T00:00:00`));
  const feed = loadFeed();

  if (facts.name && feed) {
    const target = squash(facts.name);
    const items = [...feed.due, ...feed.upcoming, ...feed.later];
    const matched = items.find((i) => squash(i.name) === target);

    if (matched) {
      const doneOn = new Date(Date.now() - facts.daysAgo * 86_400_000).toISOString().slice(0, 10);
      addResolved(matched.id, matched.name, doneOn);
      return `${matched.name} 기록해뒀어요 · 연결되면 올릴게요`;
    }
  }

  addRaw(text, mode);
  return '연결이 끊겨 적어만 뒀어요 · 연결되면 정리할게요';
}
