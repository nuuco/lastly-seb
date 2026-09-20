'use client';

/**
 * 연결이 끊긴 사이에 말한 문장을 모아 둔다.
 *
 * 오프라인에서는 해석을 못 한다. 이름을 고르고 주기를 정하는 일이 서버에 있기 때문이다.
 * 그렇다고 입력을 버리면 안 된다 — 이 앱에서 제일 중요한 것이 방금 한 말을 잃지 않는 것이다.
 * 그래서 말만 적어 두고, 연결되면 평소대로 해석해서 확인 시트를 띄운다.
 *
 * 저장하지 않고 미리 만들어 두지는 않는다. 확인 없이 들어간 항목은 나중에
 * 지우는 수고가 되고, 이름이 틀려도 사용자가 손댈 기회가 없다.
 */
const KEY = 'lastly.pending-captures';

export interface PendingCapture {
  id: string;
  text: string;
  mode: 'voice' | 'text';
  at: number;
}

function read(): PendingCapture[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingCapture[]) : [];
  } catch {
    return [];
  }
}

function write(list: PendingCapture[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장 공간이 없는 브라우저. 이번 문장은 잃지만 앱은 계속 돈다.
  }
}

export function listPending(): PendingCapture[] {
  return read();
}

export function addPending(text: string, mode: 'voice' | 'text'): PendingCapture {
  const item: PendingCapture = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    mode,
    at: Date.now(),
  };

  write([...read(), item]);
  return item;
}

export function removePending(id: string) {
  write(read().filter((p) => p.id !== id));
}
