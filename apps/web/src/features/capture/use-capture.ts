'use client';

import type { CadenceRule, CommitResult, InterpretResult } from '@lastly/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { parseCaptureLocally, toClientSlots } from '@/features/on-device/parse-local';
import type { OnDeviceKnownItem } from '@/features/on-device/types';
import { speak } from '@/features/on-device/voice-guidance';
import { captureApi } from '@/lib/api/capture';
import { itemsApi } from '@/lib/api/items';
import { queryKeys } from '@/lib/api/query-keys';
import { todayIso } from '@/lib/date';
import { applyLocalLog } from '@/lib/offline/feed-cache';
import { addNewItem, addResolved } from '@/lib/offline/pending-captures';
import { resolveOffline } from '@/lib/offline/resolve-offline';

/** 주기를 정하지 않고 저장했을 때. 서버의 FALLBACK_CADENCE 와 같은 값이다. */
const FALLBACK_RULE: CadenceRule = { unit: 'week', interval: 2, weekdays: [], notifyTimeLocal: null };

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
  /** 연결이 끊겨 적어만 둔 문장. 토스트로 알려준 뒤 비운다. */
  const [pendingSaved, setPendingSaved] = useState<string | null>(null);
  /** 예정·못 함처럼 저장하지 않는 말. */
  const [deferredMessage, setDeferredMessage] = useState<string | null>(null);

  const interpret = useMutation({
    /**
     * 연결이 없어도 보류하지 말고 실패시킨다.
     *
     * 기본값은 오프라인이면 요청을 붙들고 기다린다. 그러면 오류가 나지 않아
     * 화면이 "살펴보고 있어요" 인 채로 멈추고, 사용자는 말한 것이 어떻게 됐는지 모른다.
     * 실패로 떨어져야 아래 onError 에서 문장을 적어 둘 수 있다.
     */
    networkMode: 'always',
    mutationFn: async (input: {
      text: string;
      mode: 'voice' | 'text';
      asrConfidence?: number;
      knownItems?: OnDeviceKnownItem[];
    }) => {
      const parsed = await parseCaptureLocally(
        input.text,
        todayIso(),
        input.knownItems ?? [],
      );

      if (parsed && !parsed.willSave && parsed.intent === 'record') {
        return { deferred: '아직 안 한 일은 기록하지 않아요' as const };
      }

      return captureApi.interpret({
        text: input.text,
        mode: input.mode,
        asrConfidence: input.asrConfidence,
        slots: parsed ? toClientSlots(parsed) : undefined,
      });
    },
    onMutate: (input) => {
      abandoned.current = false;
      setLastMode(input.mode);
      setStep('interpreting');
    },
    onSuccess: (data) => {
      if (abandoned.current) return;
      if ('deferred' in data) {
        setDeferredMessage(data.deferred);
        setStep('idle');
        speak(data.deferred);
        onInterpreted?.();
        return;
      }
      setResult(data);
      setCadenceOverride(null);
      setStep(stepForOutcome(data));
      onInterpreted?.();
    },
    onError: (_error, input) => {
      if (abandoned.current) return;

      /**
       * 연결이 끊겨서 실패한 것이라면 재시도 시트를 띄우지 않는다.
       * 지금은 아무리 눌러도 안 되고, 사용자는 방금 한 말을 잃는다.
       * 문장만 적어 두고 연결됐을 때 평소대로 해석한다.
       */
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        /**
         * 규칙 파서를 기기에서 돌려본다. 이미 있는 항목에 붙는 말이면 서버 없이도
         * 무엇을 저장할지 정해진다 — 앱에서 제일 흔한 경우가 그것이다.
         * 못 풀면 말만 적어 두고 연결됐을 때 서버에 맡긴다.
         */
        const offline = resolveOffline(input.text, input.mode);

        /**
         * 이름이 그대로 있으면 물어볼 것이 없다. 평소 저장했을 때와 똑같이 알리고
         * 목록도 그 자리에서 바꾼다 — 언제 올라가는지는 사용자 관심사가 아니다.
         */
        if (offline.kind === 'saved') {
          setRawSaved(offline.itemName);
          if (offline.feed) queryClient.setQueryData(queryKeys.home, offline.feed);
        } else if (offline.kind === 'ask') {
          // 확인 시트를 띄운다. 이름과 주기를 사용자가 정하고 저장하면 대기열에 쌓인다.
          setResult(offline.result);
          setCadenceOverride(null);
          setStep(stepForOutcome(offline.result));
          onInterpreted?.();
          return;
        } else {
          setPendingSaved('적어뒀어요 · 잠시 뒤 정리할게요');
        }

        setStep('idle');
        onInterpreted?.();
        return;
      }

      setStep('retry');
    },
  });

  const commit = useMutation({
    mutationFn: async (input: {
      itemId?: string;
      newItemName?: string;
      note?: string | null;
      /** 확인 시트가 실제로 보여준 주기. 보이는 것과 저장되는 것이 갈리지 않게 한다. */
      cadence?: CadenceRule;
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
      /**
       * 시트가 보여준 값이 가장 정확하다. 이름을 고쳐 주기가 다시 잡힌 경우
       * 그 값은 여기(result·cadenceOverride)에 없고 시트에만 있다.
       */
      const cadence = input.cadence ?? cadenceOverride ?? (isNew ? result.cadence?.rule : undefined);

      /**
       * 연결이 끊긴 자리에서 세운 결과는 서버가 서명한 표가 없다.
       * 기기에 쌓아 두고 연결될 때 올린다 — 화면에는 저장된 것으로 보인다.
       */
      if (result.draftToken === 'offline') {
        const name = input.newItemName ?? result.normalizedName ?? '';

        if (input.itemId) {
          addResolved(input.itemId, name, result.doneOn);
          applyLocalLog(input.itemId, result.doneOn, todayIso());
        } else {
          addNewItem(name, cadence ?? FALLBACK_RULE, result.doneOn);
        }

        return {
          log: null,
          itemId: input.itemId ?? 'offline',
          itemName: name,
          nextDueOn: result.cadence?.nextDueOn ?? null,
          undoToken: '',
          itemCreated: !input.itemId,
        } as unknown as CommitResult;
      }

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
    /**
     * 그 주기를 사용자가 정했는지. 직접 골랐거나 문장에서 말한 경우다.
     * 이름을 고쳐도 이 값은 지키라고 서버에 알리는 근거가 된다.
     */
    cadenceFixed: cadenceOverride !== null || result?.cadence?.source === 'user',
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
    /** 연결이 끊겨 적어만 둔 문장. 토스트로 알린다. */
    pendingSaved,
    dismissPendingSaved: () => setPendingSaved(null),
    deferredMessage,
    dismissDeferred: () => setDeferredMessage(null),
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
