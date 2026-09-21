import fs from 'node:fs';
import nextEnv from '@next/env';
import path from 'node:path';

// Next.js는 기본적으로 앱 디렉터리의 .env만 읽는다.
// 이 모노레포는 루트 .env 하나를 세 서비스가 공유하므로 여기서 직접 읽어들인다.
// (apps/api는 ConfigModule의 envFilePath로, apps/ai는 pydantic-settings로 같은 파일을 읽는다.)
// @next/env는 CJS라 named import가 안 되고 default를 거쳐야 한다.
const repoRoot = path.join(import.meta.dirname, '../..');
nextEnv.loadEnvConfig(repoRoot);

const localModelPath = path.join(import.meta.dirname, 'public/models/gemma3-1b-it-int4-web.task');
const hasLocalModel = fs.existsSync(localModelPath);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 모노레포 루트를 명시한다.
  // 없으면 Next가 상위 디렉터리의 lockfile을 보고 워크스페이스 루트를 잘못 잡아,
  // 배포 시 파일 추적 범위가 어긋난다.
  outputFileTracingRoot: repoRoot,

  // design-tokens는 빌드 단계 없이 소스를 그대로 쓴다.
  // contracts는 dist(JS)를 내보내므로 여기 없어도 된다.
  transpilePackages: ['@lastly/design-tokens', '@lastly/parser'],

  async redirects() {
    if (hasLocalModel) return [];
    return [
      {
        source: '/models/gemma3-1b-it-int4-web.task',
        destination:
          'https://huggingface.co/nuuco/gemma-3-1b-it-int4-web/resolve/main/gemma3-1b-it-int4-web.task',
        permanent: false,
      },
    ];
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
    ];
  },
};

export default nextConfig;
