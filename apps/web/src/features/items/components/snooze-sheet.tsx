'use client';

import { Sheet } from '@/components/ui/sheet';
import { SnoozePicker } from '@/features/capture/components/snooze-picker';

/**
 * 잠시 쉬어가기 — 항목 상세의 가운데 버튼.
 *
 * 주기 시트 안에 있던 것을 꺼냈다. 개정 설계의 주기 시트(10/10-B)는
 * 반복 방식·간격·요일·알림 시간만 다루는 순수 설정이고, 쉬어가기는
 * 다른 일이다. 알림이 성가셔서 잠깐 멈추려는 사람은 "주기 수정" 을
 * 누르지 않는다.
 */
export function SnoozeSheet({
  snoozedUntil,
  onPick,
  onClose,
}: {
  snoozedUntil: string | null;
  onPick: (until: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} label="잠시 쉬어가기">
      <SnoozePicker
        snoozedUntil={snoozedUntil}
        onPick={onPick}
        onCancel={() => onPick(null)}
        onBack={onClose}
      />
    </Sheet>
  );
}
