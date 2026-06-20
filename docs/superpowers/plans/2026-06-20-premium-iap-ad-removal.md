# 프리미엄(평생 광고 제거) 인앱결제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱인토스 인앱결제로 "평생 광고 제거" 비소모성 상품을 추가해, 구매 사용자는 AI 분석/대량 가져오기를 광고 없이 사용한다.

**Architecture:** 클라이언트 `IAP` SDK로 결제 → `processProductGrant`에서 서버 `/api/iap/grant` 호출 → 서버가 mTLS로 토스 주문상태 API를 검증한 뒤에만 `User.premiumAdFree=true` 지급. 4개 광고 게이트 라우트는 `isPremiumUser()`로 우회. 환불은 앱 실행 시 `/api/iap/reconcile`로 자동 회수.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + PostgreSQL, `@apps-in-toss/web-framework` `IAP`, mTLS(`src/lib/tossApiClient.ts`), Zustand, Vitest 4, Tailwind, lucide-react.

> ⚠️ **배포 훅 주의:** `.codex/hooks.json`에 `git commit` 시 `scripts/deploy.sh`를 실행하는 PostToolUse 훅이 있다. 각 커밋은 `aws`(GitHub)로 push하고 EC2 배포를 시도한다. 구현 환경에서 의도치 않은 배포가 일어나지 않게, 실행자는 훅 비활성/네트워크 상태를 먼저 확인할 것.

> 참고 스펙: `docs/superpowers/specs/2026-06-20-premium-iap-ad-removal-design.md`

---

## File Structure

**신규**
- `prisma/manual-migrations/2026-06-20_add_premium_iap.sql` — 멱등 마이그레이션(컬럼+테이블+enum)
- `src/lib/iapConfig.ts` — `PREMIUM_SKU` 상수
- `src/lib/iapClient.ts` — 서버측 mTLS 주문상태 조회
- `src/lib/iap.ts` — 클라이언트 `IAP` SDK 래퍼
- `app/api/iap/grant/route.ts` — 혜택 지급(검증)
- `app/api/iap/status/route.ts` — 프리미엄 상태 조회
- `app/api/iap/reconcile/route.ts` — 환불 자동 회수
- `src/components/mypage/PremiumSheet.tsx` — 구매 바텀시트
- 테스트: `src/lib/iapClient.test.ts`, `app/api/iap/grant/route.test.ts`, `app/api/iap/reconcile/route.test.ts`, `src/lib/premiumGate.test.ts`

**수정**
- `prisma/schema.prisma` — `User.premiumAdFree`, `IapOrder`, `IapOrderStatus`
- `src/lib/credits.ts` — `isPremiumUser()` 추가
- `app/api/analyze/route.ts`, `app/api/parse-url/route.ts`, `app/api/parse-deposit-image/route.ts`, `app/api/entries/bulk/route.ts` — 게이트 우회
- `src/store/useStore.ts` — `isPremium` 상태 + 로드/구매/복원
- `src/tabs/MyPageTab.tsx` — 톱니 좌측 왕관 진입 버튼
- `src/components/mypage/ProfileCard.tsx` — 프리미엄 왕관 오버레이
- `scripts/deploy.sh` — 신규 SQL 연결

---

## Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (User 모델, 신규 모델/enum)
- Create: `prisma/manual-migrations/2026-06-20_add_premium_iap.sql`

- [ ] **Step 1: User 모델에 필드/관계 추가**

`prisma/schema.prisma`의 `model User`에 추가:
```prisma
  premiumAdFree Boolean @default(false)
```
관계 목록(`rewardGrants`/`paymentOrders` 근처)에 추가:
```prisma
  iapOrders     IapOrder[]
```

- [ ] **Step 2: IapOrder 모델 + enum 추가**

`prisma/schema.prisma` 끝에 추가:
```prisma
model IapOrder {
  id         String         @id @default(cuid())
  userId     String
  orderId    String         @unique
  sku        String
  status     IapOrderStatus @default(PURCHASED)
  grantedAt  DateTime       @default(now())
  refundedAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

enum IapOrderStatus {
  PURCHASED
  REFUNDED
}
```

