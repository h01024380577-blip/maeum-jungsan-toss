BEGIN;

DO $$
BEGIN
  CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'EXECUTING', 'EXECUTED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "payToken" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "productDesc" TEXT NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentOrder_orderNo_key"
  ON "PaymentOrder"("orderNo");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentOrder_payToken_key"
  ON "PaymentOrder"("payToken");

CREATE INDEX IF NOT EXISTS "PaymentOrder_userId_idx"
  ON "PaymentOrder"("userId");

CREATE INDEX IF NOT EXISTS "PaymentOrder_userId_status_idx"
  ON "PaymentOrder"("userId", "status");

DO $$
BEGIN
  ALTER TABLE "PaymentOrder"
    ADD CONSTRAINT "PaymentOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
