# 프리미엄(평생 광고 제거) 인앱결제 설계

- **작성일**: 2026-06-20
- **상태**: 승인됨 (구현 계획 작성 예정)
- **대상 기능**: 마음정산 AI 분석 / 대량 가져오기를 평생 광고 없이 이용하는 비소모성(non-consumable) 인앱결제 상품
- **인앱상품 SKU**: `ait.0000026455.4d539c9c.1a46e05a7b.1944872484`

## 1. 배경 & 목표

현재 마음정산은 AI 분석/대량 가져오기 실행 시 리워드 광고를 강제 시청해야 한다(잔고 크레딧 제거 → nonce(REDEEMED→CONSUMED) 1회 허가 모델, 커밋 `33a62e7`). 이번 작업은 **한 번 구매하면 평생 광고 없이** 두 기능을 쓸 수 있는 프리미엄 상품을 앱인토스 인앱결제로 추가한다.

### 핵심 원칙

> 클라이언트의 결제 성공을 **절대 신뢰하지 않는다.** 서버가 mTLS로 토스 주문 상태 API를 검증한 뒤에만 혜택을 지급한다.

이 앱은 이미 mTLS 인증서(`certs/`, `src/lib/tossApiClient.ts`)와 토스 로그인을 보유하여 인앱결제 서버 검증 전제조건을 충족한다.

## 2. 앱인토스 인앱결제 연동 사실 (문서 근거)

- SDK: `@apps-in-toss/web-framework`의 `IAP` 객체 (토스앱 5.219.0+, 미지원 버전 `undefined`).
- 플로우: `getProductItemList()` → `createOneTimePurchaseOrder({ options:{ sku, processProductGrant }, onEvent, onError })` → 복원 `getPendingOrders()` / `completeProductGrant({params:{orderId}})` / `getCompletedOrRefundedOrders({key})`.
- `processProductGrant(({orderId})=>boolean|Promise<boolean>)`: 결제 성공 후 **30초 내** true 반환해야 정상 완료(아니면 환불 안내 페이지).
- 비소모성 = "광고 제거/프리미엄 기능 해제"에 사용하는 영구 권한 상품.
- 기기 변경에도 유지하려면 **토스 로그인 + 서버 상태 조회**를 반드시 연동.
- **서버 주문 상태 조회 API (mTLS, 서버↔서버)**:
  - `POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status`
  - 헤더 `x-toss-user-key`(있으면 해당 유저 주문만), 바디 `{ orderId }`
  - 응답 `{ resultType:'SUCCESS', success:{ orderId, sku, statusDeterminedAt, status, reason } }`
  - `status` enum: `PURCHASED`(완료) · `PAYMENT_COMPLETED`(결제 완료/지급 미완) · `FAILED` · `REFUNDED` · `ORDER_IN_PROGRESS` · `NOT_FOUND` · `MINIAPP_MISMATCH` · `ERROR`
- 출시 전 샌드박스 필수 시나리오: ① 결제 성공 ② 결제 성공+서버 지급 실패(미결 주문 복원) ③ 에러 ④ (권장) 주문 상태 조회 API 검증.

## 3. 결정 사항 (사용자 승인)

| 항목 | 결정 |
| --- | --- |
| 혜택 저장 | `User.premiumAdFree` 불리언 + 신규 `IapOrder` 테이블 (기존 `PaymentOrder`는 미사용/토스페이용이라 미변경) |
| 환불 처리 | **자동 회수** — 앱 실행 시·검증 시 REFUNDED 감지하면 `premiumAdFree=false` |
| 재정합 방식 | 크론 없이 **앱 실행 시 + 지급 시점** 검증 |
| 게스트 구매 | **로그인 유도** — 버튼은 보이되 탭 시 토스 로그인 후 진행 (검증·기기변경 복원에 userKey 필수) |
| 구매 UI | **전용 바텀시트**(PremiumSheet) |
| 진입 버튼 | My탭 헤더 톱니 **좌측**, 왕관 아이콘 버튼 |
| 프리미엄 표시 | 프로필 사진 위치에 금색 왕관 오버레이 |

## 4. 데이터 모델 (Prisma)

```prisma
model User {
  // ...기존 필드
  premiumAdFree Boolean @default(false) // 평생 광고 제거 혜택 활성화 여부
  iapOrders     IapOrder[]
}

model IapOrder {
  id         String         @id @default(cuid())
  userId     String
  orderId    String         @unique   // 앱인토스 주문번호 (uuid v7)
  sku        String
  status     IapOrderStatus @default(PURCHASED)
  grantedAt  DateTime       @default(now())
  refundedAt DateTime?
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

enum IapOrderStatus {
  PURCHASED
  REFUNDED
}
```

