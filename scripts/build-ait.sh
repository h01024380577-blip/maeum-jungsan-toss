#!/bin/bash
# CSR 빌드용 — API 라우트를 임시 제외하고 정적 HTML 생성
set -e

# API 라우트 임시 이동 (CSR 번들에 불필요)
mv app/api app/_api_ait_backup

# 빌드 실패해도 API 폴더 복원 보장
trap 'mv app/_api_ait_backup app/api' EXIT

NEXT_BUILD_CSR=1 npx next build

# Apps-in-Toss CLI recursively stats files under dist/web before adding them to
# the .ait artifact. Next.js 16 can leave server-only directories and symlinks
# in the custom distDir, and a broken symlink makes that collection step return
# an empty file list. Keep only static runtime assets for the WebView bundle.
find dist/web -type l -delete
rm -rf \
  dist/web/build \
  dist/web/cache \
  dist/web/diagnostics \
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
