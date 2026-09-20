'use client';

/**
 * 연결이 끊긴 사이에 남긴 기록을 모아 둔다.
 *
 * 두 가지가 섞여 있다.
 *
 *   resolved  이미 있는 항목에 붙일 기록. 이름이 정확히 맞아 확인할 것이 없다.
 *   item      사용자가 확인 시트에서 이름과 주기를 정한 새 항목.
 *   raw       규칙으로 이름조차 못 뽑은 문장. 연결되면 서버가 해석한다.
 *
 * 확인 없이 새 항목을 만들지는 않는다. 이름이 틀려도 손댈 기회가 없어진다.
 */
import type { CadenceRule } from '@lastly/contracts';

const KEY = 'lastly.pending-captures';

interface Base {
  id: string;
  at: number;
}

export interface ResolvedCapture extends Base {
  kind: 'resolved';
  itemId: string;
  itemName: string;
  doneOn: string;
}

export interface NewItemCapture extends Base {
  kind: 'item';
  name: string;
  cadence: CadenceRule;
  doneOn: string;
}

export interface RawCapture extends Base {
  kind: 'raw';
  text: string;
  mode: 'voice' | 'text';
}

export type PendingCapture = ResolvedCapture | NewItemCapture | RawCapture;

function read(): PendingCapture[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    // 예전 형식(kind 없음)이 남아 있을 수 있다. 말만 적힌 것으로 본다.
    const list = JSON.parse(raw) as Array<Partial<RawCapture> & Base>;
    return list.map((p) => (p.kind ? (p as PendingCapture) : ({ ...p, kind: 'raw' } as RawCapture)));
  } catch {
    return [];
  }
}

function write(list: PendingCapture[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장 공간이 없는 브라우저. 이번 것은 잃지만 앱은 계속 돈다.
  }
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function listPending(): PendingCapture[] {
  return read();
}

export function addResolved(itemId: string, itemName: string, doneOn: string): ResolvedCapture {
  const item: ResolvedCapture = { id: newId(), at: Date.now(), kind: 'resolved', itemId, itemName, doneOn };
  write([...read(), item]);
  return item;
}

export function addNewItem(name: string, cadence: CadenceRule, doneOn: string): NewItemCapture {
  const item: NewItemCapture = { id: newId(), at: Date.now(), kind: 'item', name, cadence, doneOn };
  write([...read(), item]);
  return item;
}

export function addRaw(text: string, mode: 'voice' | 'text'): RawCapture {
  const item: RawCapture = { id: newId(), at: Date.now(), kind: 'raw', text, mode };
  write([...read(), item]);
  return item;
}

export function removePending(id: string) {
  write(read().filter((p) => p.id !== id));
}