- 상수: `PREMIUM_SKU = process.env.IAP_PREMIUM_SKU ?? 'ait.0000026455.4d539c9c.1a46e05a7b.1944872484'`
- `premiumAdFree`의 진실 원천은 서버 `User` 레코드. `IapOrder`는 멱등성·환불 재정합·감사 용도.

## 5. 서버

### 5.1 `src/lib/iapClient.ts`
기존 `fetchWithRetry`(mTLS, `src/lib/tossApiClient.ts`) 재사용.
```ts
getOrderStatus(userKey: string, orderId: string):
  Promise<{ orderId; sku; status; statusDeterminedAt; reason } | null>
```
- `POST {TOSS_API_BASE}/api-partner/v1/apps-in-toss/order/get-order-status`, 헤더 `x-toss-user-key`, 바디 `{orderId}`.
- 네트워크/파싱 실패 시 `null` 반환(지급 거부).

### 5.2 `POST /api/iap/grant` — 혜택 지급 (processProductGrant 서버측)
바디 `{ orderId }`.
1. `getAuthenticatedSession()` → **토스 로그인 세션 필수**. 인증 후 `User.tossUserKey`를 **DB에서 로드**(기존 토스 서버 라우트 컨벤션, JWT 클레임 직접 신뢰 대신). `tossUserKey` 없으면(게스트) 401 `{ reason:'login_required' }`.
2. `getOrderStatus(tossUserKey, orderId)` 호출.
3. 검증: `sku === PREMIUM_SKU` **AND** `status ∈ {PURCHASED, PAYMENT_COMPLETED}`.
   - 불일치/`REFUNDED`/`FAILED`/`NOT_FOUND`/`MINIAPP_MISMATCH` → `{ granted:false, reason }`.
4. `IapOrder` 멱등 upsert(`orderId` unique) + `User.premiumAdFree=true` (idempotent).
5. `{ granted:true }`.

### 5.3 `GET /api/iap/status` — 프리미엄 상태
인증된 사용자의 `{ premium: boolean }` 반환(UI·클라이언트 게이트용). 게스트는 항상 `false`.

### 5.4 `POST /api/iap/reconcile` — 환불 자동 회수
바디 `{ refundedOrderIds: string[] }`.
- 각 `orderId`를 `getOrderStatus`로 재확인하여 `REFUNDED`면 해당 `IapOrder.status=REFUNDED, refundedAt` 기록.
- 사용자에게 남은 `PURCHASED` 주문이 없으면 `premiumAdFree=false`.

### 5.5 광고 게이트 우회 (4곳)
`src/lib/credits.ts`에 헬퍼 추가:
```ts
isPremiumUser(userId: string): Promise<boolean> // SELECT premiumAdFree
```
다음 4개 라우트에서 **nonce 요구 직전** 우회 분기 삽입:
- `app/api/analyze/route.ts` (AI_CREDIT, 텍스트/이미지)
- `app/api/parse-url/route.ts` (AI_CREDIT, URL)
- `app/api/parse-deposit-image/route.ts` (CSV_CREDIT, 입금 이미지)
- `app/api/entries/bulk/route.ts` (CSV_CREDIT, 대량 가져오기)

```ts
if (await isPremiumUser(userId)) {
  // 광고 게이트 통과 — nonce 검증 생략하고 기능 실행
} else {
  // 기존 nonce 검증 (consumeAdPermission)
}
```
프리미엄은 토스 로그인 필수라 게스트가 프리미엄으로 오인될 수 없다.

## 6. 클라이언트

### 6.1 `src/lib/iap.ts`
- `isIapSupported(): boolean` — `IAP` 객체 존재 가드(구버전 토스앱).
- `getPremiumProduct()` — `getProductItemList()`에서 `PREMIUM_SKU` 항목(가격 `displayAmount` 등) 조회.
- `purchasePremium({ onState })` — `createOneTimePurchaseOrder({ options:{ sku:PREMIUM_SKU, processProductGrant: async ({orderId}) => (await apiClient.post('/api/iap/grant',{orderId})).granted }, onEvent, onError })`. cleanup 반환.
- `restorePremium()` — 앱 실행 시:
  1. `getPendingOrders()` → 프리미엄 sku 주문마다 `/api/iap/grant` → granted면 `completeProductGrant({params:{orderId}})`.
  2. `getCompletedOrRefundedOrders()` → `REFUNDED` 수집 → `/api/iap/reconcile`.

