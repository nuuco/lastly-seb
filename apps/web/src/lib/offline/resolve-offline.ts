'use client';

import type { HomeFeed, InterpretResult, Item } from '@lastly/contracts';
import { readUtterance } from '@lastly/parser';

import { nextDueAfter, todayIso } from '@/lib/date';
import { applyLocalLog, loadFeed } from './feed-cache';
import { addRaw, addResolved } from './pending-captures';

/** 이름 비교용. 띄어쓰기와 대소문자를 지운다 — 서버의 squash 와 같은 규칙이다. */
const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * 글자가 얼마나 겹치는지. 0~1.
 *
 * 서버는 DB 의 트라이그램과 AI 로 "같은 일인지" 를 판단하지만, 연결이 끊긴 자리에서는
 * 둘 다 쓸 수 없다. 대신 글자 겹침으로 후보만 뽑아 사용자에게 고르게 한다 —
 * 우리가 단정하지 않으면 "이불 빨래" 옆에 "침구 빨래" 가 따로 생기는 일을 막을 수 있다.
 */
function similarity(a: string, b: string): number {
  const of = (s: string) => new Set(squash(s).split(''));
  const x = of(a);
  const y = of(b);
  const shared = [...x].filter((c) => y.has(c)).length;
  return (2 * shared) / (x.size + y.size);
}

/** 이 값을 넘으면 "혹시 이건가요?" 하고 물어볼 만하다고 본다. */
const CANDIDATE_FLOOR = 0.6;
/** 주기를 말하지 않은 새 항목에 임시로 붙이는 값. 사용자가 시트에서 고른다. */
const DEFAULT_CADENCE = { unit: 'week', interval: 2, weekdays: [], notifyTimeLocal: null } as const;

export type OfflineOutcome =
  /** 이름이 정확히 맞아 그대로 저장했다. 화면에 물어볼 것이 없다. */
  | { kind: 'saved'; itemName: string; feed: HomeFeed | null }
  /** 확인 시트를 띄워야 한다. 서버 응답과 같은 모양으로 만들어 둔다. */
  | { kind: 'ask'; result: InterpretResult }
  /** 규칙으로 이름조차 못 뽑았다. 말만 적어 두고 연결되면 서버에 맡긴다. */
  | { kind: 'queued' };

/**
 * 연결이 끊긴 자리에서 한 말을 기기에서 푼다.
 *
 * 규칙 파서는 순수 계산이라 서버가 없어도 돌고, 저장해 둔 목록과 맞춰보면
 * 무엇을 저장할지까지 정할 수 있다. 평가셋에서 규칙만으로 끝나는 문장이 열에 일곱이 넘는다.
 */
export function resolveOffline(text: string, mode: 'voice' | 'text'): OfflineOutcome {
  const today = todayIso();
  const facts = readUtterance(text, new Date(`${today}T00:00:00`));
  const feed = loadFeed();
  const items: Item[] = feed ? [...feed.due, ...feed.upcoming, ...feed.later] : [];

  if (!facts.name) {
    addRaw(text, mode);
    return { kind: 'queued' };
  }

  const doneOn = new Date(Date.now() - facts.daysAgo * 86_400_000).toISOString().slice(0, 10);

  // 이름이 그대로 있으면 물어볼 것이 없다.
  const exact = items.find((i) => squash(i.name) === squash(facts.name!));
  if (exact) {
    addResolved(exact.id, exact.name, doneOn);
    return { kind: 'saved', itemName: exact.name, feed: applyLocalLog(exact.id, doneOn, today) };
  }

  // 비슷한 이름이 있으면 후보로 보여 준다. 단정하면 같은 일이 두 개가 된다.
  const candidates = items
    .map((i) => ({
      itemId: i.id,
      name: i.name,
      similarity: similarity(facts.name!, i.name),
      lastDoneOn: i.lastDoneOn,
      daysSinceLastDone: i.daysSinceLastDone,
    }))
    .filter((c) => c.similarity >= CANDIDATE_FLOOR)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

  const rule = facts.statedCadenceDays
    ? toRule(facts.statedCadenceDays)
    : { ...DEFAULT_CADENCE, weekdays: [] as number[] };

  return {
    kind: 'ask',
    result: {
      transcript: text,
      outcome: 'new_item',
      normalizedName: facts.name,
      doneOn,
      matchedItemId: null,
      candidates,
      cadence: {
        rule,
        source: facts.statedCadenceDays ? 'user' : 'default',
        confidence: facts.statedCadenceDays ? 1 : 0.3,
        rationale: facts.statedCadenceDays
          ? '말씀하신 주기로 맞춰뒀어요.'
          : '주기를 눌러 정해주세요.',
        nextDueOn: nextDueAfter(doneOn, rule),
      },
      confidence: 0.7,
      // 연결이 끊겨 서버 도움 없이 세운 결과라는 표시.
      degraded: true,
      answer: null,
      // 서버가 서명한 표가 없다. 저장은 기기에 쌓았다가 연결될 때 올린다.
      draftToken: 'offline',
    },
  };
}

/** 일수를 주기 규칙으로. 서버 CadenceService.toRule 과 같은 기준이다. */
function toRule(days: number) {
  if (days % 30 === 0) return { unit: 'month' as const, interval: days / 30, weekdays: [], notifyTimeLocal: null };
  if (days % 7 === 0) return { unit: 'week' as const, interval: days / 7, weekdays: [], notifyTimeLocal: null };
  return { unit: 'day' as const, interval: days, weekdays: [], notifyTimeLocal: null };
}
