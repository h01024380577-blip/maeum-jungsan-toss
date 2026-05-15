# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**마음정산 (HeartBook)** — A Korean ceremonial event (경조사) management app for tracking monetary gifts given/received at weddings, funerals, birthdays, etc. Built as an **Apps-in-Toss** mini-app deployed on the Toss platform.

Key features: AI-powered invitation URL parsing (Gemini 2.5 Flash), CSV bulk import, contact management, statistics, Toss social login.

## Commands

- **Dev server:** `npm run dev` (runs `granite dev` — Apps-in-Toss dev wrapper around `next dev`)
- **Build (Next.js full, with API):** `npm run build:next` (runs `prisma generate && next build`) — used on EC2 for the server build
- **Build (Toss AIT bundle):** `npm run build` (runs `granite build` → `npm run build:ait`) — produces the CSR-only client bundle in `dist/web/` for upload to the Toss platform
- **Build (CSR only, manual):** `npm run build:csr` (sets `NEXT_BUILD_CSR=1`)
- **Production server:** `npm run start` (next start, after `build:next`)
- **Lint:** `npm run lint`
- **Tests:** `npx vitest run` (or `npx vitest` for watch mode)
- **Run a single test file:** `npx vitest run src/lib/parseUrl.test.ts`
- **After `npm install`:** `prisma generate` runs automatically via `postinstall`
- **Deploy (full):** `bash scripts/deploy.sh` (git push → SSH into EC2 → `git pull && prisma generate && build:next && pm2 restart` → conditionally rebuild AIT bundle if client files changed)

## Architecture

### Platform: Apps-in-Toss (`@apps-in-toss/web-framework`)

This is **not** a standard Next.js or Vercel app. It's a Toss mini-app configured in `granite.config.ts`. The `granite` CLI wraps Next.js dev/build. The app requests permissions: `CLIPBOARD` (read/write), `CONTACTS` (read).

Stack: **Next.js 16** (App Router) + **React 19** + **Tailwind CSS v4** (`@tailwindcss/postcss`) + **TypeScript 5.8** + **Vitest 4**. Verify API shapes before coding — these are recent major versions.

### Dual-Build Architecture (critical)

The same Next.js codebase produces **two distinct artifacts**, each deployed differently:

1. **Server build (`build:next`)** — full Next.js app including `app/api/*` route handlers. Runs on **EC2** under `pm2` (process name `maeum-jungsan`). Owns Prisma, Gemini, Toss server APIs, cron endpoints. Public host serves both pages and JSON APIs.
2. **AIT CSR bundle (`build:ait`)** — `scripts/build-ait.sh` temporarily moves `app/api` → `app/_api_ait_backup`, sets `NEXT_BUILD_CSR=1`, runs `next build`, then restores `app/api` via a `trap`. This produces a static client bundle in `dist/web/` to upload to Toss via `granite deploy`. The bundle's API calls hit the EC2 host over the network (see `src/lib/apiClient.ts`).

When editing API routes, only the EC2 build needs to redeploy. When editing `src/`, `components/`, `app/**/*.tsx`, `public/`, or `styles/`, both builds need to redeploy — `scripts/deploy.sh` detects this via `git diff HEAD~1` and conditionally rebuilds the AIT bundle.

### Authentication

Three-tier identity system used by all API routes:
1. **JWT Bearer token (priority):** `Authorization: Bearer <token>` header. Issued by `POST /api/auth/toss` after Toss OAuth exchange. Custom HS256 implementation in `src/lib/jwt.ts` (14-day expiry, payload: `{ userId, userKey, sessionVersion }`). Required for CSR/native WebView mode.
2. **Signed cookie fallback:** `toss_auth_token` httpOnly cookie containing the same signed JWT for SSR backwards-compatibility.
3. **Guest / device ID:** `x-user-id` request header, populated by `getUserId()` in `src/store/useStore.ts`. Resolution order: `getDeviceId()` from `@apps-in-toss/web-framework` → `localStorage`.

Server-side helper `src/lib/apiAuth.ts` → `getAuthenticatedUserId()` checks Bearer JWT first, then signed `toss_auth_token`; raw `toss_user_id` / `toss_user_key` cookies are not authentication authority. Auth helpers verify `User.sessionVersion`, and Toss Pay / Messenger routes load `tossUserKey` from the DB by authenticated `userId`.

**Toss OAuth flow** (`app/api/auth/toss/route.ts`): authorizationCode → Toss token endpoint → user info (`userKey`, encrypted `name`) → `decryptField()` in `src/lib/tossApiClient.ts` → DB upsert → issue JWT + set cookies.

