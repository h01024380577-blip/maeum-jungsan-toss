# Admin Monitoring Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CRON_SECRET-protected internal dashboard that shows privacy-safe aggregate DB activity for 마음정산 users.

**Architecture:** Put all DB aggregation in a server-only helper, expose it through `/api/admin/monitoring`, and render `/admin/monitoring` as a client dashboard that asks the operator for the token before fetching metrics. The API is the security boundary; the page shell contains no metrics or secrets before a successful API response.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Prisma 6, Vitest, Tailwind CSS utilities.

---

## File Structure

- Create `src/lib/adminMonitoringTypes.ts`
  - Shared type definitions and constants for the monitoring payload.
  - Must not import Prisma or any server-only module so client components can import types safely.
- Create `src/lib/adminMonitoring.ts`
  - Server-only Prisma aggregation helper.
  - Depends on `src/lib/prisma`.
  - Returns only aggregate metrics defined in `adminMonitoringTypes.ts`.
- Create `src/lib/adminMonitoring.test.ts`
  - Unit tests for the aggregation helper using an in-memory fake DB delegate.
- Create `app/api/admin/monitoring/route.ts`
  - Protected GET endpoint.
  - Uses `isCronRequestAuthorized`.
  - Returns `{ ok: true, metrics }` or safe categorical errors.
- Create `app/api/admin/monitoring/route.test.ts`
  - Route tests for auth failure, success, and safe DB error handling.
- Create `src/components/admin/MonitoringDashboard.tsx`
  - Client dashboard UI.
  - Stores the entered token in `sessionStorage`.
  - Polls the protected API every 30 seconds while enabled.
  - Renders no metrics until the API authenticates successfully.
- Create `src/components/admin/MonitoringDashboard.test.tsx`
  - Server-render smoke test proving the initial shell shows the token form and no metrics.
- Create `app/admin/monitoring/page.tsx`
  - App Router page that renders `MonitoringDashboard`.

---

### Task 1: Server Metrics Helper Test Skeleton

**Files:**
- Create: `src/lib/adminMonitoring.test.ts`
- Create in Task 2: `src/lib/adminMonitoringTypes.ts`
- Create in Task 2: `src/lib/adminMonitoring.ts`

- [ ] **Step 1: Write the failing zero-data helper test**

Create `src/lib/adminMonitoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MONITORING_WINDOWS,
  buildAdminMonitoringMetrics,
  type AdminMonitoringDb,
  type MonitoringTransactionSource,
} from './adminMonitoring';

type FakeUser = {
  id: string;
  tossUserKey?: string | null;
  guestDeviceId?: string | null;
};

type FakeEvent = {
  id: string;
  userId: string;
  createdAt: Date;
};

type FakeTransaction = {
  id: string;
  eventId: string;
  userId: string;
  source: MonitoringTransactionSource;
  createdAt: Date;
};

function createdAtGte(args: unknown): Date | null {
  if (!args || typeof args !== 'object') return null;
  const where = (args as { where?: { createdAt?: { gte?: Date } } }).where;
  return where?.createdAt?.gte instanceof Date ? where.createdAt.gte : null;
}

function afterGte<T extends { createdAt: Date }>(rows: T[], gte: Date | null): T[] {
  if (!gte) return rows;
  return rows.filter((row) => row.createdAt >= gte);
}

function makeDb({
  users = [],
  events = [],
  transactions = [],
}: {
  users?: FakeUser[];
  events?: FakeEvent[];
  transactions?: FakeTransaction[];
} = {}): AdminMonitoringDb {
  const userById = new Map(users.map((user) => [user.id, user]));

  return {
    user: {
      count: async () => users.length,
    },
    event: {
      count: async (args?: unknown) => afterGte(events, createdAtGte(args)).length,
      findFirst: async () => {
        const latest = [...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        if (!latest) return null;
        const user = userById.get(latest.userId) ?? null;
        return {
          createdAt: latest.createdAt,
          user: user
            ? {
                tossUserKey: user.tossUserKey ?? null,
                guestDeviceId: user.guestDeviceId ?? null,
              }
            : null,
        };
      },
      findMany: async (args?: unknown) => {
        const filtered = afterGte(events, createdAtGte(args));
        const query = args as {
          distinct?: string[];
          select?: {
            userId?: boolean;
            createdAt?: boolean;
            user?: { select: { tossUserKey: boolean; guestDeviceId: boolean } };
          };
        } | undefined;

        const rows = query?.distinct?.includes('userId')
          ? Array.from(new Map(filtered.map((event) => [event.userId, event])).values())
          : filtered;

        return rows.map((event) => {
          const selected: Record<string, unknown> = {};
          if (query?.select?.userId) selected.userId = event.userId;
          if (query?.select?.createdAt) selected.createdAt = event.createdAt;
          if (query?.select?.user) {
            const user = userById.get(event.userId) ?? null;
            selected.user = user
              ? {
                  tossUserKey: user.tossUserKey ?? null,
                  guestDeviceId: user.guestDeviceId ?? null,
                }
              : null;
          }
          return selected;
        });
      },
    },
    transaction: {
      count: async () => transactions.length,
      groupBy: async (args?: unknown) => {
        const filtered = afterGte(transactions, createdAtGte(args));
        const counts = new Map<MonitoringTransactionSource, number>();
        for (const transaction of filtered) {
          counts.set(transaction.source, (counts.get(transaction.source) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([source, count]) => ({
          source,
          _count: { _all: count },
        }));
      },
    },
  };
}

describe('buildAdminMonitoringMetrics', () => {
  it('returns zero-count metrics without exposing row-level data when the database is empty', async () => {
    const now = new Date('2026-06-05T01:50:00.000Z');

    const metrics = await buildAdminMonitoringMetrics(makeDb(), now);

    expect(metrics.checkedAt).toBe('2026-06-05T01:50:00.000Z');
    expect(metrics.totals).toEqual({
      users: 0,
      events: 0,
      transactions: 0,
      usersWithEvents: 0,
    });
    expect(metrics.latestEvent).toEqual({ createdAt: null, userKind: 'unknown' });
    expect(metrics.recent).toEqual(
      MONITORING_WINDOWS.map((window) => ({
        key: window.key,
        label: window.label,
        since: new Date(now.getTime() - window.ms).toISOString(),
        events: 0,
        users: 0,
      })),
    );
    expect(metrics.last24hUserKinds).toEqual({
      tossUsers: 0,
      guestUsers: 0,
      unknownUsers: 0,
    });
    expect(metrics.last24hTransactionSources).toEqual([]);
    expect(metrics.last24hHourlyEvents).toHaveLength(24);
    expect(metrics.last24hHourlyEvents.every((point) => point.events === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/lib/adminMonitoring.test.ts
```