- [ ] **Step 3: 멱등 마이그레이션 SQL 작성**

`prisma/manual-migrations/2026-06-20_add_premium_iap.sql`:
```sql
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
```

- [ ] **Step 4: 클라이언트 생성 + 검증**

Run: `npx prisma generate && npx prisma validate`
Expected: `The schema ... is valid` / 에러 없음

- [ ] **Step 5: 로컬 DB에 적용(선택, DIRECT_URL 있을 때)**

Run: `npx prisma db execute --file prisma/manual-migrations/2026-06-20_add_premium_iap.sql --url "$DIRECT_URL"`
Expected: 성공(재실행해도 에러 없음 — 멱등 확인)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/manual-migrations/2026-06-20_add_premium_iap.sql
git commit -m "feat(iap): premiumAdFree 컬럼 + IapOrder 모델/마이그레이션"
```

---

## Task 2: PREMIUM_SKU 상수

**Files:**
- Create: `src/lib/iapConfig.ts`

- [ ] **Step 1: 상수 작성**

`src/lib/iapConfig.ts`:
```ts
/** 평생 광고 제거 프리미엄 상품 SKU (앱인토스 콘솔 등록 ID) */
export const PREMIUM_SKU =
  process.env.IAP_PREMIUM_SKU?.trim() ||
  'ait.0000026455.4d539c9c.1a46e05a7b.1944872484';
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/iapConfig.ts
git commit -m "feat(iap): PREMIUM_SKU 상수"
```

---

## Task 3: `isPremiumUser` 헬퍼 (TDD)

**Files:**
- Modify: `src/lib/credits.ts`
- Test: `src/lib/premiumGate.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/premiumGate.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPremiumUser } from './credits';

vi.mock('@/src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
import { prisma } from '@/src/lib/prisma';

describe('isPremiumUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when premiumAdFree is true', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ premiumAdFree: true } as never);
    expect(await isPremiumUser('user-1')).toBe(true);
  });

  it('returns false when premiumAdFree is false', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ premiumAdFree: false } as never);
    expect(await isPremiumUser('user-1')).toBe(false);
  });

  it('returns false when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    expect(await isPremiumUser('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/premiumGate.test.ts`
Expected: FAIL — `isPremiumUser` is not exported

- [ ] **Step 3: 헬퍼 구현**

`src/lib/credits.ts` 끝에 추가:
```ts
/** 사용자가 평생 광고 제거 프리미엄을 보유했는지 여부. */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumAdFree: true },
  });
  return user?.premiumAdFree === true;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/premiumGate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits.ts src/lib/premiumGate.test.ts
git commit -m "feat(iap): isPremiumUser 게이트 헬퍼"
```

---

## Task 4: 4개 광고 게이트 우회

**Files:**
- Modify: `app/api/analyze/route.ts:75-90`, `app/api/parse-url/route.ts:132-150`, `app/api/parse-deposit-image/route.ts:60-72`, `app/api/entries/bulk/route.ts:105-121`

- [ ] **Step 1: import 추가 (4개 라우트 공통)**

각 라우트의 credits import에 `isPremiumUser`를 추가한다. 예) `analyze/route.ts`:
```ts
import {
  consumeAdPermission,
  restoreAdPermission,
  resolveDbUserId,
  isPremiumUser,
} from '@/src/lib/credits';
```
(parse-deposit-image는 `import { consumeAdPermission, ... } from '@/src/lib/credits'`에 `isPremiumUser` 추가)

- [ ] **Step 2: analyze 게이트 우회**

`app/api/analyze/route.ts`의 텍스트/이미지 nonce 블록(현재 75–90행)을 프리미엄 분기로 감싼다:
```ts
  // 텍스트/이미지 분석: 프리미엄이면 광고 게이트 우회, 아니면 nonce 필수
  if (!(await isPremiumUser(userId))) {
    const nonce = typeof permissionNonce === 'string' ? permissionNonce : '';
    if (!nonce) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'ad_required', rewardType: 'AI_CREDIT' },
        { status: 402 },
      ));
    }
    const permitted = await consumeAdPermission(userId, 'AI_CREDIT', nonce);
    if (!permitted) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'ad_required', rewardType: 'AI_CREDIT' },
        { status: 402 },
      ));
    }
  }