### Data Layer: Prisma 6 + PostgreSQL (Supabase)

All persistent data goes through **Prisma 6** (`prisma/schema.prisma`) → PostgreSQL (Supabase Free, `ap-southeast-2`):

- `User` — identified by Toss user key or device ID (cuid primary key)
- `Contact` — belongs to User
- `Event` — the ceremonial event (wedding/funeral/birthday/other), belongs to User + Contact
- `Transaction` — the monetary record (EXPENSE/INCOME), belongs to Event + User

`Event.uiTheme` (`DEFAULT` | `SOLEMN`) controls funeral visual styling. `Event.confidence` (`HIGH`|`MEDIUM`|`LOW`) comes from AI parsing quality.

> **Important:** Prisma 7 is broken on Vercel serverless (missing `.prisma/client/default`). Stay on **Prisma 6**.

The Zustand store method is still named `loadFromSupabase` for historical reasons but it now calls `/api/entries` and `/api/contacts` API routes — there is no Supabase client-side SDK in use.

### State Management

`src/store/useStore.ts` — single Zustand store (no persistence middleware). All CRUD methods are async and call Next.js API routes. The store holds the canonical client-side state: `entries`, `contacts`, `analysisResult`.

`analysisResult` is a sub-object tracking the AI parsing UI state: `{ data, initialData, showBottomSheet, isParsing, selectedImage }`.

### Routing & Pages

Next.js App Router. All tab pages are client components (`'use client'`):

- `app/page.tsx` → `src/tabs/HomeTab.tsx` (AI input, stats summary, Toss login button)
- `app/calendar/page.tsx` → `src/tabs/CalendarTab.tsx`
- `app/history/page.tsx` → `src/tabs/HistoryTab.tsx`
- `app/contacts/page.tsx` → `src/tabs/ContactsTab.tsx`
- `app/stats/page.tsx` → `src/tabs/StatisticsTab.tsx`
- `app/intro/page.tsx` — onboarding screen
- `app/terms/page.tsx` — static terms of service page (server component, no auth required)

`components/Layout.tsx` — mobile-first shell (430px max-width) with bottom tab navigation.

### API Routes

All in `app/api/`:

- `GET|POST|PATCH|DELETE /api/entries` — Event + Transaction CRUD (Prisma)
- `GET|POST|PATCH /api/contacts` — Contact CRUD (Prisma)
- `POST /api/parse-url` — 3-phase AI invitation URL parser (see below)
- `POST /api/analyze` — AI image/text analysis
- `GET|POST /api/events` — Prisma-based events (separate from entries; partially wired)
- `POST /api/auth/toss` — Toss OAuth code exchange → JWT issuance
- `POST /api/payment/create`, `POST /api/payment/execute` — Toss Pay billing flow
- `POST /api/feedback` — user feedback submission (Resend email delivery)
- `POST /api/notification-consent` — toggles `User.notificationsEnabled`
- `POST /api/send-notification`, `POST /api/test-message` — Toss Messenger push helpers (use `src/lib/tossMessengerFetch.ts`)
- `GET /api/cron/event-reminder`, `GET /api/cron/notify` — cron endpoints, **gated by `Authorization: Bearer ${CRON_SECRET}`**. Triggered by EC2 `crontab` running `scripts/cron-event-reminder.sh` (KST 09:00 daily) — not Vercel Cron.

### AI URL Parsing Pipeline (`app/api/parse-url/route.ts`)

3-phase fallback pipeline for extracting event data from Korean invitation URLs:

1. **Phase 1 (og + body):** Server fetches HTML → `cheerio` extracts og metatags + body text → Gemini 2.5 Flash analyzes via `@google/genai` SDK
2. **Phase 2 (Jina Reader):** `r.jina.ai/{url}` fetches JS-rendered text for SPAs → Gemini analyzes
3. **Phase 3 (urlContext):** Gemini's native URL fetch tool as last resort

Returns `{ success, data, confidence: 'high'|'medium'|'low', source }`. Gemini 429/rate-limit errors return `reason: 'rate_limit'` for a user-friendly toast.

Parsing utilities: `src/lib/parseUrl.ts` (cheerio extraction functions), `src/lib/fetchPage.ts` (HTML fetching).

### Testing

Vitest (`vitest.config.ts`). Path alias `@` → project root. Test files live alongside source:
- `src/lib/parseUrl.test.ts` — 13 tests for HTML extraction functions
- `src/lib/fetchPage.test.ts` — 7 tests
- `src/lib/events.test.ts` — 9 tests for Prisma event helpers
- `src/hooks/useEvents.test.ts`

