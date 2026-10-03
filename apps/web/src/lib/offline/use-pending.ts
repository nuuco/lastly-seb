'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '@/lib/api/client';
import { itemsApi } from '@/lib/api/items';
import { queryKeys } from '@/lib/api/query-keys';
import { listPending, removePending, type PendingCapture, type RawCapture } from './pending-captures';
import { useOnline } from './use-online';

/**
 * 다시 보내도 같은 답이 오는 거절. 지운 항목(404), 미래 날짜(400), 같은 이름 항목(409) 등.
 * 붙들고 있으면 뒤에 쌓인 기록까지 못 올라가므로 그 건만 버린다.
 */
const PERMANENT_REJECTIONS = new Set([400, 404, 409, 422]);

/**
 * 지금 올리는 중인지. 한 번에 한 바퀴만 돈다.
 * 개발 모드(StrictMode)는 effect 를 두 번 실행해 같은 기록이 두 번 올라갔다.
 * 연결이 끊겼다 이어지는 사이에도 앞 바퀴가 끝나기 전에 새 바퀴가 시작될 수 있다.
 */
let syncing = false;

/**
 * 연결이 끊긴 사이에 남긴 기록을 들고 있다가 연결되면 올린다.
 *
 * 이미 풀린 것(어느 항목에 언제)은 조용히 올린다. 무엇을 저장할지 이미 정해져
 * 있어서 물어볼 것이 없다. 못 푼 말만 화면에 남겨 사용자가 확인하게 한다.
 */
export function usePending(signedIn: boolean, step: string) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCapture[]>([]);
  /** 방금 올린 개수. 토스트로 알린 뒤 비운다. */
  const [justSynced, setJustSynced] = useState(0);

  const refresh = useCallback(() => setPending(listPending()), []);

  useEffect(() => {
    refresh();
  }, [refresh, online, step]);

  useEffect(() => {
    if (!online || !signedIn) return;

    // 사용자가 이미 확인한 것들. 물어볼 것이 없으니 조용히 올린다.
    const ready = listPending().filter((p) => p.kind === 'resolved' || p.kind === 'item');
    if (ready.length === 0 || syncing) return;
    syncing = true;

    // 화면이 사라져도 끝까지 올린다. 사라진 뒤의 setState 는 React 가 무시한다.
    void (async () => {
      let sent = 0;
      let dropped = 0;

      try {
        for (const entry of ready) {
          try {
            if (entry.kind === 'resolved') {
              await itemsApi.addLog(entry.itemId, { doneOn: entry.doneOn, note: null });
            } else if (entry.kind === 'item') {
              // 항목을 먼저 만들고 그 항목에 기록을 붙인다.
              const created = await itemsApi.create({
                name: entry.name,
                cadence: entry.cadence,
                cadenceSource: 'user',
                firstDoneOn: entry.doneOn,
              });
              if (created.lastDoneOn !== entry.doneOn) {
                await itemsApi.addLog(created.id, { doneOn: entry.doneOn, note: null });
              }
            }

            removePending(entry.id);
            sent += 1;
          } catch (err) {
            if (err instanceof ApiError && PERMANENT_REJECTIONS.has(err.status)) {
              console.warn('[offline] 서버가 거절한 기록을 버림', err.status, err.message);
              removePending(entry.id);
              dropped += 1;
              continue;
            }
            // 연결·인증·서버 사정. 다음에 연결될 때 다시 시도한다.
            break;
          }
        }
      } finally {
        syncing = false;
      }

      if (sent + dropped > 0) refresh();
      if (sent === 0) return;

      setJustSynced(sent);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    })();
  }, [online, signedIn, queryClient, refresh]);

  /** 서버에 물어봐야 하는 말들. 사용자가 확인 시트를 거쳐 저장한다. */
  const raw = pending.filter((p): p is RawCapture => p.kind === 'raw');

  const takeRaw = useCallback(() => {
    const next = raw[0];
    if (!next) return null;
    removePending(next.id);
    refresh();
    return next;
  }, [raw, refresh]);

  return {
    /** 아직 올리지 못한 전체 개수. */
    count: pending.length,
    raw,
    takeRaw,
    online,
    justSynced,
    dismissSynced: () => setJustSynced(0),
  };
}