```
주의: 우회 시 `restoreAdPermission(userId, 'AI_CREDIT', nonce)`(Gemini 5xx 롤백) 호출부는 nonce가 없으므로 실행되면 안 된다. 해당 호출을 `if (nonce) { await restoreAdPermission(...) }`로 가드한다(현재 127행 부근).

- [ ] **Step 3: parse-url 게이트 우회**

`app/api/parse-url/route.ts`의 nonce 블록(132–150행)을 동일 패턴으로 `if (!(await isPremiumUser(userId))) { ... }`로 감싼다. (rewardType 'AI_CREDIT' 유지)

- [ ] **Step 4: parse-deposit-image 게이트 우회**

`app/api/parse-deposit-image/route.ts`의 nonce 블록(60–72행)을 `if (!(await isPremiumUser(userId))) { ... }`로 감싼다. (rewardType 'CSV_CREDIT')

- [ ] **Step 5: entries/bulk 게이트 우회**

`app/api/entries/bulk/route.ts`의 105–121행을 수정. 프리미엄을 bypass 조건에 합류:
```ts
  // 광고 시청 확인: 프리미엄/입금이미지 bypass 토큰이 있으면 nonce 불필요
  const bypassVerified = verifyCsvCreditBypassToken(creditToken, userId);
  const premium = await isPremiumUser(userId);
  if (!bypassVerified && !premium) {
    if (!permissionNonce) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'ad_required', rewardType: 'CSV_CREDIT' },
        { status: 402 },
      ));
    }
    const permitted = await consumeAdPermission(userId, 'CSV_CREDIT', permissionNonce);
    if (!permitted) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'ad_required', rewardType: 'CSV_CREDIT' },
        { status: 402 },
      ));
    }
  }
```

- [ ] **Step 6: 타입체크 + 기존 테스트 회귀 확인**

Run: `npx tsc --noEmit && npx vitest run app/api/analyze app/api/entries/bulk app/api/parse-deposit-image`
Expected: tsc 클린(기존 `ads.test.ts` nit 제외), 관련 테스트 PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/analyze/route.ts app/api/parse-url/route.ts app/api/parse-deposit-image/route.ts app/api/entries/bulk/route.ts
git commit -m "feat(iap): 프리미엄 사용자 광고 게이트 우회(4개 라우트)"
```

---

## Task 5: `iapClient.getOrderStatus` (mTLS, TDD)

**Files:**
- Create: `src/lib/iapClient.ts`
- Test: `src/lib/iapClient.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/iapClient.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/src/lib/tossApiClient', () => ({
  TOSS_API_BASE: 'https://apps-in-toss-api.toss.im',
  fetchWithRetry: vi.fn(),
}));
import { fetchWithRetry } from '@/src/lib/tossApiClient';
import { getOrderStatus } from './iapClient';

describe('getOrderStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the success payload on 200 SUCCESS', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      status: 200,
      json: async () => ({
        resultType: 'SUCCESS',
        success: { orderId: 'o1', sku: 'sku1', status: 'PURCHASED', statusDeterminedAt: 't', reason: 'ok' },
      }),
    } as never);

    const r = await getOrderStatus('userkey-1', 'o1');
    expect(r?.status).toBe('PURCHASED');
    expect(r?.sku).toBe('sku1');
    expect(fetchWithRetry).toHaveBeenCalledWith(
      'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-toss-user-key': 'userkey-1' }),
        body: JSON.stringify({ orderId: 'o1' }),
      }),
    );
  });

  it('returns null on non-200', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({ status: 500, json: async () => ({}) } as never);
    expect(await getOrderStatus('k', 'o')).toBeNull();
  });

  it('returns null when network throws', async () => {
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('boom'));
    expect(await getOrderStatus('k', 'o')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/iapClient.test.ts`
Expected: FAIL — `getOrderStatus` not found

- [ ] **Step 3: 구현**

