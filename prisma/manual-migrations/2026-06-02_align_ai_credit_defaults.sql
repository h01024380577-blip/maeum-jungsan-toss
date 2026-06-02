-- 신규 사용자 AI 분석 웰컴 크레딧 기본값 조정 (2026-06-02)
--
-- 목적:
--   신규 로그인/게스트 사용자의 초기 크레딧을 AI 분석 1회, 대량 가져오기 1회로 맞춘다.
--   AI 분석 광고 보상 최대 보관 한도는 애플리케이션 설정 기본값 AI_CREDIT_CAP=3 으로
--   대량 가져오기(CSV_CREDIT_CAP=3)와 동일하게 운영한다.
--
-- 적용:
--   기존 사용자의 aiCredits 잔고가 3회를 초과하면 최대 보관 한도에 맞춰 3회로 낮춘다.
--   0~3회 잔고는 유지한다.

ALTER TABLE "User"
  ALTER COLUMN "aiCredits" SET DEFAULT 1;

UPDATE "User"
SET "aiCredits" = 3
WHERE "aiCredits" > 3;
