'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { usePushSubscription } from '@/features/notifications/use-push-subscription';
import { InstallGuide } from '@/features/onboarding/install-guide';
import { Intro } from '@/features/onboarding/intro';
import { NotifyPermission } from '@/features/onboarding/notify-permission';
import { markOnboardingSeen } from '@/lib/onboarding';

type Step = 'intro' | 'install' | 'notify';

/** 설계 01 → 02-A/02-B → 03. */
export default function OnboardingPage() {
  const router = useRouter();
  const push = usePushSubscription();
  const [step, setStep] = useState<Step>('intro');

  /**
   * 본 표시를 남기고 로그인으로 보낸다.
   * 남기지 않으면 미들웨어가 다시 온보딩으로 돌려보내 무한히 맴돈다.
   * 로그인 전이라 서버에 저장할 곳이 없어 쿠키를 쓴다.
   */
  const finish = () => {
    markOnboardingSeen();
    router.replace('/login');
  };

  if (step === 'intro') return <Intro onNext={() => setStep('install')} onSkip={finish} />;
  if (step === 'install') return <InstallGuide onNext={() => setStep('notify')} onSkip={finish} />;

  return (
    <NotifyPermission
      onEnable={async () => {
        await push.subscribe();
        finish();
      }}
      onSkip={finish}
      pending={push.status === 'requesting'}
    />
  );
}