Expected: FAIL because `./adminMonitoring` does not exist.

---

### Task 2: Minimal Server Metrics Helper

**Files:**
- Create: `src/lib/adminMonitoringTypes.ts`
- Create: `src/lib/adminMonitoring.ts`
- Test: `src/lib/adminMonitoring.test.ts`

- [ ] **Step 1: Add shared payload types**

Create `src/lib/adminMonitoringTypes.ts`:

```ts
export const MONITORING_WINDOWS = [
  { key: 'm10', label: '최근 10분', ms: 10 * 60 * 1000 },
  { key: 'h1', label: '최근 1시간', ms: 60 * 60 * 1000 },
  { key: 'h6', label: '최근 6시간', ms: 6 * 60 * 60 * 1000 },
  { key: 'h24', label: '최근 24시간', ms: 24 * 60 * 60 * 1000 },
  { key: 'd7', label: '최근 7일', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export const MONITORING_TRANSACTION_SOURCES = [
  'MANUAL',
  'URL',
  'OCR',
  'SMS_PASTE',
  'CSV',
] as const;

export type MonitoringWindowKey = (typeof MONITORING_WINDOWS)[number]['key'];
export type MonitoringTransactionSource = (typeof MONITORING_TRANSACTION_SOURCES)[number];
export type MonitoringUserKind = 'toss' | 'guest' | 'unknown';

export interface MonitoringWindowMetric {
  key: MonitoringWindowKey;
  label: string;
  since: string;
  events: number;
  users: number;
}

export interface MonitoringHourlyEventPoint {
  hourStart: string;
  events: number;
}

export interface AdminMonitoringMetrics {
  checkedAt: string;
  latencyMs: number;
  totals: {
    users: number;
    events: number;
    transactions: number;
    usersWithEvents: number;
  };
  latestEvent: {
    createdAt: string | null;
    userKind: MonitoringUserKind;
  };
  recent: MonitoringWindowMetric[];
  last24hUserKinds: {
    tossUsers: number;
    guestUsers: number;
    unknownUsers: number;
  };
  last24hTransactionSources: Array<{
    source: MonitoringTransactionSource;
    count: number;
  }>;
  last24hHourlyEvents: MonitoringHourlyEventPoint[];
}
```

- [ ] **Step 2: Add the minimal helper implementation**

Create `src/lib/adminMonitoring.ts`:

