'use client';

import type { Item, LogEntry } from '@lastly/contracts';

import { Sheet, SheetActions } from '@/components/ui/sheet';
import { formatShortDate } from '@/lib/date';

/**
 * 삭제 확인 — 설계 13-B(계정 삭제)의 방식을 항목 단위로 옮겼다.
 *
 * "정말 삭제할까요?" 는 다들 읽지 않고 누른다. 무엇을 잃는지 숫자로
 * 보여줘야 손이 멈춘다. 상세 화면의 버튼 셋이 같은 크기·같은 모양이라
 * 옆 버튼을 누르려다 잘못 짚기 쉬워서 한 번 물어본다.
 */
export function DeleteSheet({
  item,
  logs,
  onConfirm,
  onCancel,
  deleting,
}: {
  item: Item;
  logs: LogEntry[];
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  const oldest = logs[logs.length - 1];

  return (
    <Sheet open onClose={onCancel} label="항목 삭제">
      <p className="text-[22px] font-bold leading-[1.45] tracking-t35 text-ink">
        {item.name}를<br />
        지울까요?
      </p>

      {logs.length > 0 ? (
        <p className="mt-2.5 text-14 leading-[1.75] text-ink-2">
          지난 기록 {logs.length}건도 함께 사라져요.
          {oldest ? ` ${formatShortDate(oldest.doneOn)}부터 쌓인 기록이에요.` : ''}
        </p>
      ) : (
        <p className="mt-2.5 text-14 leading-[1.75] text-ink-2">아직 쌓인 기록은 없어요.</p>
      )}

      <SheetActions
        primary={{
          label: deleting ? '지우는 중…' : '삭제',
          disabled: deleting,
          onClick: onConfirm,
          danger: true,
        }}
        secondary={{ label: '그만두기', onClick: onCancel, disabled: deleting }}
      />
    </Sheet>
  );
}
