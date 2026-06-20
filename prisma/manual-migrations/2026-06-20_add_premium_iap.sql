-- 프리미엄(평생 광고 제거) 인앱결제: premiumAdFree 컬럼 + IapOrder 테이블
-- deploy.sh가 매 배포마다 재실행하므로 전부 멱등

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumAdFree" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "IapOrderStatus" AS ENUM ('PURCHASED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "IapOrder" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "orderId"    TEXT NOT NULL,
  "sku"        TEXT NOT NULL,
  "status"     "IapOrderStatus" NOT NULL DEFAULT 'PURCHASED',
  "grantedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundedAt" TIMESTAMP(3),
  CONSTRAINT "IapOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IapOrder_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IapOrder_orderId_key" ON "IapOrder"("orderId");
CREATE INDEX IF NOT EXISTS "IapOrder_userId_idx" ON "IapOrder"("userId");
CREATE INDEX IF NOT EXISTS "IapOrder_userId_status_idx" ON "IapOrder"("userId", "status");
