import type { NextConfig } from 'next';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const isCSR = process.env.NEXT_BUILD_CSR === '1';
const isDev = process.env.NODE_ENV === 'development';
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// devDependency 라서 프로덕션에서 없을 수도 있다. dev 분기 안에서만 로드해
// `next start` / `next build` 가 devtools 설치 여부에 의존하지 않게 한다.
const requireCjs = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  // dev 는 dist-dev 로 분리한다. 예전엔 dev 도 dist/ 를 썼는데, build:ait 와
  // deploy.sh 가 `rm -rf dist` 로 시작하기 때문에 빌드를 돌리면 실행 중이던 dev
  // 서버의 산출물이 통째로 사라져 이후 모든 요청이 ENOENT 500 으로 죽었다.
  distDir: isCSR ? 'dist/web' : isDev ? 'dist-dev' : 'dist',
  ...(isCSR ? { output: 'export' } : {}),
  turbopack: {
    root: repoRoot,
  },
  images: {
    ...(isCSR ? { unoptimized: true } : {}),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
  // AIT Devtools — 로컬 브라우저에서 앱인토스 SDK 를 모킹하고 디버그 패널을 띄운다.
  // unplugin 에 Turbopack 어댑터가 없어서 `next dev --webpack` 에서만 동작한다
  // (package.json 의 dev 스크립트 참고).
  //
  // 플러그인은 SDK 모킹(@apps-in-toss/web-framework → mock) 용도로만 쓴다.
  // 패널 마운트는 src/lib/aitDevtools.ts 에서 직접 한다(해당 파일 주석 참고).
  webpack: (config, { dev, isServer }) => {
    if (isServer) {
      // instrumentation.ts 가 쓰는 node-cron 은 `node:crypto` 를 import 한다.
      // Turbopack 은 처리하지만 webpack 은 "Unhandled scheme" 으로 죽는다.
      // (serverExternalPackages 는 instrumentation 컴파일에 적용되지 않아 효과가 없었다.)
      // 이 훅은 webpack 빌드에만 적용되므로 Turbopack 을 쓰는 프로덕션 빌드는 영향 없음.
      config.externals = [...(config.externals ?? []), 'node-cron'];
    }
    if (dev && !isServer) {
      const aitDevtools = requireCjs('@apps-in-toss/devtools/unplugin').default;
      config.plugins.unshift(aitDevtools.webpack({ panel: false }));
    }
    return config;
  },
};

export default nextConfig;
