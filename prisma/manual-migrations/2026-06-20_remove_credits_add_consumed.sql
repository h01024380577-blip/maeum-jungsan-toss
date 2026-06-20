-- 크레딧 잔고 시스템 제거 및 광고 필수 시청 모델 전환
-- 변경: 잔고(balance) 기반 → 일회성 허가권(nonce CONSUMED) 기반
--
-- 배포 순서: 이 SQL 먼저 실행 → 서버 코드 배포

-- 1. GrantStatus enum에 CONSUMED 추가 (nonce가 기능 실행에 사용된 상태)
-- IF NOT EXISTS: deploy.sh가 매 배포마다 실행하므로 재실행 시 멱등해야 함
ALTER TYPE "GrantStatus" ADD VALUE IF NOT EXISTS 'CONSUMED';

-- 2. User 테이블에서 크레딧 및 광고 카운터 컬럼 제거
ALTER TABLE "User" DROP COLUMN IF EXISTS "aiCredits";
ALTER TABLE "User" DROP COLUMN IF EXISTS "csvImportCredits";
ALTER TABLE "User" DROP COLUMN IF EXISTS "adWatchesToday";
ALTER TABLE "User" DROP COLUMN IF EXISTS "adWatchesResetAt";