### Key Source Files

Beyond the API routes and tab pages, notable files in `src/`:
- `src/lib/prisma.ts` — singleton PrismaClient (avoid re-instantiation in API routes)
- `src/lib/apiClient.ts` — client-side fetch helper that injects auth headers (JWT/`x-user-id`); use this from `src/` instead of bare `fetch`
- `src/lib/apiAuth.ts` — server-side `getAuthenticatedUserId()` — JWT bearer first, then signed `toss_auth_token` cookie, with `sessionVersion` validation
- `src/lib/jwt.ts` — custom HS256 sign/verify (no library dependency)
- `src/lib/cors.ts` — CORS helpers for cross-origin AIT bundle → EC2 calls
- `src/lib/tossApiClient.ts` — Toss OAuth + `decryptField()` (AES-256-GCM)
- `src/lib/tossAuth.ts` — high-level Toss auth wrapper
- `src/lib/tossPayFetch.ts` — Toss Pay API fetch helpers
- `src/lib/tossMessengerFetch.ts` — Toss Messenger push notification helpers
- `src/lib/events.ts` — Prisma event helper functions (used by `/api/events`)
- `src/hooks/useEvents.ts` — React hook wrapping event CRUD
- `src/utils/csvParser.ts` — CSV parsing for bulk import (uses `papaparse`)
- `src/components/BulkImportModal.tsx` — CSV bulk import UI
- `src/components/ContactDetail.tsx` — contact detail view

### Key Dependencies

- `@google/genai` v1.x — Google GenAI SDK (used in `app/api/parse-url/` and `app/api/analyze/`; note: this is the new SDK, not `@google/generative-ai`)
- `cheerio` — HTML parsing for Phase 1 of the URL pipeline (og tags + body text extraction)
- `@toss/tds-mobile` — Toss Design System mobile components
- `sonner` — toast notification library
- `recharts` — charts used in `StatisticsTab`
- `papaparse` — CSV parsing
- `swr` — client-side data fetching
- `react-calendar` — calendar component in `CalendarTab`
- `framer-motion` / `motion` — animations
- `resend` — email delivery (used by `/api/feedback`)

### Environment Variables

Key variables (see `.env`):
- `DATABASE_URL` — Supabase PostgreSQL pooled connection (port 6543, PgBouncer)
- `DIRECT_URL` — Supabase PostgreSQL session pooler (port 5432, Prisma migrate용)
- `GEMINI_API_KEY` — Server-only Gemini API key (never use `NEXT_PUBLIC_GEMINI_API_KEY` in production)
- `TOSS_DECRYPT_KEY` / `TOSS_DECRYPT_AAD` — AES-256 decryption for Toss auth tokens
- `JWT_SECRET` — HS256 signing key for the custom JWT in `src/lib/jwt.ts`
- `CRON_SECRET` — Bearer token checked by `/api/cron/*` routes; also loaded by `scripts/cron-event-reminder.sh`
- `TOSS_MSG_TEMPLATE_CODE` — Toss Messenger push template ID (event reminder cron returns `no_template_configured` if unset)
- `RESEND_API_KEY` — Resend API key for `/api/feedback` email delivery

### Scripts Directory

- `scripts/deploy.sh` — git push + SSH deploy orchestrator; conditionally rebuilds AIT bundle
- `scripts/build-ait.sh` — CSR bundle builder (moves `app/api` aside via `trap` — see Known Constraints)
- `scripts/cron-event-reminder.sh` — EC2 crontab entry hitting `/api/cron/event-reminder` with `CRON_SECRET`

### Language

UI is entirely in Korean. All user-facing strings, labels, and AI prompts are Korean.

## Known Constraints

- Prisma 6 is pinned — do not upgrade to Prisma 7 (Vercel serverless module resolution bug; same issue observed on Toss/AIT builds)
- `Gemini urlContext` tool is incompatible with `responseMimeType: 'application/json'` — Phase 3 omits the MIME type
- Supabase Direct connection DNS (`db.*.supabase.co`)가 로컬에서 안 풀릴 수 있음 — `DIRECT_URL`은 session pooler 사용
- Build output goes to `dist/` (not `.next/`) — configured via `distDir: 'dist'` in `next.config.ts`
- `scripts/build-ait.sh` deliberately excludes `app/api` from the CSR bundle by moving it aside — if the script crashes before the `trap`, manually restore `app/_api_ait_backup` → `app/api`
- The app runs on **EC2 + pm2**, not Vercel. Don't suggest `vercel deploy`, Vercel Cron, or edge-runtime features — serverless assumptions don't apply
