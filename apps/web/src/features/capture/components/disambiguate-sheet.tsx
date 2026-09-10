'use client';

import type { InterpretResult } from '@lastly/contracts';
import { useState } from 'react';

import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

interface DisambiguateSheetProps {
  open: boolean;
  result: InterpretResult;
  onChoose: (itemId: string) => void;
  onCreateNew: (name: string) => void;
  /** 다시 말하기 — 음성으로 들어왔을 때만 뜬다. */
  onRetry: () => void;
  /** 배경 탭·취소로 그냥 물러날 때. */
  onDismiss: () => void;
  committing: boolean;
  /** 사용자가 말했는지 적었는지. 안내 문구와 버튼이 달라진다. */
  mode: 'voice' | 'text';
}

/**
 * 못 알아들었거나 후보가 여럿일 때.
 *
 * 어떤 경우에도 사용자가 적은 것은 남길 수 있어야 한다. AI 가 못 알아들었다고
 * 해서 방금 한 일이 없던 일이 되는 건 아니다. 그래서 이름을 고쳐 쓸 수 있는
 * 칸을 두고, 그대로 저장하는 길을 항상 연다.
 *
 * 안내 문구는 원인에 따라 갈린다. AI 가 대답을 못 한 것을 사용자 탓으로
 * 돌리지 않기 위해서다.
 */
export function DisambiguateSheet({
  open,
  result,
  onChoose,
  onCreateNew,
  onRetry,
  onDismiss,
  committing,
  mode,
}: DisambiguateSheetProps) {
  const candidates = result.candidates;
  const [name, setName] = useState(result.normalizedName ?? result.transcript);
  const notice = describeNotice(result.degraded, candidates.length > 0, mode);

  return (
    <Sheet open={open} onClose={onDismiss} label="항목 고르기">
      <div className="flex items-center justify-between">
        <span className="text-16 font-semibold text-ink">기록하기</span>
        <button type="button" onClick={onDismiss} className="text-14 text-ink-3">
          취소
        </button>
      </div>

      <p className="mt-[26px] text-13 text-ink-3">
        {mode === 'voice' ? '이렇게 들었어요' : '이렇게 적으셨어요'}
      </p>
      <p className="mt-2.5 text-18 font-semibold tracking-t2 text-ink-2">“{result.transcript}”</p>

      <div className="mt-4 rounded-md border border-line bg-accent-soft px-[18px] py-4">
        <p className="text-[14.5px] font-bold text-action-pressed">{notice.title}</p>
        <p className="mt-1.5 text-[13.5px] leading-[1.7] text-ink-2">{notice.body}</p>
      </div>

      {candidates.length > 0 ? (
        <>
          <p className="mt-[22px] text-12.5 tracking-wide4 text-ink-3">혹시 이건가요?</p>
          <div className="mt-2.5 flex flex-col gap-[9px]">
            {candidates.map((candidate) => (
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
          </div>
        </>
      ) : null}

      {/**
       * 여기가 막다른 길을 여는 자리다.
       * 후보가 없어도, AI 가 죽어 있어도 이 칸을 고쳐 그대로 저장할 수 있다.
       */}
      <p className="mt-[22px] text-12.5 tracking-wide4 text-ink-3">
        {candidates.length > 0 ? '아니면 새 항목으로' : '이름을 정해 남겨주세요'}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="항목 이름"
        maxLength={60}
        placeholder="예: 이불 빨래"
        className="mt-2.5 w-full rounded-row border-[1.5px] border-line bg-card px-[18px] py-4 text-17 font-bold tracking-t3 text-ink outline-none focus:border-action placeholder:font-normal placeholder:text-ink-3"
      />

      <button
        type="button"
        disabled={committing || !name.trim()}
        onClick={() => onCreateNew(name.trim())}
        className="mt-3 flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
      >
        {committing ? '저장하는 중…' : '이 이름으로 기록하기'}
      </button>

      {/* 말로 들어왔을 때만. 적어서 들어온 사람에게 "다시 말하기" 는 뜬금없다. */}
      {mode === 'voice' ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={committing}
          className={cn(
            'mt-2.5 flex h-[52px] w-full items-center justify-center rounded-lg',
            'border border-line bg-card text-15.5 font-semibold text-ink-2 disabled:opacity-60',
          )}
        >
          다시 말하기
        </button>
      ) : null}
    </Sheet>
  );
}

function describeNotice(
  degraded: boolean,
  hasCandidates: boolean,
  mode: 'voice' | 'text',
): { title: string; body: string } {
  // 서버가 대답을 못 한 것이다. 사용자가 잘못 말한 게 아니므로 고쳐 말하라고 하지 않는다.
  if (degraded) {
    return {
      title: '지금은 자동으로 알아보기 어려워요',
      body: hasCandidates
        ? '아래에서 고르거나, 이름을 정해 그대로 남겨주세요.'
        : '이름만 정해주시면 그대로 남겨드릴게요.',
    };
  }

  if (hasCandidates) {
    return {
      title: '어떤 항목인지 확실하지 않아요',
      body: '아래에서 고르거나, 새 항목으로 남겨주세요.',
    };
  }

  return {
    title: '무슨 일인지 잘 모르겠어요',
    body:
      mode === 'voice'
        ? '이름을 정해 남기시거나, 다시 말해주세요.'
        : '이름을 정해주시면 그대로 남겨드릴게요.',
  };
}
