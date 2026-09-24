import { notFound } from 'next/navigation';

import { LabScreen } from '@/features/lab/lab-screen';

/**
 * 온디바이스 실험실. 로그인·서버 없이 이 기기에서만 돈다.
 * 개발 서버에서는 늘 열리고, 배포본에서는 NEXT_PUBLIC_ENABLE_LAB=true 일 때만 연다.
 */
export default function OnDeviceLabPage() {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_LAB === 'true';
  if (!enabled) notFound();
  return <LabScreen />;
}
