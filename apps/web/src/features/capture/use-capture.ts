'use client';

import type { CadenceRule, CommitResult, InterpretResult } from '@lastly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { captureApi } from '@/lib/api/capture';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * 입력 → 해석 → 확인 → 저장의 한 사이클을 담는다.
 *
 * step은 서버가 내려준 outcome에서 파생된다. 프론트가 직접 판단하지 않는다.
 *   matched_existing → confirm (화면 08)
 *   new_item         → confirm (화면 09)
 *   ambiguous        → disambiguate (화면 07-B)
 *   unrecognized     → retry (화면 07-B)
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

  const interpret = useMutation({
    mutationFn: (input: { text: string; mode: 'voice' | 'text'; asrConfidence?: number }) =>
      captureApi.interpret(input),
    onMutate: (input) => {
      setLastMode(input.mode);
      setStep('interpreting');
    },
    onSuccess: (data) => {
      setResult(data);
      setCadenceOverride(null);
      setStep(stepForOutcome(data));
      // 결과가 나온 뒤에야 입력창을 비운다 — 기다리는 동안 무엇을 보냈는지 보여야 한다.
      onInterpreted?.();
    },
    onError: () => setStep('retry'),
  });

  const commit = useMutation({
    mutationFn: async (input: {
      itemId?: string;
      newItemName?: string;
      note?: string | null;
    }) => {
      if (!result) throw new Error('해석 결과가 없습니다.');

      return captureApi.commit({
        draftToken: result.draftToken,
        itemId: input.itemId,
        newItemName: input.newItemName,
        doneOn: result.doneOn,
        cadence: cadenceOverride ?? undefined,
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

  /** 07-B에서 후보를 골랐을 때 — 바로 저장으로 넘어간다. */
  const chooseCandidate = useCallback(
    (itemId: string) => commit.mutate({ itemId }),
    [commit],
  );

  /** 07-B에서 "새 항목으로 만들기". 이름은 원문을 그대로 쓴다. */
  const createAsNew = useCallback(
    (name: string) => commit.mutate({ newItemName: name }),
    [commit],
  );

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
