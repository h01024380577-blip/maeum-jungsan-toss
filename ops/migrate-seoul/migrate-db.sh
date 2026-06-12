#!/bin/bash
# Supabase us-east-1 → 서울 신규 프로젝트 데이터 이전
# 사용법: OLD_DIRECT_URL='postgresql://...' NEW_DIRECT_URL='postgresql://...' ./migrate-db.sh
# 전체 재적재 방식(데이터 수백 행, 수 초). 컷오버 직전 재실행으로 증분 반영.
set -euo pipefail

: "${OLD_DIRECT_URL:?기존 us-east-1 DIRECT_URL(session pooler, 5432) 필요}"
: "${NEW_DIRECT_URL:?신규 서울 DIRECT_URL(session pooler, 5432) 필요}"

PSQL=${PSQL:-psql}
PG_DUMP=${PG_DUMP:-pg_dump}
DUMP_FILE=$(mktemp /tmp/maeum-jungsan-dump.XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

echo "==> 1/4 기존 DB 덤프 (public 스키마, Prisma 테이블)"
"$PG_DUMP" "$OLD_DIRECT_URL" \
  --schema=public \
  --no-owner --no-privileges \
  --clean --if-exists \
  > "$DUMP_FILE"
echo "    덤프 크기: $(du -h "$DUMP_FILE" | cut -f1)"

echo "==> 2/4 신규 서울 DB로 복원"
"$PSQL" "$NEW_DIRECT_URL" --set ON_ERROR_STOP=1 -q -f "$DUMP_FILE"

echo "==> 3/4 행 수 대조 검증"
verify() {
  local table=$1
  local old_count new_count
  old_count=$("$PSQL" "$OLD_DIRECT_URL" -tAc "select count(*) from \"$table\"")
  new_count=$("$PSQL" "$NEW_DIRECT_URL" -tAc "select count(*) from \"$table\"")
  if [ "$old_count" != "$new_count" ]; then
    echo "    ✗ $table: old=$old_count new=$new_count 불일치!" >&2
    exit 1
  fi
  echo "    ✓ $table: $new_count rows"
}
for t in User Contact Event Transaction AdRewardGrant PaymentOrder; do
  verify "$t"
done

echo "==> 4/4 완료. 새 서버 .env의 DATABASE_URL/DIRECT_URL을 서울 프로젝트로 교체하세요."
