'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { itemsApi } from '@/lib/api/items';
import { queryKeys } from '@/lib/api/query-keys';
import { listPending, removePending, type PendingCapture, type RawCapture } from './pending-captures';
import { useOnline } from './use-online';

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

    const resolved = listPending().filter((p) => p.kind === 'resolved');
    if (resolved.length === 0) return;

    let alive = true;

    void (async () => {
      let sent = 0;

      for (const item of resolved) {
        if (item.kind !== 'resolved') continue;
        try {
          await itemsApi.addLog(item.itemId, { doneOn: item.doneOn, note: null });
          removePending(item.id);
          sent += 1;
        } catch {
          // 아직 못 올렸다. 다음에 연결될 때 다시 시도한다.
          break;
        }
      }

      if (!alive || sent === 0) return;

      setJustSynced(sent);
      refresh();
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    })();

    return () => {
      alive = false;
    };
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
