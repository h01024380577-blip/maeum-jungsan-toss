#!/bin/bash
# 자동 배포 스크립트: push → EC2 pull + rebuild + restart (+ AIT 번들 재생성)
set -e

EC2_HOST=maeum-jungsan-seoul
# Remote 경로 — 로컬에서 ~ 확장 방지 위해 $HOME 사용
EC2_DIR='$HOME/maeum-jungsan-aws'
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- 1. Git push ---
# aws(GitHub): 소스 백업/원본. seoul(EC2): receive.denyCurrentBranch=updateInstead 로
# 푸시 즉시 원격 워킹트리가 갱신된다(서버가 GitHub에서 pull 하지 않음 — 서버에 git 인증 불필요).
echo "📤 Pushing to remotes (aws=GitHub, seoul=EC2)..."
cd "$LOCAL_DIR"

# 푸시 전 EC2 가 가리키던 커밋 — 3단계의 AIT 번들 재빌드 판단 기준점이다.
# 푸시하고 나면 알아낼 방법이 없으므로 반드시 여기서 잡아둔다.
DEPLOYED_BEFORE=$(git ls-remote --heads seoul main 2>/dev/null | cut -f1 || true)

git push aws main
# seoul(EC2) updateInstead 푸시는 워킹트리에 변경이 있으면 거부됨.
# npm install이 남기는 package-lock.json 변경을 푸시 전에 자동 정리.
ssh "$EC2_HOST" "bash -lc 'cd $EC2_DIR && git checkout -- package-lock.json 2>/dev/null || true'"
git push seoul main

# --- 2. EC2 install + build + restart ---
# 워킹트리는 위 seoul 푸시로 이미 갱신됨(별도 pull 없음).
# npm install: package-lock 변경(신규 의존성) 대응. 변경 없으면 빠르게 패스.
# pm2 --update-env: .env 파일 변경도 프로세스에 반영되도록 강제.
echo "🖥️  Updating EC2 server..."
ssh "$EC2_HOST" "bash -lc 'set -euo pipefail
cd $EC2_DIR
npm install --legacy-peer-deps 2>&1 | tail -3
npm cache clean --force >/dev/null 2>&1 || true
rm -rf .next
set -a
source .env
set +a
npx prisma db execute --file prisma/manual-migrations/2026-05-11_add_event_import_fingerprint.sql --url \"\$DIRECT_URL\"
npx prisma db execute --file prisma/manual-migrations/2026-05-11_clear_generated_import_memos.sql --url \"\$DIRECT_URL\"
npx prisma db execute --file prisma/manual-migrations/2026-05-15_add_user_session_version.sql --url \"\$DIRECT_URL\"
npx prisma db execute --file prisma/manual-migrations/2026-05-15_add_payment_order.sql --url \"\$DIRECT_URL\"
npx prisma db execute --file prisma/manual-migrations/2026-06-20_remove_credits_add_consumed.sql --url \"\$DIRECT_URL\"
npx prisma db execute --file prisma/manual-migrations/2026-06-20_add_premium_iap.sql --url \"\$DIRECT_URL\"
npx prisma generate
NODE_OPTIONS=--max-old-space-size=2048 npm run build:next 2>&1 | tail -3
pm2 restart maeum-jungsan --update-env'"

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
# 배포 직전 EC2 가 가리키던 커밋(DEPLOYED_BEFORE)부터 HEAD 까지를 비교한다.
#
# 예전엔 `git diff HEAD~1` 이었는데, 커밋을 여러 개 모아서 푸시하면 마지막 커밋
# 하나만 보게 돼 앞선 커밋의 클라이언트 변경을 통째로 놓쳤다. 그러면 UI 수정이
# 번들에 반영되지 않은 채 배포가 "성공"으로 끝난다 — 조용히 새는 종류의 사고다.
# (2026-09-14 SDK 3.x 마이그레이션 배포에서 실제로 발생: next.config.ts 변경을 놓침.)
#
# 디렉터리 pathspec + :(exclude) 를 쓴다. glob 을 쓰면 조용히 새는 경우가 있음:
#   - 'app/**/*.tsx' 는 git wildmatch 특성상 `**` 뒤에 리터럴 `/` 를 요구해서
#     app/layout.tsx 같은 최상위 파일을 놓친다 (app/calendar/page.tsx 만 잡힘)
#   - '!app/api/**' 는 git 의 제외 문법이 아니다 (":(exclude)" 가 맞음).
#     리터럴 경로로 취급돼 사실상 무시되고, API 전용 커밋도 번들을 재빌드했다.
# apps-in-toss.config.ts / next.config.ts 는 AIT 번들에만/양쪽에 영향을 주므로 포함.
#
# 주의: .env 는 git 추적 대상이 아니라 여기서 감지되지 않는다.
# NEXT_PUBLIC_* 값은 번들에 박히므로, env 만 바꿨을 땐 수동으로 재빌드할 것.
BASE_REF=""
if [ -n "$DEPLOYED_BEFORE" ] && git cat-file -e "${DEPLOYED_BEFORE}^{commit}" 2>/dev/null; then
  BASE_REF="$DEPLOYED_BEFORE"
fi

if [ -z "$BASE_REF" ] || [ ! -f "$LOCAL_DIR/maeum-jungsan.ait" ]; then
  # 기준 커밋을 못 잡았거나(최초 배포·ls-remote 실패) 아티팩트 자체가 없으면
  # 건너뛰지 않고 무조건 재빌드한다.
  # 스킵은 조용히 틀리고 재빌드는 시끄럽게 맞다 — 애매하면 재빌드가 안전하다.
  CLIENT_CHANGED="(기준 커밋 불명 또는 아티팩트 없음)"
  REBUILD_REASON="$CLIENT_CHANGED"
else
  CLIENT_CHANGED=$(git diff "$BASE_REF" HEAD --name-only -- \
    src components public app \
    apps-in-toss.config.ts next.config.ts \
    ':(exclude)app/api' | head -1)
  REBUILD_REASON="${BASE_REF:0:7}..$(git rev-parse --short HEAD)"
fi

if [ -n "$CLIENT_CHANGED" ]; then
  echo "📱 Client changes detected ($REBUILD_REASON) — rebuilding AIT bundle..."
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
