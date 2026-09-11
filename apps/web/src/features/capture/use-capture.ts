'use client';

import type { CadenceRule, CommitResult, InterpretResult } from '@lastly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { captureApi } from '@/lib/api/capture';
import { itemsApi } from '@/lib/api/items';
import { todayIso } from '@/lib/date';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * 입력 → 해석 → 확인 → 저장의 한 사이클을 담는다.
 *
 * step은 서버가 내려준 outcome에서 파생된다. 프론트가 직접 판단하지 않는다.
 *   matched_existing → confirm (화면 08)
 *   new_item         → confirm (화면 09)
 *   ambiguous        → disambiguate (07 재확인 시트)
 *   unrecognized     → retry (07 재확인 시트)
 */
export type CaptureStep =
  | 'idle'
  | 'interpreting'
  | 'confirm'
  | 'disambiguate'
  | 'retry'
  /** 07-C — 물어본 것에 답만 하고 끝난다. 아무것도 기록하지 않는다. */
  | 'answered';

export function useCapture({ onInterpreted }: { onInterpreted?: () => void } = {}) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<CaptureStep>('idle');
  const [result, setResult] = useState<InterpretResult | null>(null);
  /** 확인 시트에서 사용자가 주기를 바꿨다면 그 값. 없으면 서버 제안을 그대로 쓴다. */
  const [cadenceOverride, setCadenceOverride] = useState<CadenceRule | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  /** 마지막으로 보낸 입력이 말이었는지 글이었는지. 재시도 화면의 문구가 갈린다. */
  const [lastMode, setLastMode] = useState<'voice' | 'text'>('text');
  /** 해석을 건너뛰고 그대로 남긴 항목의 이름. */
  const [rawSaved, setRawSaved] = useState<string | null>(null);
  /** 기다림을 포기했는지. 늦게 도착한 해석 결과를 버리는 기준이다. */
  const abandoned = useRef(false);

  const interpret = useMutation({
    mutationFn: (input: { text: string; mode: 'voice' | 'text'; asrConfidence?: number }) =>
      captureApi.interpret(input),
    onMutate: (input) => {
      abandoned.current = false;
      setLastMode(input.mode);
      setStep('interpreting');
    },
    onSuccess: (data) => {
      // 기다리다 그냥 남겼으면 뒤늦게 온 해석 결과로 시트를 열지 않는다.
      if (abandoned.current) return;
      setResult(data);
      setCadenceOverride(null);
      setStep(stepForOutcome(data));
      // 결과가 나온 뒤에야 입력창을 비운다 — 기다리는 동안 무엇을 보냈는지 보여야 한다.
      onInterpreted?.();
    },
    onError: () => {
      if (abandoned.current) return;
      setStep('retry');
    },
  });

  const commit = useMutation({
    mutationFn: async (input: {
      itemId?: string;
      newItemName?: string;
      note?: string | null;
    }) => {
      if (!result) throw new Error('해석 결과가 없습니다.');

      /**
       * 새 항목에는 화면에 보여준 주기를 그대로 실어 보낸다.
       *
       * 사용자가 주기 시트를 열어 고친 경우에만 보내고 있어서, "한달에 한번" 을
       * 확인하고 그냥 저장하면 서버가 기본값 2주로 만들었다.
       *
       * 기존 항목에는 고친 값만 보낸다. 보여준 값을 되돌려 보내면 원래 주기가
       * 사용자 지정으로 덮여 다음 제안에 영향을 준다.
       */
      const isNew = Boolean(input.newItemName);
      const cadence = cadenceOverride ?? (isNew ? result.cadence?.rule : undefined);

      return captureApi.commit({
        draftToken: result.draftToken,
        itemId: input.itemId,
        newItemName: input.newItemName,
        doneOn: result.doneOn,
        cadence: cadence ?? undefined,
        note: input.note ?? null,
      });
    },
    onSuccess: async (data) => {
      setCommitted(data);
      setStep('idle');
      setResult(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });

  /** 재확인 시트에서 후보를 골랐을 때 — 바로 저장으로 넘어간다. */
  const chooseCandidate = useCallback(
    (itemId: string) => commit.mutate({ itemId }),
    [commit],
  );

  /** 재확인 시트에서 "새 항목으로 만들기". 이름은 원문을 그대로 쓴다. */
  const createAsNew = useCallback(
    (name: string) => commit.mutate({ newItemName: name }),
    [commit],
  );

  /**
   * 해석을 기다리지 않고 적은 그대로 남긴다.
   *
   * 잠든 AI 를 깨우는 20초 동안 사용자는 아무것도 못 한다. 방금 한 일을
   * 남기려던 것뿐인데 서버 사정으로 붙잡아 둘 이유가 없다.
   * 해석을 거치지 않으므로 주기는 기본값으로 두고, 나중에 고치면 된다.
   */
  const saveRaw = useMutation({
    onMutate: () => {
      abandoned.current = true;
    },
    mutationFn: (name: string) =>
      itemsApi.create({
        name,
        cadence: { unit: 'week', interval: 2, weekdays: [], notifyTimeLocal: null },
        cadenceSource: 'default',
        firstDoneOn: todayIso(),
      }),
    onSuccess: async (item) => {
      setStep('idle');
      setResult(null);
      // 되돌리기 토큰이 없다. 커밋을 거치지 않았으므로 되돌릴 기록도 없다.
      setRawSaved(item.name);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });

  const cancel = useCallback(() => {
    setStep('idle');
    setResult(null);
    setCadenceOverride(null);
  }, []);

  const dismissToast = useCallback(() => setCommitted(null), []);

  const undo = useMutation({
    mutationFn: (undoToken: string) => import('@/lib/api/items').then((m) => m.itemsApi.undo(undoToken)),
    onSuccess: async () => {
      setCommitted(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });

  return {
    step,
    result,
    committed,
    lastMode,
    cadence: cadenceOverride ?? result?.cadence?.rule ?? null,
    setCadenceOverride,
    interpret: interpret.mutate,
    interpreting: interpret.isPending,
    commit: commit.mutate,
    committing: commit.isPending,
    chooseCandidate,
    createAsNew,
    saveRaw: saveRaw.mutate,
    rawSaved,
    dismissRawSaved: () => setRawSaved(null),
    cancel,
    dismissToast,
    undo: undo.mutate,
  };
}

function stepForOutcome(result: InterpretResult): CaptureStep {
  switch (result.outcome) {
    case 'matched_existing':
    case 'new_item':
      return 'confirm';
    case 'answered':
      return 'answered';
    case 'ambiguous':
      return 'disambiguate';
    case 'unrecognized':
      return 'retry';
  }
}