```ts
import { prisma } from '@/src/lib/prisma';
import {
  MONITORING_TRANSACTION_SOURCES,
  MONITORING_WINDOWS,
  type AdminMonitoringMetrics,
  type MonitoringTransactionSource,
  type MonitoringUserKind,
} from './adminMonitoringTypes';

export {
  MONITORING_TRANSACTION_SOURCES,
  MONITORING_WINDOWS,
  type AdminMonitoringMetrics,
  type MonitoringTransactionSource,
  type MonitoringUserKind,
} from './adminMonitoringTypes';

type MonitoringUserShape = {
  tossUserKey: string | null;
  guestDeviceId: string | null;
} | null;

type EventRowWithUser = {
  user?: MonitoringUserShape;
};

type EventCreatedAtRow = {
  createdAt: Date;
};

type SourceGroupRow = {
  source: MonitoringTransactionSource;
  _count: { _all: number };
};

export interface AdminMonitoringDb {
  user: {
    count(args?: unknown): Promise<number>;
  };
  event: {
    count(args?: unknown): Promise<number>;
    findFirst(args?: unknown): Promise<(EventCreatedAtRow & EventRowWithUser) | null>;
    findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
  };
  transaction: {
    count(args?: unknown): Promise<number>;
    groupBy(args?: unknown): Promise<SourceGroupRow[]>;
  };
}

const HOUR_MS = 60 * 60 * 1000;

function classifyUserKind(user: MonitoringUserShape): MonitoringUserKind {
  if (user?.tossUserKey) return 'toss';
  if (user?.guestDeviceId) return 'guest';
  return 'unknown';
}

function startOfHour(date: Date): Date {
  const hour = new Date(date);
  hour.setUTCMinutes(0, 0, 0);
  return hour;
}

function buildEmptyHourlyEvents(now: Date) {
  const currentHour = startOfHour(now).getTime();
  return Array.from({ length: 24 }, (_, index) => ({
    hourStart: new Date(currentHour - (23 - index) * HOUR_MS).toISOString(),
    events: 0,
  }));
}

async function countDistinctEventUsers(db: AdminMonitoringDb, where?: unknown): Promise<number> {
  const rows = await db.event.findMany({
    where,
    distinct: ['userId'],
    select: { userId: true },
  });
  return rows.length;
}

export async function buildAdminMonitoringMetrics(
  db: AdminMonitoringDb = prisma as unknown as AdminMonitoringDb,
  now = new Date(),
): Promise<AdminMonitoringMetrics> {
  const startedAt = Date.now();
  const checkedAt = now.toISOString();
  const [
    totalUsers,
    totalEvents,
    totalTransactions,
    usersWithEvents,
    latestEvent,
    recent,
  ] = await Promise.all([
    db.user.count(),
    db.event.count(),
    db.transaction.count(),
    countDistinctEventUsers(db),
    db.event.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        user: { select: { tossUserKey: true, guestDeviceId: true } },
      },
    }),
    Promise.all(
      MONITORING_WINDOWS.map(async (window) => {
        const since = new Date(now.getTime() - window.ms);
        const where = { createdAt: { gte: since } };
        const [events, users] = await Promise.all([
          db.event.count({ where }),
          countDistinctEventUsers(db, where),
        ]);
        return {
          key: window.key,
          label: window.label,
          since: since.toISOString(),
          events,
          users,
        };
      }),
    ),
  ]);

  return {
    checkedAt,
    latencyMs: Math.max(0, Date.now() - startedAt),
    totals: {
      users: totalUsers,
      events: totalEvents,
      transactions: totalTransactions,
      usersWithEvents,
    },
    latestEvent: {
      createdAt: latestEvent?.createdAt?.toISOString() ?? null,
      userKind: classifyUserKind(latestEvent?.user ?? null),
    },
    recent,
    last24hUserKinds: {
      tossUsers: 0,
      guestUsers: 0,
      unknownUsers: 0,
    },
    last24hTransactionSources: [],
    last24hHourlyEvents: buildEmptyHourlyEvents(now),
  };
}

export async function getAdminMonitoringMetrics(
  db: AdminMonitoringDb = prisma as unknown as AdminMonitoringDb,
  now = new Date(),
): Promise<AdminMonitoringMetrics> {
  return buildAdminMonitoringMetrics(db, now);
}
```

- [ ] **Step 3: Run the helper test to verify it passes**

Run:

```bash
npx vitest run src/lib/adminMonitoring.test.ts
```

