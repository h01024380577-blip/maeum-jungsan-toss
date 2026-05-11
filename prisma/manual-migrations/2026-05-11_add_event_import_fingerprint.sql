-- =====================================================================
-- Event 대량 가져오기 지문 추가 (2026-05-11)
-- =====================================================================
-- 목적:
--   - 대량 가져오기 중복 제거를 애플리케이션 조회 비교에만 의존하지 않도록 보강
--   - 같은 userId + importFingerprint 조합은 DB 차원에서 한 번만 저장
--   - 기존 수동/과거 내역은 NULL 로 유지하므로 기존 중복 데이터와 충돌하지 않음
--
-- 적용 방식:
--   psql "$DIRECT_URL" -f prisma/manual-migrations/2026-05-11_add_event_import_fingerprint.sql
-- =====================================================================

BEGIN;

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "importFingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Event_userId_importFingerprint_key"
  ON "Event"("userId", "importFingerprint");

COMMIT;
