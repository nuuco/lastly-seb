'use client';

/**
 * 연결이 끊긴 사이에 남긴 기록을 모아 둔다.
 *
 * 두 가지가 섞여 있다.
 *
 *   resolved  이미 있는 항목에 붙일 기록. 규칙 파서가 기기에서 알아냈다.
 *             연결되면 조용히 올라간다 — 무엇을 저장할지 이미 정해져 있다.
 *   raw       규칙으로 못 푼 문장. 서버가 해석해야 하므로 말만 적어 둔다.
 *             연결되면 평소의 확인 시트를 거쳐 저장한다.
 *
 * 확인 없이 새 항목을 만들지는 않는다. 이름이 틀려도 손댈 기회가 없어진다.
 */
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

export interface RawCapture extends Base {
  kind: 'raw';
  text: string;
  mode: 'voice' | 'text';
}

export type PendingCapture = ResolvedCapture | RawCapture;

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

export function addRaw(text: string, mode: 'voice' | 'text'): RawCapture {
  const item: RawCapture = { id: newId(), at: Date.now(), kind: 'raw', text, mode };
  write([...read(), item]);
  return item;
}

export function removePending(id: string) {
  write(read().filter((p) => p.id !== id));
}