Expected: PASS with the zero-data test passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/adminMonitoringTypes.ts src/lib/adminMonitoring.ts src/lib/adminMonitoring.test.ts
git commit -m "feat(monitoring): add admin metrics helper"
```

---

### Task 3: Complete Server Metrics Coverage

**Files:**
- Modify: `src/lib/adminMonitoring.test.ts`
- Modify: `src/lib/adminMonitoring.ts` only if the test exposes an aggregation defect

- [ ] **Step 1: Add the failing populated-data helper test**

Append this test inside the existing `describe('buildAdminMonitoringMetrics', () => { ... })` block in `src/lib/adminMonitoring.test.ts`:

```ts
  it('aggregates recent windows, user kinds, sources, and hourly trend without returning identifiers', async () => {
    const now = new Date('2026-06-05T01:50:00.000Z');
    const db = makeDb({
      users: [
        { id: 'user-toss', tossUserKey: '12345', guestDeviceId: null },
        { id: 'user-guest', tossUserKey: null, guestDeviceId: 'guest-device' },
        { id: 'user-unknown', tossUserKey: null, guestDeviceId: null },
      ],
      events: [
        { id: 'event-latest', userId: 'user-toss', createdAt: new Date('2026-06-05T01:45:00.000Z') },
        { id: 'event-guest', userId: 'user-guest', createdAt: new Date('2026-06-05T00:30:00.000Z') },
        { id: 'event-toss-old', userId: 'user-toss', createdAt: new Date('2026-06-04T20:00:00.000Z') },
        { id: 'event-week', userId: 'user-unknown', createdAt: new Date('2026-06-03T12:00:00.000Z') },
      ],
      transactions: [
        {
          id: 'transaction-manual',
          eventId: 'event-latest',
          userId: 'user-toss',
          source: 'MANUAL',
          createdAt: new Date('2026-06-05T01:45:00.000Z'),
        },
        {
          id: 'transaction-csv',
          eventId: 'event-guest',
          userId: 'user-guest',
          source: 'CSV',
          createdAt: new Date('2026-06-05T00:30:00.000Z'),
        },
        {
          id: 'transaction-ocr',
          eventId: 'event-toss-old',
          userId: 'user-toss',
          source: 'OCR',
          createdAt: new Date('2026-06-04T20:00:00.000Z'),
        },
        {
          id: 'transaction-url-week',
          eventId: 'event-week',
          userId: 'user-unknown',
          source: 'URL',
          createdAt: new Date('2026-06-03T12:00:00.000Z'),
        },
      ],
    });

    const metrics = await buildAdminMonitoringMetrics(db, now);

    expect(metrics.totals).toEqual({
      users: 3,
      events: 4,
      transactions: 4,
      usersWithEvents: 3,
    });
    expect(metrics.latestEvent).toEqual({
      createdAt: '2026-06-05T01:45:00.000Z',
      userKind: 'toss',
    });
    expect(metrics.recent.map((window) => [window.key, window.events, window.users])).toEqual([
      ['m10', 1, 1],
      ['h1', 1, 1],
      ['h6', 3, 2],
      ['h24', 3, 2],
      ['d7', 4, 3],
    ]);
    expect(metrics.last24hUserKinds).toEqual({
      tossUsers: 1,
      guestUsers: 1,
      unknownUsers: 0,
    });
    expect(metrics.last24hTransactionSources).toEqual([
      { source: 'MANUAL', count: 1 },
      { source: 'OCR', count: 1 },
      { source: 'CSV', count: 1 },
    ]);
    expect(metrics.last24hHourlyEvents.filter((point) => point.events > 0)).toEqual([
      { hourStart: '2026-06-04T20:00:00.000Z', events: 1 },
      { hourStart: '2026-06-05T00:00:00.000Z', events: 1 },
      { hourStart: '2026-06-05T01:00:00.000Z', events: 1 },
    ]);
    expect(JSON.stringify(metrics)).not.toContain('user-toss');
    expect(JSON.stringify(metrics)).not.toContain('guest-device');
    expect(JSON.stringify(metrics)).not.toContain('event-latest');
    expect(JSON.stringify(metrics)).not.toContain('transaction-manual');
  });
