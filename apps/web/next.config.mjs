import nextEnv from '@next/env';
import path from 'node:path';

// Next.js는 기본적으로 앱 디렉터리의 .env만 읽는다.
// 이 모노레포는 루트 .env 하나를 세 서비스가 공유하므로 여기서 직접 읽어들인다.
// (apps/api는 ConfigModule의 envFilePath로, apps/ai는 pydantic-settings로 같은 파일을 읽는다.)
// @next/env는 CJS라 named import가 안 되고 default를 거쳐야 한다.
const repoRoot = path.join(import.meta.dirname, '../..');
nextEnv.loadEnvConfig(repoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 모노레포 루트를 명시한다.
  // 없으면 Next가 상위 디렉터리의 lockfile을 보고 워크스페이스 루트를 잘못 잡아,
  // 배포 시 파일 추적 범위가 어긋난다.
  outputFileTracingRoot: repoRoot,

  // apps/web 밖(utterance-rules)을 가져와 쓴다. 없으면 감시·번들이 어긋난다.
  experimental: {
    externalDir: true,
  },

  // design-tokens는 빌드 단계 없이 소스를 그대로 쓴다.
  // contracts는 dist(JS)를 내보내므로 여기 없어도 된다.
  transpilePackages: ['@lastly/design-tokens'],

  webpack: (config, { dev }) => {
    if (dev) {
      // api 쪽 utterance-rules 변경이 HMR에 안 잡히던 것을 막는다.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /node_modules/,
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
