# Critical Risk Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the highest-risk auth/session, ad reward, and payment trust-boundary issues found in the Nexus review.

**Architecture:** Fix the smallest user-visible/session bug first, then move the auth boundary to signed credentials only, add revocation, harden ad reward redemption, and finally persist payment orders server-side. Each task is independently verifiable and must be approved before execution.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 6, Vitest, Zustand, Apps-in-Toss Web Framework.

---

## Execution Gates

No task starts until the user explicitly approves that task. After each task:
- Run the task-specific tests.
- Run `npm run lint`.
- Report changed files, verification output, and residual risk.
- Wait for approval before continuing.

## Task 1: Real Logout And Local State Cleanup

**Risk handled:** Frontend logout only clears local Zustand/localStorage state and does not call `/api/auth/logout`, so httpOnly cookies can keep the user logged in.

**Files:**
- Modify: `src/store/useStore.ts`
- Modify: `src/components/mypage/SettingsSheet.tsx`
- Test: `src/store/useStore.test.ts`

- [x] **Step 1: Add a focused store test for clearData reset**

Create or extend `src/store/useStore.test.ts` with assertions that `clearData()` clears auth-visible state, credits, and analysis state.

Expected key assertions:
```ts
expect(state.tossUserId).toBeNull();
expect(state.tossUserName).toBeNull();
expect(state.notificationsEnabled).toBe(false);
expect(state.credits.loaded).toBe(false);
expect(state.credits.ai.balance).toBe(0);
expect(state.analysisResult.data).toBeNull();
expect(state.analysisResult.showBottomSheet).toBe(false);
```

- [x] **Step 2: Run the new test and confirm it fails**

Run:
```bash
npx vitest run src/store/useStore.test.ts
```

Expected: failure because `clearData()` currently does not reset `credits` or `analysisResult`.

- [x] **Step 3: Update `clearData()` to reset all auth-scoped local state**

In `src/store/useStore.ts`, update `clearData()` so it clears:
- local auth token via `clearAuthToken()`
- `entries`, `contacts`, `feedback`
- `tossUserId`, `tossUserName`, `notificationsEnabled`
- `credits` back to initial unloaded state
- `analysisResult` back to empty state

- [x] **Step 4: Make settings logout call the server**

In `src/components/mypage/SettingsSheet.tsx`, change `handleLogoutConfirm` to async:
```ts
const handleLogoutConfirm = async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Local cleanup still proceeds so the device is not stuck logged in.
  }
  clearData();
  try {
    localStorage.removeItem('heartbook-onboarding-seen');
  } catch {}
  setLogoutOpen(false);
  onClose();
  router.replace('/');
};
```

- [x] **Step 5: Verify Task 1**

Run:
```bash
npx vitest run src/store/useStore.test.ts
npm run lint
```

Expected: store test passes; lint has no new errors.

## Task 2: Stop Trusting Raw `toss_user_id` / `toss_user_key` Cookies

**Risk handled:** Unsigned raw cookies are currently treated as authentication.

**Files:**
- Modify: `src/lib/jwt.ts`
- Modify: `src/lib/apiAuth.ts`
- Modify: `src/lib/credits.ts`
- Modify: `app/api/auth/toss/route.ts`
- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/auth/logout/route.ts`
- Modify: `app/api/payment/create/route.ts`
- Modify: `app/api/payment/execute/route.ts`
- Modify: `app/api/send-notification/route.ts`
- Modify: `app/api/test-message/route.ts`
- Test: `src/lib/jwt.test.ts`

- [x] **Step 1: Add signed auth trust-boundary tests**

Add tests covering:
- valid HS256 token verifies
- expired token returns null
- wrong algorithm returns null
- malformed token returns null

- [x] **Step 2: Add signed auth cookie support**

Keep `Authorization: Bearer <jwt>` as priority. Add `toss_auth_token` httpOnly cookie as the only cookie fallback. Do not accept raw `toss_user_id` or `toss_user_key` as authority.

- [x] **Step 3: Change login cookie issuance**

In `app/api/auth/toss/route.ts`, set:
```ts
res.cookies.set('toss_auth_token', token, cookieOpts);
res.cookies.delete('toss_user_id');
res.cookies.delete('toss_user_key');
```

- [x] **Step 4: Change auth helpers and route callers**

Make route code derive `userId`/`userKey` only from verified JWT payload. For payment and messaging routes, load `tossUserKey` from DB by authenticated `userId` instead of trusting a cookie-supplied `userKey`.

- [x] **Step 5: Verify Task 2**

Run:
```bash
npx vitest run src/lib/jwt.test.ts src/lib/credits.test.ts
npm run lint
```

Expected: auth tests pass; routes compile under lint.

## Task 3: Add JWT Revocation On Logout/Unlink

**Risk handled:** A valid JWT remains usable for 14 days after logout or Toss unlink.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/manual-migrations/2026-05-15_add_user_session_version.sql`
- Modify: `src/lib/jwt.ts`
- Modify: `src/lib/apiAuth.ts`
- Modify: `src/lib/credits.ts`
- Modify: `app/api/auth/toss/route.ts`
- Modify: `app/api/auth/logout/route.ts`
- Modify: `app/api/auth/unlink/route.ts`
- Test: `src/lib/jwt.test.ts`

