import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('@/src/lib/credits', () => ({
  resolveDbUserId: vi.fn(),
  isGuardEnabled: vi.fn(),
  consumeCredit: vi.fn(),
  refundCredit: vi.fn(),
}));

vi.mock('@/src/lib/importCreditToken', () => ({
  verifyCsvCreditBypassToken: vi.fn(),
}));

import { prisma } from '@/src/lib/prisma';
import { consumeCredit, isGuardEnabled, resolveDbUserId } from '@/src/lib/credits';
import { verifyCsvCreditBypassToken } from '@/src/lib/importCreditToken';
import { POST } from './route';

function makeRequest(entries: unknown[], creditToken?: string) {
  return new NextRequest('https://maeum-jungsan.test/api/entries/bulk', {
    method: 'POST',
    body: JSON.stringify({ entries, creditToken }),
  });
}

function makeTx(overrides: Record<string, any> = {}) {
  return {
    $executeRaw: vi.fn(),
    event: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'event-1' }),
      ...overrides.event,
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([{ id: 'contact-1', name: '김민수' }]),
      create: vi.fn().mockResolvedValue({ id: 'contact-created' }),
      ...overrides.contact,
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: 'transaction-1' }),
      ...overrides.transaction,
    },
  };
}

describe('/api/entries/bulk POST duplicate handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveDbUserId).mockResolvedValue('user-1');
    vi.mocked(isGuardEnabled).mockReturnValue(false);
    vi.mocked(verifyCsvCreditBypassToken).mockReturnValue(false);
  });


  it('does not consume CSV credit again when a valid deposit analysis token is provided', async () => {
    vi.mocked(isGuardEnabled).mockReturnValue(true);
    vi.mocked(verifyCsvCreditBypassToken).mockReturnValue(true);
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest([
      { targetName: '문서준', amount: '1.6만', date: '2026-05-02', type: 'INCOME' },
    ], 'credit-token-1'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, inserted: 1, attempted: 1 });
    expect(verifyCsvCreditBypassToken).toHaveBeenCalledWith('credit-token-1', 'user-1');
    expect(consumeCredit).not.toHaveBeenCalled();
  });

  it('stores custom event name for 기타 bulk entries', async () => {
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest([
      {
        targetName: '오지아',
        amount: '8.8만',
        date: '2026-05-02',
        type: 'INCOME',
        eventType: 'other',
        customEventName: '돌잔치',
      },
    ]));

    expect(response.status).toBe(200);
    expect(tx.event.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        eventType: 'OTHER',
        customEventName: '돌잔치',
      })],
    }));
  });

  it('skips legacy existing entries whose importFingerprint is null', async () => {
    const tx = makeTx({
      event: {
        findMany: vi.fn().mockResolvedValue([
          {
            targetName: '김민수',
            date: new Date('2026-05-02T15:00:00.000Z'),
            importFingerprint: null,
            transactions: [{ amount: 100000, type: 'EXPENSE' }],
          },
        ]),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest([
      { targetName: '김 민수님', amount: '10만', date: '2026-05-03', type: 'EXPENSE' },
    ]));
    const json = await response.json();

    expect(json).toMatchObject({ success: true, inserted: 0, skipped: 1, attempted: 1 });
    expect(tx.event.createMany).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('treats unique importFingerprint conflicts as skipped rows', async () => {
    const tx = makeTx({
      event: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest([
      { targetName: '김민수', amount: '10만', date: '2026-05-03', type: 'EXPENSE' },
    ]));
    const json = await response.json();

    expect(json).toMatchObject({ success: true, inserted: 0, skipped: 1, attempted: 1 });
    expect(tx.event.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
});
