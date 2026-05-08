-- =====================================================================
-- guest namespace 분리 마이그레이션 (2026-05-08)
-- =====================================================================
-- 목적:
--   - guest x-user-id 와 로그인 Toss userKey 가 같은 User.tossUserKey 컬럼을 공유하던 구조 제거
--   - guest 전용 식별자 guestDeviceId 도입
--   - legacy guest 레코드(비숫자형 tossUserKey, 토큰/프로필 없음)를 안전하게 backfill
--
-- 적용 방식:
--   psql "$DIRECT_URL" -f prisma/manual-migrations/2026-05-08_separate_guest_device_id.sql
-- =====================================================================

BEGIN;

ALTER TABLE "User"
  ADD COLUMN "guestDeviceId" TEXT;

-- legacy guest backfill:
-- - 기존 guest 는 tossUserKey 컬럼을 재사용했음
-- - 실제 Toss userKey 는 숫자형이므로, 비숫자형 + 토큰/프로필 없음 조건만 guest 로 간주
UPDATE "User"
SET
  "guestDeviceId" = "tossUserKey",
  "tossUserKey" = NULL
WHERE "guestDeviceId" IS NULL
  AND "tossUserKey" IS NOT NULL
  AND "tossUserKey" !~ '^[0-9]+$'
  AND "name" IS NULL
  AND "accessToken" IS NULL
  AND "refreshToken" IS NULL
  AND "tokenExpiresAt" IS NULL
  AND "scopes" IS NULL;

CREATE UNIQUE INDEX "User_guestDeviceId_key"
  ON "User"("guestDeviceId");

COMMIT;
