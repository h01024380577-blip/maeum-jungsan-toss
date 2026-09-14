#!/bin/bash
# CSR 빌드용 — API 라우트를 임시 제외하고 정적 HTML 생성
set -e

# 이전 server build 가 남긴 route validator 가 app/api 를 참조하면,
# CSR 빌드에서 API 라우트를 제외한 뒤 type check 가 실패한다.
rm -rf dist/web dist/types dist/dev

cleanup_server_artifacts() {
  # Apps-in-Toss CLI recursively stats files under dist/web before adding them to
  # the .ait artifact. Next.js 16 can leave server-only directories and symlinks
  # in the custom distDir, and a broken symlink makes that collection step return
  # an empty file list. Keep only static runtime assets for the WebView bundle.
  #
  # SDK 3.x 부터 webBundleDir(=dist/web) 이 통째로 아티팩트에 실리므로,
  # macOS 가 남기는 .DS_Store 까지 그대로 번들에 들어간다. 함께 제거한다.
  find dist/web -type l -delete 2>/dev/null || true
  find dist/web -name '.DS_Store' -delete 2>/dev/null || true
  rm -rf \
    dist/dev \
    dist/web/build \
    dist/web/cache \
    dist/web/diagnostics \
    dist/web/dev \
    dist/web/node_modules \
    dist/web/server \
    dist/web/types \
    dist/web/turbopack
  rm -f \
    dist/web/next-minimal-server.js.nft.json \
    dist/web/next-server.js.nft.json \
    dist/web/required-server-files.js \
    dist/web/required-server-files.json \
    dist/web/trace \
    dist/web/trace-build
}

# API 라우트 임시 이동 (CSR 번들에 불필요)
mv app/api app/_api_ait_backup

# 빌드 실패해도 API 폴더 복원 보장
trap 'mv app/_api_ait_backup app/api' EXIT

NEXT_BUILD_CSR=1 npx next build

cleanup_server_artifacts
sleep 0.2
cleanup_server_artifacts