- [x] **Step 1: Add schema field and manual migration**

Add `sessionVersion Int @default(0)` to `User`.

Migration:
```sql
BEGIN;
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
COMMIT;
```

- [x] **Step 2: Include `sessionVersion` in JWT**

Change `signJwt` payload from `{ userId, userKey }` to `{ userId, userKey, sessionVersion }`.

- [x] **Step 3: Verify session version in auth helpers**

After JWT signature verification, fetch `User.sessionVersion`; reject if it differs from JWT payload.

- [x] **Step 4: Bump session version on logout/unlink**

On logout and unlink, increment `sessionVersion` and clear Toss tokens.

- [x] **Step 5: Verify Task 3**

Run:
```bash
npx vitest run src/lib/jwt.test.ts src/lib/credits.test.ts
npm run lint
```

Expected: old-version token is rejected by helper tests; lint passes.

## Task 4: Harden Ad Reward Redemption

**Risk handled:** Reward redemption can be called without server-side ad proof and has a same-nonce race window.

**Files:**
- Modify: `app/api/credits/ad-nonce/route.ts`
- Modify: `app/api/credits/ad-redeem/route.ts`
- Modify: `src/lib/credits.ts`
- Test: `app/api/credits/ad-redeem/route.test.ts`

- [x] **Step 1: Add failing tests for single-use nonce**

Mock Prisma transaction so the first redeem marks a nonce consumed and the second receives `nonce_already_used`.

- [x] **Step 2: Validate ad group IDs**

Allow only configured `NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT` and `NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT`, plus test IDs outside production.

- [x] **Step 3: Atomically claim the nonce before incrementing credits**

Use an atomic conditional update:
```ts
const claim = await tx.adRewardGrant.updateMany({
  where: {
    rewardNonce: nonce,
    userId,
    status: 'ISSUED',
    expiresAt: { gt: new Date() },
  },
  data: { status: 'REDEEMED', redeemedAt: new Date() },
});
if (claim.count !== 1) throw new Error('nonce_already_used');
```

Then read the grant and increment credits.

- [x] **Step 4: Add abuse controls**

Keep daily limit enforcement inside the redeem transaction and consider per-user active nonce limit so repeated nonce creation cannot flood `AdRewardGrant`.

- [x] **Step 5: Verify Task 4**

Run:
```bash
npx vitest run app/api/credits/ad-redeem/route.test.ts src/lib/credits.test.ts
npm run lint
```

Expected: same nonce cannot grant twice; lint passes.

## Task 5: Persist And Validate Payment Orders

**Risk handled:** Payment create/execute trusts client-supplied amount/order values and has no server order state.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/manual-migrations/2026-05-15_add_payment_order.sql`
- Modify: `app/api/payment/create/route.ts`
- Modify: `app/api/payment/execute/route.ts`
- Test: `app/api/payment/payment.test.ts`

- [x] **Step 1: Add `PaymentOrder` model**

Fields:
- `id`
- `userId`
- `orderNo @unique`
- `payToken`
- `amount`
- `productDesc`
- `status` enum or string values: `CREATED`, `EXECUTED`, `FAILED`
- `createdAt`, `executedAt`

- [x] **Step 2: Validate create input**

Reject non-integer or out-of-range `amount`; cap `productDesc` length; create the server order before returning `payToken`.

- [x] **Step 3: Validate execute input**

Find order by `{ orderNo, userId, status: 'CREATED' }`, ensure `payToken` matches, call Toss execute, then mark executed or failed.

- [x] **Step 4: Verify Task 5**

Run:
```bash
npx vitest run app/api/payment/payment.test.ts
npm run lint
```

Expected: wrong user/order/payToken is rejected; valid order executes once.