`src/lib/iapClient.ts`:
```ts
import { TOSS_API_BASE, fetchWithRetry } from '@/src/lib/tossApiClient';

export type IapOrderStatusValue =
  | 'PURCHASED' | 'PAYMENT_COMPLETED' | 'FAILED' | 'REFUNDED'
  | 'ORDER_IN_PROGRESS' | 'NOT_FOUND' | 'MINIAPP_MISMATCH' | 'ERROR';

export interface IapOrderStatusResult {
  orderId: string;
  sku: string;
  status: IapOrderStatusValue;
  statusDeterminedAt: string;
  reason: string;
}

/** 토스 주문 상태 조회(mTLS, 서버↔서버). 실패 시 null. */
export async function getOrderStatus(
  tossUserKey: string,
  orderId: string,
): Promise<IapOrderStatusResult | null> {
  try {
    const res = await fetchWithRetry(
      `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/order/get-order-status`,
      {
        method: 'POST',
        headers: { 'x-toss-user-key': tossUserKey },
        body: JSON.stringify({ orderId }),
      },
    );
    if (res.status !== 200) return null;
    const json = await res.json();
    if (json?.resultType !== 'SUCCESS' || !json?.success) return null;
    return json.success as IapOrderStatusResult;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/iapClient.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/iapClient.ts src/lib/iapClient.test.ts
git commit -m "feat(iap): mTLS 주문상태 조회 클라이언트"
```

---

## Task 6: `POST /api/iap/grant` (TDD)

**Files:**
- Create: `app/api/iap/grant/route.ts`
- Test: `app/api/iap/grant/route.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`app/api/iap/grant/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/src/lib/cors', () => ({
  corsResponse: () => new Response(null),
  withCors: (_req: unknown, res: Response) => res,
}));
vi.mock('@/src/lib/apiAuth', () => ({ getAuthenticatedSessionFromRequest: vi.fn() }));
vi.mock('@/src/lib/iapClient', () => ({ getOrderStatus: vi.fn() }));
vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    iapOrder: { upsert: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';
import { prisma } from '@/src/lib/prisma';
import { POST } from './route';

function reqWith(body: object) {
  return new NextRequest('http://localhost/api/iap/grant', {
    method: 'POST', body: JSON.stringify(body),
  });
}

const PREMIUM_SKU = 'ait.0000026455.4d539c9c.1a46e05a7b.1944872484';

describe('POST /api/iap/grant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({ userId: 'u1', userKey: 'k', sessionVersion: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tossUserKey: 'k' } as never);
  });

  it('rejects guests with login_required', async () => {
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue(null as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('login_required');
  });

  it('grants when sku matches and status PURCHASED', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: PREMIUM_SKU, status: 'PURCHASED', statusDeterminedAt: 't', reason: 'ok' } as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect((await res.json()).granted).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { premiumAdFree: true } });
  });

  it('denies on sku mismatch', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: 'other', status: 'PURCHASED', statusDeterminedAt: 't', reason: 'ok' } as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect((await res.json())).toMatchObject({ granted: false, reason: 'sku_mismatch' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('denies when status is REFUNDED', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: PREMIUM_SKU, status: 'REFUNDED', statusDeterminedAt: 't', reason: 'r' } as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect((await res.json()).granted).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run app/api/iap/grant/route.test.ts`
Expected: FAIL — `./route` not found

- [ ] **Step 3: 구현**

`app/api/iap/grant/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';
import { PREMIUM_SKU } from '@/src/lib/iapConfig';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'login_required' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'missing_order_id' }, { status: 400 }));
  }

  // 토스 userKey는 DB에서 로드 (기존 토스 서버 라우트 컨벤션)
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tossUserKey: true },
  });
  if (!user?.tossUserKey) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'login_required' }, { status: 401 }));
  }

  const order = await getOrderStatus(user.tossUserKey, orderId);
  if (!order) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'verify_failed' }, { status: 502 }));
  }
  if (order.sku !== PREMIUM_SKU) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'sku_mismatch' }, { status: 400 }));
  }
  if (order.status !== 'PURCHASED' && order.status !== 'PAYMENT_COMPLETED') {
    return withCors(req, NextResponse.json({ granted: false, reason: order.status }, { status: 200 }));
  }

  await prisma.$transaction([
    prisma.iapOrder.upsert({
      where: { orderId },
      update: {},
      create: { userId: session.userId, orderId, sku: order.sku, status: 'PURCHASED' },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: { premiumAdFree: true },
    }),
  ]);

  return withCors(req, NextResponse.json({ granted: true }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/api/iap/grant/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/iap/grant/route.ts app/api/iap/grant/route.test.ts
git commit -m "feat(iap): /api/iap/grant 서버 검증 지급"
```

---

## Task 7: `GET /api/iap/status`

**Files:**
- Create: `app/api/iap/status/route.ts`

- [ ] **Step 1: 구현**

`app/api/iap/status/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ premium: false }));
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { premiumAdFree: true },
  });
  return withCors(req, NextResponse.json({ premium: user?.premiumAdFree === true }));
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 클린(기존 nit 제외)

