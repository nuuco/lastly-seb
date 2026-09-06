'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { usePushSubscription } from '@/features/notifications/use-push-subscription';
import { InstallGuide } from '@/features/onboarding/install-guide';
import { Intro } from '@/features/onboarding/intro';
import { NotifyPermission } from '@/features/onboarding/notify-permission';

type Step = 'intro' | 'install' | 'notify';

/** 설계 01 → 02-A/02-B → 03. */
export default function OnboardingPage() {
  const router = useRouter();
  const push = usePushSubscription();
  const [step, setStep] = useState<Step>('intro');

  const finish = () => router.replace('/');

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