```

- [ ] **Step 2: Run the helper test to verify behavior**

Run:

```bash
npx vitest run src/lib/adminMonitoring.test.ts
```

Expected: FAIL because the Task 2 helper intentionally returns empty last-24-hour user kind, source, and hourly distributions for non-empty data.

- [ ] **Step 3: Add the distribution and trend implementation**

In `src/lib/adminMonitoring.ts`, add this function immediately after `buildEmptyHourlyEvents`:

```ts
function buildHourlyEvents(now: Date, rows: EventCreatedAtRow[]) {
  const buckets = buildEmptyHourlyEvents(now);
  const indexByHour = new Map(buckets.map((point, index) => [point.hourStart, index]));

  for (const row of rows) {
    const hourStart = startOfHour(row.createdAt).toISOString();
    const index = indexByHour.get(hourStart);
    if (index !== undefined) buckets[index] = { ...buckets[index], events: buckets[index].events + 1 };
  }

  return buckets;
}
```

Then replace the entire `buildAdminMonitoringMetrics` function in `src/lib/adminMonitoring.ts` with:

```ts
export async function buildAdminMonitoringMetrics(
  db: AdminMonitoringDb = prisma as unknown as AdminMonitoringDb,
  now = new Date(),
): Promise<AdminMonitoringMetrics> {
  const startedAt = Date.now();
  const checkedAt = now.toISOString();
  const since24h = new Date(now.getTime() - 24 * HOUR_MS);

  const [
    totalUsers,
    totalEvents,
    totalTransactions,
    usersWithEvents,
    latestEvent,
    sourceGroups,
    userKindRows,
    hourlyRows,
    recent,
  ] = await Promise.all([
    db.user.count(),
    db.event.count(),
    db.transaction.count(),
    countDistinctEventUsers(db),
    db.event.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        user: { select: { tossUserKey: true, guestDeviceId: true } },
      },
    }),
    db.transaction.groupBy({
      by: ['source'],
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
    }),
    db.event.findMany({
      where: { createdAt: { gte: since24h } },
      distinct: ['userId'],
      select: { user: { select: { tossUserKey: true, guestDeviceId: true } } },
    }),
    db.event.findMany({
      where: { createdAt: { gte: since24h } },
      select: { createdAt: true },
    }),
    Promise.all(
      MONITORING_WINDOWS.map(async (window) => {
        const since = new Date(now.getTime() - window.ms);
        const where = { createdAt: { gte: since } };
        const [events, users] = await Promise.all([
          db.event.count({ where }),
          countDistinctEventUsers(db, where),
        ]);
        return {
          key: window.key,
          label: window.label,
          since: since.toISOString(),
          events,
          users,
        };
      }),
    ),
  ]);

  const last24hUserKinds = {
    tossUsers: 0,
    guestUsers: 0,
    unknownUsers: 0,
  };
  for (const row of userKindRows as EventRowWithUser[]) {
    const kind = classifyUserKind(row.user ?? null);
    if (kind === 'toss') last24hUserKinds.tossUsers += 1;
    else if (kind === 'guest') last24hUserKinds.guestUsers += 1;
    else last24hUserKinds.unknownUsers += 1;
  }

  const validSources = new Set<string>(MONITORING_TRANSACTION_SOURCES);
  const sourceOrder = new Map(MONITORING_TRANSACTION_SOURCES.map((source, index) => [source, index]));

  return {
    checkedAt,
    latencyMs: Math.max(0, Date.now() - startedAt),
    totals: {
      users: totalUsers,
      events: totalEvents,
      transactions: totalTransactions,
      usersWithEvents,
    },
    latestEvent: {
      createdAt: latestEvent?.createdAt?.toISOString() ?? null,
      userKind: classifyUserKind(latestEvent?.user ?? null),
    },
    recent,
    last24hUserKinds,
    last24hTransactionSources: sourceGroups
      .filter((row) => validSources.has(row.source))
      .map((row) => ({ source: row.source, count: row._count._all }))
      .sort((a, b) => b.count - a.count || (sourceOrder.get(a.source) ?? 0) - (sourceOrder.get(b.source) ?? 0)),
    last24hHourlyEvents: buildHourlyEvents(now, hourlyRows as EventCreatedAtRow[]),
  };
}
```

- [ ] **Step 4: Run helper tests again**

Run:

```bash
npx vitest run src/lib/adminMonitoring.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminMonitoring.ts src/lib/adminMonitoring.test.ts
git commit -m "test(monitoring): cover admin metrics aggregation"
```

---

### Task 4: Protected Monitoring API

**Files:**
- Create: `app/api/admin/monitoring/route.test.ts`
- Create: `app/api/admin/monitoring/route.ts`

- [ ] **Step 1: Write failing route tests**

Create `app/api/admin/monitoring/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminMonitoringMetrics } from '@/src/lib/adminMonitoringTypes';

vi.mock('@/src/lib/adminMonitoring', () => ({
  getAdminMonitoringMetrics: vi.fn(),
}));

import { getAdminMonitoringMetrics } from '@/src/lib/adminMonitoring';
import { GET } from './route';

const METRICS: AdminMonitoringMetrics = {
  checkedAt: '2026-06-05T01:50:00.000Z',
  latencyMs: 12,
  totals: {
    users: 186,
    events: 52,
    transactions: 52,
    usersWithEvents: 7,
  },
  latestEvent: {
    createdAt: '2026-06-05T00:19:56.731Z',
    userKind: 'toss',
  },
  recent: [],
  last24hUserKinds: {
    tossUsers: 4,
    guestUsers: 0,
    unknownUsers: 0,
  },
  last24hTransactionSources: [
    { source: 'MANUAL', count: 49 },
  ],
  last24hHourlyEvents: [],
};

function request(auth?: string) {
  return new NextRequest('https://maeum-jungsan.test/api/admin/monitoring', {
    headers: auth ? { authorization: auth } : undefined,
  });
}

describe('/api/admin/monitoring', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret-value-1234';
    vi.mocked(getAdminMonitoringMetrics).mockResolvedValue(METRICS);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('rejects requests without the cron bearer token', async () => {
    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: 'unauthorized' });
    expect(getAdminMonitoringMetrics).not.toHaveBeenCalled();
  });

  it('returns privacy-safe metrics when the cron bearer token is valid', async () => {
    const response = await GET(request('Bearer cron-secret-value-1234'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, metrics: METRICS });
    expect(getAdminMonitoringMetrics).toHaveBeenCalledTimes(1);
  });

  it('returns a safe db_error response when aggregation fails', async () => {
    vi.mocked(getAdminMonitoringMetrics).mockRejectedValue(
      new Error('password authentication failed for host aws-1-us-east-1.pooler.supabase.com'),
    );

    const response = await GET(request('Bearer cron-secret-value-1234'));
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'db_error' });
    expect(text).not.toContain('password authentication failed');
    expect(text).not.toContain('supabase.com');
  });
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run:

```bash
npx vitest run app/api/admin/monitoring/route.test.ts
```

