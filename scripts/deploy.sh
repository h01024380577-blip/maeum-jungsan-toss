#!/bin/bash
# 자동 배포 스크립트: push → EC2 pull + rebuild + restart (+ AIT 번들 재생성)
set -e

EC2_HOST=kmuproj-maeum-jungsan
# Remote 경로 — 로컬에서 ~ 확장 방지 위해 $HOME 사용
EC2_DIR='$HOME/maeum-jungsan-aws'
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- 1. Git push ---
echo "📤 Pushing to remote..."
cd "$LOCAL_DIR"
git push aws main

# --- 2. EC2 pull + install + build + restart ---
# npm install: package-lock 변경(신규 의존성) 대응. 변경 없으면 빠르게 패스.
# pm2 --update-env: .env 파일 변경도 프로세스에 반영되도록 강제.
echo "🖥️  Updating EC2 server..."
ssh "$EC2_HOST" "cd $EC2_DIR && git pull origin main && npm install --legacy-peer-deps 2>&1 | tail -3 && set -a && source .env && set +a && npx prisma db execute --file prisma/manual-migrations/2026-05-11_add_event_import_fingerprint.sql --url \"\$DIRECT_URL\" && npx prisma db execute --file prisma/manual-migrations/2026-05-11_clear_generated_import_memos.sql --url \"\$DIRECT_URL\" && npx prisma generate && npm run build:next 2>&1 | tail -3 && pm2 restart maeum-jungsan --update-env"

# --- 2.5. Smoke test: 새 배포가 정상 부팅됐는지 확인 ---
# /api/health 가 env validation + DB ping 검증 → 200 또는 503.
# pm2 fresh start 가 필요한 경우(신규 env 추가 등) 여기서 즉시 detect.
HEALTH_URL="https://maeum-jungsan.duckdns.org/api/health"
echo "🩺 Health check ($HEALTH_URL)..."
HEALTH_RES=$(curl --silent --show-error --output /tmp/maeum-health.json --write-out '%{http_code}' \
  --retry 5 --retry-delay 3 --retry-connrefused --max-time 30 \
  "$HEALTH_URL" || echo "000")
if [ "$HEALTH_RES" != "200" ]; then
  echo ""
  echo "❌ Health check FAILED (HTTP $HEALTH_RES)"
  echo "   Response body:"
  cat /tmp/maeum-health.json 2>/dev/null || echo "   (no response body)"
  echo ""
  echo "👉 ssh $EC2_HOST 'pm2 logs maeum-jungsan --err --lines 30 --nostream' 로 원인 확인."
  echo "👉 신규 env 변수 누락이면 .env 추가 + pm2 delete + pm2 start npm --name maeum-jungsan -- start (memory feedback_pm2_env_reset.md)"
  exit 1
fi
echo "✅ Health check passed (200)"

# --- 3. AIT 번들 재생성 (클라이언트 변경 시) ---
# 최근 커밋에서 클라이언트 파일 변경 여부 확인
CLIENT_CHANGED=$(git diff HEAD~1 --name-only -- \
  'src/**' 'components/**' 'app/**/*.tsx' 'app/**/*.ts' \
  '!app/api/**' \
  'public/**' 'styles/**' | head -1)

if [ -n "$CLIENT_CHANGED" ]; then
  echo "📱 Client changes detected — rebuilding AIT bundle..."
  cd "$LOCAL_DIR"
  rm -rf dist
  npm run build:ait
  echo "📦 Packaging .ait artifact..."
  npx ait build
  node scripts/verify-ait-artifact.mjs
  echo "✅ AIT artifact rebuilt (maeum-jungsan.ait)"
  echo "👉 npx ait deploy 로 번들을 업로드하세요"
else
  echo "⏭️  No client changes — skipping AIT bundle rebuild"
fi

echo "🎉 Deploy complete!"
