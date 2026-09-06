'use client';

import type { InterpretResult } from '@lastly/contracts';

import { Chevron, Sheet } from '@/components/ui/sheet';

interface DisambiguateSheetProps {
  open: boolean;
  result: InterpretResult;
  onChoose: (itemId: string) => void;
  onCreateNew: (name: string) => void;
  onRetry: () => void;
  onKeyboard: () => void;
  /** 배경 탭·취소로 그냥 물러날 때. 다시 말하기와 달리 마이크를 켜지 않는다. */
  onDismiss: () => void;
  committing: boolean;
}

/**
 * 설계 07-B — 못 알아들었거나 후보가 여럿일 때.
 *
 * 여기서 고른 선택이 별칭으로 학습돼 다음부터는 이 화면을 거치지 않는다.
 */
export function DisambiguateSheet({
  open,
  result,
  onChoose,
  onCreateNew,
  onRetry,
  onKeyboard,
  onDismiss,
  committing,
}: DisambiguateSheetProps) {
  const hasCandidates = result.candidates.length > 0;
  const newItemName = result.normalizedName ?? result.transcript;

  return (
    <Sheet open={open} onClose={onDismiss} label="항목 선택">
      <div className="flex items-center justify-between">
        <span className="text-16 font-semibold text-ink">기록하기</span>
        <button type="button" onClick={onDismiss} className="text-14 text-ink-3">
          취소
        </button>
      </div>

      <p className="mt-[26px] text-13 text-ink-3">이렇게 들었어요</p>
      <p className="mt-2.5 rounded-lg border border-line bg-card px-[18px] py-4 text-18 font-semibold tracking-[-.02em] text-ink-2">
        “{result.transcript}”
      </p>

      <div className="mt-5 rounded-lg border border-[#EFD9CB] bg-[#F8EAE1] px-[18px] py-4">
        <p className="text-[14.5px] font-bold text-action-pressed">
          {hasCandidates ? '어떤 항목인지 확실하지 않아요' : '무슨 일인지 잘 모르겠어요'}
        </p>
        <p className="mt-1.5 text-[13.5px] leading-[1.7] text-ink-2">
          {hasCandidates
            ? '조금 더 또렷하게 말해주시거나, 아래에서 골라주세요.'
            : '다시 말해주시거나 키보드로 적어주세요.'}
        </p>
      </div>

      {hasCandidates ? (
        <>
          <p className="mt-[22px] text-12.5 tracking-wide4 text-ink-3">혹시 이건가요?</p>
          <div className="mt-2.5 flex flex-col gap-[9px]">
            {result.candidates.map((candidate) => (
              <button
                key={candidate.itemId}
                type="button"
                disabled={committing}
                onClick={() => onChoose(candidate.itemId)}
                className="flex items-center justify-between rounded-row border border-line bg-card px-[18px] py-[15px] text-left disabled:opacity-60"
              >
                <span className="text-16 font-semibold text-ink">{candidate.name}</span>
                <span className="text-12.5 text-ink-3">
                  {candidate.daysSinceLastDone !== null
                    ? `마지막 ${candidate.daysSinceLastDone}일 전`
                    : '기록 없음'}
                </span>
              </button>
            ))}

            <button
              type="button"
              disabled={committing}
              onClick={() => onCreateNew(newItemName)}
              className="flex items-center justify-between rounded-row border border-dashed border-line bg-card px-[18px] py-[15px] text-left disabled:opacity-60"
            >
              <span className="text-16 font-semibold text-ink-2">새 항목으로 만들기</span>
              <Chevron className="border-[1.6px] border-b-0 border-l-0" />
            </button>
          </div>
        </>
      ) : null}

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          disabled={committing}
          className="flex h-14 flex-1 items-center justify-center rounded-row bg-action text-16 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
        >
          다시 말하기
        </button>
        <button
          type="button"
          onClick={onKeyboard}
          disabled={committing}
          className="flex h-14 flex-1 items-center justify-center rounded-row border border-line bg-card text-16 font-semibold text-ink-2 disabled:opacity-60"
        >
          직접 고치기
        </button>
      </div>
    </Sheet>
  );
}