Expected: FAIL because `app/api/admin/monitoring/route.ts` does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/monitoring/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminMonitoringMetrics } from '@/src/lib/adminMonitoring';
import { cronUnauthorizedResponse, isCronRequestAuthorized } from '@/src/lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isCronRequestAuthorized(req)) {
    return cronUnauthorizedResponse();
  }

  try {
    const metrics = await getAdminMonitoringMetrics();
    return NextResponse.json({ ok: true, metrics });
  } catch {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 503 });
  }
}
```

- [ ] **Step 4: Run route tests**

Run:

```bash
npx vitest run app/api/admin/monitoring/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/monitoring/route.ts app/api/admin/monitoring/route.test.ts src/lib/adminMonitoring.ts
git commit -m "feat(monitoring): add protected admin metrics api"
```

---

### Task 5: Dashboard Initial Privacy Test

**Files:**
- Create: `src/components/admin/MonitoringDashboard.test.tsx`
- Create in Task 6: `src/components/admin/MonitoringDashboard.tsx`

- [ ] **Step 1: Write failing UI shell test**

Create `src/components/admin/MonitoringDashboard.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MonitoringDashboard from './MonitoringDashboard';

describe('MonitoringDashboard initial shell', () => {
  it('renders the token form before any metrics are visible', () => {
    const html = renderToStaticMarkup(<MonitoringDashboard />);

    expect(html).toContain('운영 모니터링');
    expect(html).toContain('운영 토큰');
    expect(html).toContain('대시보드 열기');
    expect(html).not.toContain('최근 24시간 저장');
    expect(html).not.toContain('전체 사용자');
    expect(html).not.toContain('마지막 저장');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/components/admin/MonitoringDashboard.test.tsx
```

Expected: FAIL because `MonitoringDashboard.tsx` does not exist.

---

### Task 6: Dashboard Client Component

**Files:**
- Create: `src/components/admin/MonitoringDashboard.tsx`
- Test: `src/components/admin/MonitoringDashboard.test.tsx`

- [ ] **Step 1: Implement the dashboard component**

Create `src/components/admin/MonitoringDashboard.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Database,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Users,
} from 'lucide-react';
import type { AdminMonitoringMetrics } from '@/src/lib/adminMonitoringTypes';

type ApiState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string }
  | { status: 'unauthorized'; message: string };

const TOKEN_STORAGE_KEY = 'maeum-admin-monitoring-token';
const REFRESH_INTERVAL_MS = 30_000;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return '없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatHour(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
  }).format(new Date(value));
}

function userKindLabel(kind: AdminMonitoringMetrics['latestEvent']['userKind']): string {
  if (kind === 'toss') return 'Toss';
  if (kind === 'guest') return 'Guest';
  return 'Unknown';
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    MANUAL: '직접 입력',
    URL: 'URL',
    OCR: 'OCR',
    SMS_PASTE: '문자 붙여넣기',
    CSV: 'CSV',
  };
  return labels[source] ?? source;
}

function MetricCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-black tracking-normal text-white">{value}</p>
        </div>
        <div className="rounded-md bg-slate-800 p-2 text-cyan-300">{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{description}</p>
    </section>
  );
}

