import type { Metadata, Viewport } from 'next';

import { Providers } from '@/components/providers';
import './globals.css';

const TITLE = 'Lastly — 말 한마디로 챙기는 생활 기록';
const DESCRIPTION =
  '“오늘 이불 빨았어” 한마디면 기록 끝. 마지막으로 언제 했는지 기억하고, 다음에 챙길 때가 되면 알려드려요.';

export const metadata: Metadata = {
  // 공유 미리보기 이미지 같은 상대 주소를 절대 주소로 바꾸는 기준. 카카오톡 등은 절대 주소만 읽는다.
  metadataBase: new URL('https://lastly-goorm.vercel.app'),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Lastly',
  authors: [{ name: '언제했조' }],
  creator: '언제했조',
  manifest: '/manifest.webmanifest',
  // 아이폰은 홈 화면 아이콘을 직접 둥글게 자른다. 꽉 찬 정사각형(투명·모서리 없음)을 준다.
  icons: { apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'Lastly',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    siteName: 'Lastly',
    locale: 'ko_KR',
    url: '/',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Lastly — “오늘 이불 빨았어” 한마디면 기록 끝' }],
  },
  twitter: { card: 'summary_large_image' },
  // iOS 사파리가 날짜·숫자를 전화번호 등으로 착각해 링크를 걸지 않게 한다.
  formatDetection: { telephone: false, date: false, address: false, email: false },
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
