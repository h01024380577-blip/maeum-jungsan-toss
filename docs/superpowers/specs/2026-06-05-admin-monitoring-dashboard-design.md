# Admin Monitoring Dashboard Design

## Purpose

Build an internal monitoring dashboard that helps the operator confirm whether real users are saving records in the 마음정산 database. The dashboard is for operational visibility, not user investigation. It must show aggregate service activity without exposing names, phone numbers, memos, accounts, raw amounts, user IDs, Toss user keys, guest device IDs, or individual event details.

## Approved Direction

Use an internal web dashboard:

- Page: `/admin/monitoring`
- API: `/api/admin/monitoring`
- Auth: `Authorization: Bearer <CRON_SECRET>` using the existing cron-secret trust boundary
- Refresh: client-side polling, default 30 seconds
- Data: aggregate counts and distributions only

This approach was chosen over a terminal-only monitor because repeated operational checks are easier in a browser. It was chosen over API-only monitoring because the user asked for a program, not only an endpoint.

## Security Model

The dashboard metrics API is the data security boundary. API access requires `CRON_SECRET` Bearer authentication via the existing `isCronRequestAuthorized` helper.

The dashboard page shell may render without a Bearer header because normal browser navigation cannot conveniently attach one. That shell must not contain metrics, secrets, or DB-derived data. It only shows the token form until the operator provides a token and the protected API returns aggregate metrics.

The dashboard page should not embed `CRON_SECRET` in the bundle or expose it through any `NEXT_PUBLIC_*` variable. The operator enters the token in the page. The page stores it only in browser session state, preferably `sessionStorage`, so refreshes are convenient but the token is not persisted long-term.

The API returns only aggregate metrics. It must not return:

- `User.id`
- `tossUserKey`
- `guestDeviceId`
- user names
- contact names or phone numbers
- event memos
- account values
- source URLs
- individual transaction amounts

Error responses must be categorical. For example, return `unauthorized` for auth failures and `db_error` for database query failures. Do not return database URLs, raw Prisma errors, or stack traces.

## Dashboard Metrics

The dashboard shows these aggregate metrics:

- Total users
- Total events
- Total transactions
- Users with at least one event
- Latest event timestamp and user kind (`toss`, `guest`, or `unknown`)
- Recent event counts and distinct saving-user counts for:
  - 10 minutes
  - 1 hour
  - 6 hours
  - 24 hours
  - 7 days
- Last 24 hours user-kind distribution:
  - Toss users
  - Guest users
  - Unknown users
- Last 24 hours transaction source distribution:
  - `MANUAL`
  - `URL`
  - `OCR`
  - `SMS_PASTE`
  - `CSV`
- Last 24 hours hourly event trend
- Query status:
  - last successful refresh time
  - current API status
  - query latency in milliseconds measured around the monitoring helper call

All timestamps displayed in the UI should be user-friendly for the operator. Korea Standard Time is acceptable because the project and operator context are Korean.

## Data Flow

1. Operator opens `/admin/monitoring`.
2. Page asks for the operations token and renders no metrics before successful API authentication.
3. Page calls `/api/admin/monitoring` with `Authorization: Bearer <token>`.
4. API validates the token with `isCronRequestAuthorized`.
5. API queries Prisma aggregate data from `User`, `Event`, and `Transaction`.
6. API returns a privacy-safe JSON payload.
7. Page renders summary cards, distributions, and trend sections.
8. Page repeats the API call every 30 seconds while polling is enabled.

The shared metric construction should live in a small server-side helper such as `src/lib/adminMonitoring.ts`, so API tests can exercise the core behavior without coupling every assertion to route plumbing.

## UI Structure

The dashboard should be compact and operational, not marketing-style.

Top section:

- Title: `운영 모니터링`
- Auth status
- Last refreshed time
- Manual refresh button
- Auto-refresh toggle
- Refresh interval label

Main cards:

- Recent 10-minute saves
- Recent 1-hour saves
- Recent 24-hour saves
- Recent 24-hour saving users
- Total users
- Users with records
- Total records
- Latest save

Secondary sections:

- 24-hour hourly save trend
- Save source distribution
- Toss/Guest distribution
- System/API status

The page copy should be Korean, consistent with the rest of the app. Visual design should be restrained and utilitarian because this is an internal operations page.

## Error Handling

Authentication failure:

- API returns `401`.
- Page clears or ignores the saved token.
- Page hides metrics and shows the token input again.

Database or server failure:

- API returns a safe `503` response with `error: "db_error"`.
- Page keeps the last successful metrics visible if available.
- Page shows an error banner with the failed refresh time and a generic message.

Network failure:

- Page keeps the last successful metrics visible if available.
- Page shows an offline or request-failed state.
- Polling continues unless the operator disables it.

Empty data:

- Counts render as `0`.
- Latest save renders as `없음`.
- Distribution and trend sections show empty states rather than crashing.

## Testing Plan

Add focused tests for the server-side helper and API route.

Helper tests:

- returns zero-count metrics when there are no users, events, or transactions
- counts total users, total events, total transactions, and users with records
- counts recent windows independently
- classifies latest event user kind as `toss`, `guest`, or `unknown`
- groups transaction sources for the last 24 hours
- builds a 24-hour hourly trend without exposing row-level data

API route tests:

- rejects missing or wrong Bearer token with `401`
- returns metrics for a valid `CRON_SECRET`
- returns a safe `503` body when the monitoring helper throws
- does not expose raw error details in failure responses

Build checks:

- Run targeted Vitest tests for the new helper and route.
- Run `npm run lint`.
- Run `npm run build:next` because this adds a server API and App Router page.
- Run `npm run build` only if the final implementation affects the Toss CSR bundle or the repository build setup requires validating all app routes together.

## Deployment Impact

This is a server/admin feature. It affects the Next.js server build and EC2 deployment. It should not add user-facing Toss mini-app behavior and should not require schema changes.

The feature depends on existing environment variables:

- `DATABASE_URL`
- `DIRECT_URL` as already configured for Prisma
- `CRON_SECRET`

No new secret is required for the approved first version.

## Out Of Scope

- User-level investigation screens
- Displaying raw records
- Displaying names, phone numbers, memos, account values, user IDs, Toss keys, or guest device IDs
- Alerts or notifications
- Long-term metric storage
- Admin user role management
- Supabase schema changes
- Realtime subscriptions

## Open Implementation Notes

Use Prisma aggregate and group queries carefully so the endpoint remains cheap enough for 30-second polling. If a single query shape becomes awkward, prefer several simple aggregate queries in parallel over a large raw SQL query unless performance evidence says otherwise.

Keep the API payload stable and typed. The page should render from that payload without importing Prisma types into client code.
