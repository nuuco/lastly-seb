'use client';

import { Sheet, SheetActions } from '@/components/ui/sheet';
import { getMicSettingsPlatform, type MicSettingsPlatform } from '@/lib/speech';

/**
 * 마이크 권한을 거부한 사람에게 켜는 곳을 알려준다.
 *
 * 한 번 거부하면 브라우저가 다시 묻지 않아서 앱에서 팝업을 다시 띄울 수 없다.
 * iPhone·Mac Safari 는 음성 인식에 마이크와 음성 인식 권한을 따로 받으므로 두 곳을 모두 적는다.
 */
const STEPS: Record<MicSettingsPlatform, string[]> = {
  ios: ['설정 > Safari > 마이크 > 허용', '설정 > 개인정보 보호 및 보안 > 음성 인식 > Safari 켜기'],
  'mac-safari': [
    'Safari > 설정 > 웹 사이트 > 마이크 > 허용',
    '시스템 설정 > 개인정보 보호 및 보안 > 음성 인식 > Safari 켜기',
  ],
  android: ['주소창 왼쪽 아이콘 > 권한 > 마이크 > 허용'],
  other: ['브라우저 설정에서 이 사이트의 마이크를 허용해 주세요'],
};

export function MicPermissionSheet({ onClose }: { onClose: () => void }) {
  const steps = STEPS[getMicSettingsPlatform()];

  return (
    <Sheet open onClose={onClose} label="마이크 권한 안내">
      <h2 className="text-[20px] font-bold tracking-[-.03em] text-ink">
        마이크를 켜야 말로 기록할 수 있어요
      </h2>
      <p className="mt-1.5 break-keep text-[13.5px] leading-[1.7] text-ink-3">
        마이크 권한이 꺼져 있어요. 아래에서 켠 뒤 다시 눌러 주세요.
      </p>

      <ol className="mt-5 space-y-2.5">
        {steps.map((step, i) => (
          <li
            key={step}
            className="flex gap-2.5 rounded-row border border-line bg-card px-[18px] py-3.5 text-15 leading-[1.6] text-ink"
          >
            {steps.length > 1 ? <span className="font-semibold text-ink-3">{i + 1}</span> : null}
            <span className="break-keep">{step}</span>
          </li>
        ))}
      </ol>

      <SheetActions primary={{ label: '확인', onClick: onClose }} />
    </Sheet>
  );
}
