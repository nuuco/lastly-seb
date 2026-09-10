'use client';

import type { InterpretResult } from '@lastly/contracts';
import Link from 'next/link';

import { formatShortDate } from '@/lib/date';

/**
 * 물어본 것에 그 자리에서 답한다 — 설계 07-C.
 *
 * 화면을 옮기지 않는다. "마지막으로 이불 언제 빨았어?" 는 궁금해서 묻는 말이지
 * 항목 상세를 열어보려는 게 아니다. 답을 읽고 그대로 닫으면 된다.
 * 입력 바 위에 앉으므로 어두운 면을 써서 지면과 확실히 갈라 둔다.
 */
export function AnswerCard({
  result,
  onComplete,
  onDismiss,
  completing,
}: {
  result: InterpretResult;
  onComplete: (itemId: string) => void;
  onDismiss: () => void;
  completing: boolean;
}) {
  const answer = result.answer;
  if (!answer) return null;

  return (
    <div className="mb-2.5 rounded-[22px] bg-ink p-[16px_18px] shadow-answer">
      <p className="text-12 font-bold tracking-wide2 text-[#C9BEA8]">물어보신 것</p>
      <p className="mt-1.5 text-14 text-[#EFE9DD]">“{result.transcript}”</p>

      <p className="mt-3 border-t border-[rgba(245,242,236,.16)] pt-3 text-16 font-semibold leading-[1.55] text-[#FBF9F4]">
        {describeLast(answer.daysSinceLastDone, answer.lastDoneOn)}
      </p>
      {answer.nextDueOn ? (
        <p className="mt-1.5 text-13 text-[#C9BEA8]">
          다음 예정일은 {describeDue(answer.daysUntilDue)} {formatShortDate(answer.nextDueOn)}이에요
        </p>
      ) : null}

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={() => onComplete(answer.itemId)}
          disabled={completing}
          className="flex-1 rounded-[13px] bg-action py-3.5 text-center text-14 font-semibold text-white disabled:opacity-60"
        >
          {completing ? '기록하는 중…' : '오늘 했어요'}
        </button>
        <Link
          href={`/items/${answer.itemId}`}
          onClick={onDismiss}
          className="flex-1 rounded-[13px] bg-[rgba(245,242,236,.12)] py-3.5 text-center text-14 font-semibold text-[#EFE9DD]"
        >
          기록 보기
        </Link>
      </div>
    </div>
  );
}

function describeLast(days: number | null, lastDoneOn: string | null): string {
  if (days === null || !lastDoneOn) return '아직 한 기록이 없어요';
  if (days === 0) return '오늘 하셨어요';
  return `${days}일 전인 ${formatShortDate(lastDoneOn)}에 하셨어요`;
}

/** "모레", "3일 뒤"처럼 사람이 세는 말로 옮긴다. */
function describeDue(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)}일 지난`;
  if (days === 0) return '오늘인';
  if (days === 1) return '내일인';
  if (days === 2) return '모레인';
  return `${days}일 뒤인`;
}