### 6.2 store (`src/store/useStore.ts`)
- 상태 `isPremium: boolean`.
- `loadPremiumStatus()` — `GET /api/iap/status` (앱 초기화 시 기존 로드와 함께 hydrate).
- `purchasePremium()` — 성공 후 `isPremium=true`.
- 프리미엄이면 광고 프롬프트(`AdPromptDialog`/`RewardedAdButton`/Home·Bulk 플로우)를 스킵하고 기능 바로 실행.

## 7. UI

### 7.1 My탭 헤더 — 톱니 좌측 진입 버튼
- 왕관(lucide `Crown`) 아이콘 버튼을 `Settings`(톱니) 좌측에 배치.
- 비프리미엄: 탭 → `PremiumSheet` 오픈. 게스트면 토스 로그인 유도 후 진행.
- 프리미엄: 버튼을 "프리미엄" 배지/비활성 상태로 표시(또는 숨김) — 구현 시 확정.

### 7.2 `PremiumSheet` (바텀시트)
- 제목 "평생 광고 제거 프리미엄", 혜택 불릿(AI 분석·대량 가져오기 광고 없이), 가격(`getPremiumProduct().displayAmount`), "구매하기" CTA → `purchasePremium()`.
- 상태: 로딩 / 성공 / 에러 / 이미 이용 중 / IAP 미지원(구버전 안내).

### 7.3 프로필 왕관
- `① 프로필` 섹션 아바타 위치에 프리미엄이면 금색 왕관 아이콘 오버레이.

## 8. 보안 속성

- 서버 mTLS 검증 후에만 지급(클라이언트 `processProductGrant` 단독 신뢰 금지).
- `x-toss-user-key`로 주문↔사용자 결속(타인 주문 지급 불가).
- `IapOrder.orderId` unique로 멱등(중복 지급 차단).
- SKU 핀으로 타 상품/`MINIAPP_MISMATCH` 거부.
- 환불 자동 회수.
- 게스트는 프리미엄 보유 불가(토스 로그인 필수).

## 9. 테스트 (vitest, 기존 패턴)

- `iapClient` 상태 매핑: `PURCHASED`/`PAYMENT_COMPLETED`→지급, `REFUNDED`/`FAILED`/`NOT_FOUND`/`MINIAPP_MISMATCH`→거부.
- `/api/iap/grant`: sku 불일치 거부 · 타인 주문 거부 · 멱등 · 게스트 `login_required`.
- `isPremiumUser` 게이트 우회: 4개 라우트에서 프리미엄이면 nonce 없이 통과.
- `/api/iap/reconcile`: REFUNDED → `premiumAdFree=false`.
- 샌드박스 수동 체크리스트(문서 필수 4종).

## 10. 배포 / 마이그레이션

- 신규 멱등 SQL: `User.premiumAdFree` 컬럼 추가 + `IapOrder` 테이블 + `IapOrderStatus` enum 생성(`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` / enum 멱등).
- `scripts/deploy.sh`의 `db execute` 목록에 연결(매 배포 재실행 안전 — 크레딧 마이그레이션과 동일 패턴).
- env `IAP_PREMIUM_SKU`(기본값 = 위 SKU).
- **토스 콘솔**: 해당 SKU 비소모성 상품 등록 + 노출 ON + 샌드박스 테스트(출시 전제).

## 11. 영향 범위 (파일)

- 신규: `prisma/manual-migrations/2026-06-20_add_premium_iap.sql`, `src/lib/iapClient.ts`, `src/lib/iap.ts`, `app/api/iap/grant/route.ts`, `app/api/iap/status/route.ts`, `app/api/iap/reconcile/route.ts`, `src/components/mypage/PremiumSheet.tsx`, 관련 테스트.
- 수정: `prisma/schema.prisma`, `src/lib/credits.ts`(`isPremiumUser`), 4개 게이트 라우트, `src/store/useStore.ts`, `src/tabs/MyPageTab.tsx`, `scripts/deploy.sh`.

## 12. 미해결/구현 시 확정

- 프리미엄 상태일 때 진입 버튼 표시(배지 vs 숨김).
- `getProductItemList` 실패 시 가격 폴백 문구.
- 토스 로그인 유도 UX(기존 로그인 진입점 재사용).