- [ ] **Step 3: Commit**

```bash
git add app/api/iap/status/route.ts
git commit -m "feat(iap): /api/iap/status 프리미엄 상태 조회"
```

---

## Task 8: `POST /api/iap/reconcile` (TDD)

**Files:**
- Create: `app/api/iap/reconcile/route.ts`
- Test: `app/api/iap/reconcile/route.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`app/api/iap/reconcile/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/src/lib/cors', () => ({
  corsResponse: () => new Response(null),
  withCors: (_req: unknown, res: Response) => res,
}));
vi.mock('@/src/lib/apiAuth', () => ({ getAuthenticatedSessionFromRequest: vi.fn() }));
vi.mock('@/src/lib/iapClient', () => ({ getOrderStatus: vi.fn() }));
vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    iapOrder: { updateMany: vi.fn(), count: vi.fn() },
  },
}));

import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';
import { prisma } from '@/src/lib/prisma';
import { POST } from './route';

function reqWith(body: object) {
  return new NextRequest('http://localhost/api/iap/reconcile', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/iap/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({ userId: 'u1', userKey: 'k', sessionVersion: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tossUserKey: 'k' } as never);
  });

  it('revokes premium when refunded order leaves no PURCHASED orders', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: 's', status: 'REFUNDED', statusDeterminedAt: 't', reason: 'r' } as never);
    vi.mocked(prisma.iapOrder.count).mockResolvedValue(0 as never);

    const res = await POST(reqWith({ refundedOrderIds: ['o1'] }));
    expect((await res.json()).premium).toBe(false);
    expect(prisma.iapOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o1', userId: 'u1' }, data: expect.objectContaining({ status: 'REFUNDED' }) }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { premiumAdFree: false } });
  });

  it('keeps premium when a PURCHASED order still remains', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: 's', status: 'REFUNDED', statusDeterminedAt: 't', reason: 'r' } as never);
    vi.mocked(prisma.iapOrder.count).mockResolvedValue(1 as never);

    const res = await POST(reqWith({ refundedOrderIds: ['o1'] }));
    expect((await res.json()).premium).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { premiumAdFree: true } });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run app/api/iap/reconcile/route.test.ts`
Expected: FAIL — `./route` not found

- [ ] **Step 3: 구현**

`app/api/iap/reconcile/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const refundedOrderIds: string[] = Array.isArray(body?.refundedOrderIds)
    ? body.refundedOrderIds.filter((x: unknown) => typeof x === 'string')
    : [];

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tossUserKey: true },
  });
  if (!user?.tossUserKey) {
    return withCors(req, NextResponse.json({ premium: false }));
  }

  for (const orderId of refundedOrderIds) {
    const order = await getOrderStatus(user.tossUserKey, orderId);
    if (order?.status === 'REFUNDED') {
      await prisma.iapOrder.updateMany({
        where: { orderId, userId: session.userId },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
    }
  }

  const remaining = await prisma.iapOrder.count({
    where: { userId: session.userId, status: 'PURCHASED' },
  });
  const premium = remaining > 0;
  await prisma.user.update({
    where: { id: session.userId },
    data: { premiumAdFree: premium },
  });

  return withCors(req, NextResponse.json({ premium }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/api/iap/reconcile/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/iap/reconcile/route.ts app/api/iap/reconcile/route.test.ts
git commit -m "feat(iap): /api/iap/reconcile 환불 자동 회수"
```

---

## Task 9: 클라이언트 `src/lib/iap.ts`

**Files:**
- Create: `src/lib/iap.ts`

- [ ] **Step 1: 구현**

`src/lib/iap.ts`:
```ts
'use client';
import { apiFetch } from '@/src/lib/apiClient';
import { PREMIUM_SKU } from '@/src/lib/iapConfig';

async function getIap() {
  try {
    const mod = await import('@apps-in-toss/web-framework');
    return (mod as { IAP?: unknown }).IAP as
      | typeof import('@apps-in-toss/web-framework').IAP
      | undefined;
  } catch {
    return undefined;
  }
}

/** 토스앱 5.219.0+ 에서만 IAP 지원. */
export async function isIapSupported(): Promise<boolean> {
  return (await getIap()) != null;
}

export async function getPremiumProduct() {
  const IAP = await getIap();
  if (!IAP) return null;
  const res = await IAP.getProductItemList();
  return res?.products?.find((p) => p.sku === PREMIUM_SKU) ?? null;
}

async function grantOrder(orderId: string): Promise<boolean> {
  const res = await apiFetch('/api/iap/grant', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
  const json = await res.json().catch(() => ({}));
  return json?.granted === true;
}

export interface PurchaseHandlers {
  onSuccess: () => void;
  onError: (e: unknown) => void;
}

/** 프리미엄 구매. cleanup 함수 반환. */
export async function purchasePremium({ onSuccess, onError }: PurchaseHandlers): Promise<() => void> {
  const IAP = await getIap();
  if (!IAP) {
    onError(new Error('iap_unsupported'));
    return () => {};
  }
  const cleanup = IAP.createOneTimePurchaseOrder({
    options: {
      sku: PREMIUM_SKU,
      processProductGrant: ({ orderId }) => grantOrder(orderId),
    },
    onEvent: (event) => {
      if (event.type === 'success') {
        onSuccess();
        cleanup();
      }
    },
    onError: (e) => {
      onError(e);
      cleanup();
    },
  });
  return cleanup;
}

/** 앱 실행 시: 미결 주문 복원 + 환불 재정합. */
export async function restorePremium(): Promise<void> {
  const IAP = await getIap();
  if (!IAP) return;

  const pending = await IAP.getPendingOrders().catch(() => undefined);
  for (const order of pending?.orders ?? []) {
    if (order.sku && order.sku !== PREMIUM_SKU) continue;
    if (await grantOrder(order.orderId)) {
      await IAP.completeProductGrant({ params: { orderId: order.orderId } }).catch(() => {});
    }
  }

  const completed = await IAP.getCompletedOrRefundedOrders().catch(() => undefined);
  const refundedOrderIds = (completed?.orders ?? [])
    .filter((o) => o.status === 'REFUNDED' && o.sku === PREMIUM_SKU)
    .map((o) => o.orderId);
  if (refundedOrderIds.length > 0) {
    await apiFetch('/api/iap/reconcile', {
      method: 'POST',
      body: JSON.stringify({ refundedOrderIds }),
    });
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 클린. (SDK 타입이 예상과 다르면 `getIap` 반환 타입을 SDK 실제 export에 맞춰 조정 — `IAP` 객체/메서드 시그니처는 스펙 §2 참조)

- [ ] **Step 3: Commit**

```bash
git add src/lib/iap.ts
git commit -m "feat(iap): 클라이언트 IAP SDK 래퍼(구매/복원/지원가드)"
```

---

## Task 10: store 통합 (`isPremium`)

**Files:**
- Modify: `src/store/useStore.ts`

- [ ] **Step 1: 상태/액션 타입 추가**

`StoreState` 인터페이스(43행 부근 `isLoaded: boolean` 근처)에 추가:
```ts
  isPremium: boolean;
  loadPremiumStatus: () => Promise<void>;
```

- [ ] **Step 2: 초기값 추가**

스토어 초기 상태(83행 `isLoaded: false` 근처)에:
```ts
  isPremium: false,
```

- [ ] **Step 3: loadPremiumStatus 구현 + 로그인 로드시 호출**

스토어 액션에 추가:
```ts
  loadPremiumStatus: async () => {
    try {
      const res = await apiFetch('/api/iap/status');
      const json = res.ok ? await res.json() : { premium: false };
      set({ isPremium: json?.premium === true });
    } catch {
      set({ isPremium: false });
    }
  },
```
`loadFromSupabase`의 로그인 성공 분기(110행 `set({ tossUserId: me.userId ... })` 직후)에서 프리미엄 상태/복원을 비동기로 트리거:
```ts
  void get().loadPremiumStatus();
  void import('@/src/lib/iap').then((m) => m.restorePremium()).then(() => get().loadPremiumStatus());
```
(스토어가 `get`을 사용하지 않으면 zustand `set, get` 시그니처 확인 후 `get` 추가)

- [ ] **Step 4: 타입체크 + 회귀 테스트**

Run: `npx tsc --noEmit && npx vitest run src/store/useStore.test.ts`
Expected: 클린 + PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(iap): store isPremium 상태 + 로드/복원 연동"
```

---

## Task 11: UI — 진입 버튼 + 바텀시트 + 프로필 왕관

**Files:**
- Create: `src/components/mypage/PremiumSheet.tsx`
- Modify: `src/tabs/MyPageTab.tsx`, `src/components/mypage/ProfileCard.tsx`

- [ ] **Step 1: PremiumSheet 구현**

`src/components/mypage/PremiumSheet.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Crown, X } from 'lucide-react';
import { useStore } from '@/src/store/useStore';
import { getPremiumProduct, purchasePremium, isIapSupported } from '@/src/lib/iap';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PremiumSheet({ open, onClose }: Props) {
  const isPremium = useStore((s) => s.isPremium);
  const tossUserId = useStore((s) => s.tossUserId);
  const loadPremiumStatus = useStore((s) => s.loadPremiumStatus);

  const [price, setPrice] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setSupported(await isIapSupported());
      const product = await getPremiumProduct();
      if (alive) setPrice(product?.displayAmount ?? null);
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const handleBuy = async () => {
    if (!tossUserId) {
      toast.info('토스 로그인 후 구매할 수 있어요.');
      return;
    }
    setBuying(true);
    await purchasePremium({
      onSuccess: async () => {
        await loadPremiumStatus();
        setBuying(false);
        toast.success('프리미엄이 적용됐어요. 이제 광고 없이 이용하세요!');
        onClose();
      },
      onError: () => {
        setBuying(false);
        toast.error('결제를 완료하지 못했어요.');
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] rounded-t-3xl bg-white p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown size={22} className="text-amber-500" />
            <h2 className="text-lg font-black text-gray-900">평생 광고 제거 프리미엄</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          <li>• AI 분석을 광고 없이 무제한</li>
          <li>• 대량 가져오기를 광고 없이 무제한</li>
          <li>• 한 번 구매하면 평생 유지</li>
        </ul>

        {isPremium ? (
          <div className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-700">
            이미 프리미엄을 이용 중이에요 👑
          </div>
        ) : !supported ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
            현재 토스 앱 버전에서는 구매할 수 없어요. 앱을 업데이트해 주세요.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleBuy}
            disabled={buying}
            className="mt-6 w-full rounded-xl bg-blue-600 py-3.5 text-center font-bold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {buying ? '결제 진행 중…' : price ? `${price} · 구매하기` : '구매하기'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: MyPageTab 헤더에 왕관 진입 버튼(톱니 좌측)**

`src/tabs/MyPageTab.tsx` 수정:
- import 추가:
```ts
import { Settings, Crown } from 'lucide-react';
import PremiumSheet from '@/src/components/mypage/PremiumSheet';
```
- 상태 추가:
```ts
  const [premiumOpen, setPremiumOpen] = useState(false);
  const isPremium = useStore((s) => s.isPremium);
```
- 헤더의 톱니 `<button>` **앞**(좌측)에 왕관 버튼을 넣어 우측 영역을 묶는다. 현재 톱니 버튼(37–44행)을 다음으로 교체:
```tsx
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPremiumOpen(true)}
            aria-label="프리미엄"
            className={`p-2 active:scale-90 transition-all ${isPremium ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}
          >
            <Crown size={22} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="설정 열기"
            className="p-2 -mr-1 text-gray-400 hover:text-gray-600 active:scale-90 transition-all"
          >
            <Settings size={22} />
          </button>
        </div>
```
- `<SettingsSheet ... />` 아래에 추가:
```tsx
      <PremiumSheet open={premiumOpen} onClose={() => setPremiumOpen(false)} />
```

- [ ] **Step 3: ProfileCard 아바타에 프리미엄 왕관 오버레이**

`src/components/mypage/ProfileCard.tsx` 수정:
- import에 `Crown` 추가, 스토어에서 `isPremium` 구독:
```ts
import { User, Crown } from 'lucide-react';
```
```ts
  const isPremium = useStore((s) => s.isPremium);
```
- 아바타 div(15–17행)를 `relative`로 만들고 왕관 오버레이 추가:
```tsx
      <div className="relative w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
        <span className="text-xl font-black text-blue-600">{initial}</span>
        {isPremium && (
          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-white p-0.5 shadow">
            <Crown size={16} className="text-amber-500 fill-amber-400" />
          </span>
        )}
      </div>
```

- [ ] **Step 4: 타입체크 + lint**

Run: `npx tsc --noEmit && npx eslint src/components/mypage/PremiumSheet.tsx src/tabs/MyPageTab.tsx src/components/mypage/ProfileCard.tsx`
Expected: 클린

- [ ] **Step 5: Commit**

```bash
git add src/components/mypage/PremiumSheet.tsx src/tabs/MyPageTab.tsx src/components/mypage/ProfileCard.tsx
git commit -m "feat(iap): 프리미엄 진입 버튼·구매 바텀시트·프로필 왕관 UI"
```

---

## Task 12: 배포 연결 + 전체 검증

**Files:**
- Modify: `scripts/deploy.sh`

- [ ] **Step 1: deploy.sh 마이그레이션 목록에 신규 SQL 추가**

`scripts/deploy.sh`의 `npx prisma db execute` 블록 마지막 줄 다음에 추가(현재 워킹트리 기준, `npx prisma generate` 직전):
```bash
npx prisma db execute --file prisma/manual-migrations/2026-06-20_add_premium_iap.sql --url \"\$DIRECT_URL\"
```

- [ ] **Step 2: 전체 테스트 + 타입체크 + lint**

Run: `npx prisma generate && npx vitest run && npx tsc --noEmit && npx eslint src app`
Expected: 전 테스트 PASS, tsc 클린(기존 `ads.test.ts` nit 제외), eslint(src,app) 클린

- [ ] **Step 3: Commit**

```bash
git add scripts/deploy.sh
git commit -m "ops(iap): deploy.sh에 프리미엄 마이그레이션 SQL 연결"
```

---

## 출시 전 수동 검증 (코드 외)

- [ ] 토스 콘솔에 SKU `ait.0000026455.4d539c9c.1a46e05a7b.1944872484` **비소모성 상품 등록 + 노출 ON**.
- [ ] 샌드박스 필수 시나리오: ① 결제 성공(왕관 표시·게이트 우회 확인) ② 결제 성공+서버 지급 실패(앱 재실행 시 `getPendingOrders` 복원) ③ 에러(취소/네트워크) ④ 환불 후 앱 실행 시 프리미엄 회수.
- [ ] EC2 환경변수 `IAP_PREMIUM_SKU` 설정(미설정 시 코드 기본값 사용).

---

## Self-Review 결과

- **Spec 커버리지**: 데이터모델(T1)·SKU(T2)·게이트(T3,T4)·검증(T5,T6)·상태(T7)·환불(T8)·클라이언트(T9)·store(T10)·UI(T11)·배포(T12) 전 항목 매핑됨.
- **타입 일관성**: `getOrderStatus(tossUserKey, orderId)`·`IapOrderStatusResult`·`PREMIUM_SKU`·`isPremiumUser`·`premiumAdFree` 명칭이 전 태스크에서 일치.
- **미해결(구현 시 확정)**: 프리미엄 시 진입 버튼 표시(현재 amber 강조 유지), `getPremiumProduct` 실패 시 가격 폴백("구매하기"), SDK 타입 시그니처 미세 조정(T9 Step2).