export default function MonitoringDashboard() {
  const [tokenInput, setTokenInput] = useState('');
  const [token, setToken] = useState('');
  const [metrics, setMetrics] = useState<AdminMonitoringMetrics | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [apiState, setApiState] = useState<ApiState>({
    status: 'idle',
    message: '운영 토큰을 입력하면 집계 지표를 불러옵니다.',
  });

  useEffect(() => {
    const saved = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) {
      setToken(saved);
      setTokenInput(saved);
    }
  }, []);

  const loadMetrics = useCallback(async (nextToken: string) => {
    if (!nextToken.trim()) return;
    setApiState({ status: 'loading', message: '집계 지표를 불러오는 중입니다.' });

    try {
      const response = await fetch('/api/admin/monitoring', {
        headers: { Authorization: `Bearer ${nextToken.trim()}` },
        cache: 'no-store',
      });

      if (response.status === 401) {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken('');
        setMetrics(null);
        setApiState({ status: 'unauthorized', message: '운영 토큰이 올바르지 않습니다.' });
        return;
      }

      if (!response.ok) {
        setApiState({ status: 'error', message: 'DB 집계 요청에 실패했습니다.' });
        return;
      }

      const json = await response.json() as { ok: true; metrics: AdminMonitoringMetrics };
      setMetrics(json.metrics);
      setLastSuccessAt(new Date().toISOString());
      setApiState({ status: 'ready', message: '정상적으로 갱신됐습니다.' });
    } catch {
      setApiState({ status: 'error', message: '네트워크 요청에 실패했습니다.' });
    }
  }, []);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const id = window.setInterval(() => {
      void loadMetrics(token);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadMetrics, token]);

  const submitToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
    void loadMetrics(trimmed);
  };

  const recentByKey = useMemo(() => new Map(metrics?.recent.map((item) => [item.key, item]) ?? []), [metrics]);
  const maxHourlyEvents = Math.max(1, ...(metrics?.last24hHourlyEvents.map((point) => point.events) ?? [0]));
  const maxSourceCount = Math.max(1, ...(metrics?.last24hTransactionSources.map((item) => item.count) ?? [0]));

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-cyan-300">Maeum Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-white">운영 모니터링</h1>
            <p className="mt-2 text-sm text-slate-400">
              개인정보 없이 DB 저장 활동 집계만 확인합니다.
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className={token ? 'text-emerald-300' : 'text-slate-500'} />
              <span>{token ? 'API 토큰 적용됨' : '토큰 입력 필요'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">30초 자동 갱신</p>
          </div>
        </header>

        {!metrics ? (
          <section className="mt-8 max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-cyan-300">
              <KeyRound size={20} />
              <h2 className="text-lg font-bold text-white">운영 토큰</h2>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              CRON_SECRET 값을 입력하면 보호된 API에서 집계 지표를 불러옵니다.
            </p>
            <form onSubmit={submitToken} className="mt-5 space-y-3">
              <input
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300"
                placeholder="CRON_SECRET"
                autoComplete="off"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition active:scale-[0.99]"
              >
                대시보드 열기
              </button>
            </form>
            <p className="mt-4 text-xs text-slate-500">{apiState.message}</p>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-white">{apiState.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  마지막 성공 갱신 {formatDateTime(lastSuccessAt)} · API 체크 {formatDateTime(metrics.checkedAt)} · {metrics.latencyMs}ms
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAutoRefresh((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200"
                >
                  {autoRefresh ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  자동 갱신
                </button>
                <button
                  type="button"
                  onClick={() => void loadMetrics(token)}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-bold text-slate-950"
                >
                  <RefreshCw size={16} />
                  새로고침
                </button>
              </div>
            </section>

            {apiState.status === 'error' && (
              <section className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <AlertTriangle size={18} />
                이전 성공 데이터를 유지하고 있습니다.
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="최근 10분 저장"
                value={`${formatNumber(recentByKey.get('m10')?.events ?? 0)}건`}
                description={`${formatNumber(recentByKey.get('m10')?.users ?? 0)}명 저장`}
                icon={<Clock size={18} />}
              />
              <MetricCard
                title="최근 1시간 저장"
                value={`${formatNumber(recentByKey.get('h1')?.events ?? 0)}건`}
                description={`${formatNumber(recentByKey.get('h1')?.users ?? 0)}명 저장`}
                icon={<Activity size={18} />}
              />
              <MetricCard
                title="최근 24시간 저장"
                value={`${formatNumber(recentByKey.get('h24')?.events ?? 0)}건`}
                description={`${formatNumber(recentByKey.get('h24')?.users ?? 0)}명 저장`}
                icon={<BarChart3 size={18} />}
              />
              <MetricCard
                title="마지막 저장"
                value={formatDateTime(metrics.latestEvent.createdAt)}
                description={`${userKindLabel(metrics.latestEvent.userKind)} 사용자`}
                icon={<Database size={18} />}
              />
              <MetricCard
                title="전체 사용자"
                value={`${formatNumber(metrics.totals.users)}명`}
                description="User 테이블 기준"
                icon={<Users size={18} />}
              />
              <MetricCard
                title="기록 보유 사용자"
                value={`${formatNumber(metrics.totals.usersWithEvents)}명`}
                description="Event가 1건 이상 있는 사용자"
                icon={<Users size={18} />}
              />
              <MetricCard
                title="전체 기록"
                value={`${formatNumber(metrics.totals.events)}건`}
                description="Event 테이블 기준"
                icon={<Database size={18} />}
              />
              <MetricCard
                title="전체 거래"
                value={`${formatNumber(metrics.totals.transactions)}건`}
                description="Transaction 테이블 기준"
                icon={<Database size={18} />}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="text-sm font-bold text-white">최근 24시간 시간대별 저장</h2>
                <div className="mt-4 flex h-44 items-end gap-1">
                  {metrics.last24hHourlyEvents.map((point) => (
                    <div key={point.hourStart} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t bg-cyan-300"
                        style={{ height: `${Math.max(4, (point.events / maxHourlyEvents) * 140)}px` }}
                        title={`${formatHour(point.hourStart)} ${point.events}건`}
                      />
                      <span className="text-[10px] text-slate-500">{formatHour(point.hourStart)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <h2 className="text-sm font-bold text-white">저장 경로 분포</h2>
                  <div className="mt-4 space-y-3">
                    {metrics.last24hTransactionSources.length === 0 ? (
                      <p className="text-sm text-slate-500">최근 24시간 저장 경로가 없습니다.</p>
                    ) : metrics.last24hTransactionSources.map((item) => (
                      <div key={item.source}>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{sourceLabel(item.source)}</span>
                          <span>{formatNumber(item.count)}건</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-slate-800">
                          <div
                            className="h-2 rounded bg-emerald-300"
                            style={{ width: `${Math.max(4, (item.count / maxSourceCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <h2 className="text-sm font-bold text-white">사용자 종류</h2>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-slate-950 p-3">
                      <dt className="text-xs text-slate-500">Toss</dt>
                      <dd className="mt-1 font-black text-white">{formatNumber(metrics.last24hUserKinds.tossUsers)}</dd>
                    </div>
                    <div className="rounded-md bg-slate-950 p-3">
                      <dt className="text-xs text-slate-500">Guest</dt>
                      <dd className="mt-1 font-black text-white">{formatNumber(metrics.last24hUserKinds.guestUsers)}</dd>
                    </div>
                    <div className="rounded-md bg-slate-950 p-3">
                      <dt className="text-xs text-slate-500">Unknown</dt>
                      <dd className="mt-1 font-black text-white">{formatNumber(metrics.last24hUserKinds.unknownUsers)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run the UI shell test**

Run:

```bash
npx vitest run src/components/admin/MonitoringDashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/MonitoringDashboard.tsx src/components/admin/MonitoringDashboard.test.tsx
git commit -m "feat(monitoring): add admin dashboard shell"
```

---

### Task 7: App Router Page

**Files:**
- Create: `app/admin/monitoring/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/admin/monitoring/page.tsx`:

```tsx
import type { Metadata } from 'next';
import MonitoringDashboard from '@/src/components/admin/MonitoringDashboard';

export const metadata: Metadata = {
  title: '운영 모니터링 | 마음정산',
  description: '마음정산 내부 운영 모니터링',
};

export default function AdminMonitoringPage() {
  return <MonitoringDashboard />;
}
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npx vitest run src/lib/adminMonitoring.test.ts app/api/admin/monitoring/route.test.ts src/components/admin/MonitoringDashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/admin/monitoring/page.tsx
git commit -m "feat(monitoring): expose admin dashboard page"
```

---

### Task 8: Full Local Verification

**Files:**
- No source edits unless verification finds a concrete defect.

- [ ] **Step 1: Run monitoring tests**

Run:

```bash
npx vitest run src/lib/adminMonitoring.test.ts app/api/admin/monitoring/route.test.ts src/components/admin/MonitoringDashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 3: Run the Next server build**

Run:

```bash
npm run build:next
```

Expected: exit 0.

- [ ] **Step 4: Run the Toss artifact build if server build passes**

Run:

```bash
npm run build
```

Expected: exit 0. This validates that the new App Router files do not break the repository's Apps-in-Toss build path.

- [ ] **Step 5: Commit verification fixes if any were required**

If any verification command required a code fix, stage only the monitoring files changed by that fix. Example for a helper fix:

```bash
git add src/lib/adminMonitoring.ts src/lib/adminMonitoring.test.ts
git commit -m "fix(monitoring): address verification issues"
```

If every verification command passed without code edits, skip this commit step.

---

### Task 9: Manual Runtime Check Against Local Server

**Files:**
- No source edits unless runtime verification finds a concrete defect.

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev
```

Expected: dev server starts and prints a local URL.

- [ ] **Step 2: Check the protected API rejects missing auth**

Run in another shell:

```bash
curl -i http://localhost:3000/api/admin/monitoring
```

Expected: `HTTP/1.1 401` and body `{"error":"unauthorized"}`. If the dev server uses a different port, replace `3000` with the printed port.

- [ ] **Step 3: Check the protected API returns metrics with auth**

Run in another shell:

```bash
source .env
curl -sS -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3000/api/admin/monitoring
```

Expected: JSON has top-level `ok: true` and `metrics` keys. The response text contains none of these keys: `tossUserKey`, `guestDeviceId`, `targetName`, `memo`, `account`, `sourceUrl`.

- [ ] **Step 4: Open the dashboard**

Open:

```text
http://localhost:3000/admin/monitoring
```

Expected before token entry:

- Shows `운영 모니터링`
- Shows `운영 토큰`
- Does not show metric cards such as `최근 24시간 저장` or `전체 사용자`

Expected after entering `CRON_SECRET`:

- Shows metric cards
- Shows latest save as a KST-formatted timestamp or `없음`
- Shows source and user-kind distributions
- Manual refresh updates the status line
- Auto-refresh toggle changes state

- [ ] **Step 5: Stop the dev server**

Stop the `npm run dev` process with `Ctrl-C`. Do not leave the server process running.

---

### Task 10: Final Review

**Files:**
- Review all modified files.

- [ ] **Step 1: Inspect git status**

Run:

```bash
git status --short
```

Expected: only monitoring-related files should be modified or untracked. Existing unrelated user changes may still appear; do not stage or revert them.

- [ ] **Step 2: Inspect monitoring diff**

Run:

```bash
git diff -- src/lib/adminMonitoringTypes.ts src/lib/adminMonitoring.ts src/lib/adminMonitoring.test.ts app/api/admin/monitoring/route.ts app/api/admin/monitoring/route.test.ts src/components/admin/MonitoringDashboard.tsx src/components/admin/MonitoringDashboard.test.tsx app/admin/monitoring/page.tsx
```

Expected: no raw PII fields are returned from the API payload and no secret is embedded in client code.

- [ ] **Step 3: Confirm commits**

Run:

```bash
git log --oneline -5
```

Expected: recent commits include the monitoring helper, API, dashboard shell, and page commits.

- [ ] **Step 4: Final response**

Report:

- files created
- verification commands and results
- local dashboard URL
- whether `npm run build` was run
- any unrelated dirty worktree entries that were intentionally left untouched
