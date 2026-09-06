import type { Metadata, Viewport } from 'next';

import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lastly — 마지막으로 언제 했는지',
  description: '말 한마디면 기록 끝. 마지막으로 언제 했는지 대신 기억해요.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Lastly',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 입력 포커스 시 iOS가 확대하지 않게 한다.
  maximumScale: 1,
  themeColor: '#F5F2EC',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          {/* 설계 기준 390px. 더 넓은 화면에서는 가운데 정렬한다. */}
          <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-bg">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
