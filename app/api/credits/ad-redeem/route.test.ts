import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('@/src/lib/credits', () => ({
  CREDITS_CONFIG: {
    ai: { cap: 3, rewardAmount: 1 },
    csv: { cap: 3, rewardAmount: 1 },
    ad: { dailyLimit: 10, nonceTtlMs: 5 * 60 * 1000, activeNonceLimit: 3 },
  },
  isAllowedRewardAdGroupId: vi.fn(),
  resolveDbUserId: vi.fn(),
}));

import { prisma } from '@/src/lib/prisma';
import { isAllowedRewardAdGroupId, resolveDbUserId } from '@/src/lib/credits';
import { POST } from './route';

const issuedGrant = {
  id: 'grant-1',
  userId: 'user-1',
  adGroupId: 'ait.valid.rewarded',
  rewardNonce: 'nonce-1',
  rewardType: 'AI_CREDIT',
  rewardAmount: 1,
  status: 'REDEEMED',
  expiresAt: new Date(Date.now() + 60_000),
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://maeum-jungsan.test/api/credits/ad-redeem', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function makeTx(overrides: Record<string, any> = {}) {
  return {
    adRewardGrant: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(issuedGrant),
      update: vi.fn().mockResolvedValue({}),
      ...overrides.adRewardGrant,
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        aiCredits: 1,
        csvImportCredits: 0,
        adWatchesToday: 1,
      }),
      ...overrides.user,
    },
  };
}

describe('/api/credits/ad-redeem POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveDbUserId).mockResolvedValue('user-1');
    vi.mocked(isAllowedRewardAdGroupId).mockReturnValue(true);
  });

  it('claims the nonce atomically before incrementing credits', async () => {
    const calls: string[] = [];
    const tx = makeTx({
      adRewardGrant: {
        updateMany: vi.fn().mockImplementation(async () => {
          calls.push('claim');
          return { count: 1 };
        }),
      },
      user: {
        updateMany: vi.fn().mockImplementation(async () => {
          calls.push('credit');
          return { count: 1 };
        }),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, rewardType: 'AI_CREDIT', granted: 1 });
    expect(tx.adRewardGrant.updateMany).toHaveBeenCalledWith({
      where: {
        rewardNonce: 'nonce-1',
        userId: 'user-1',
        status: 'ISSUED',
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: 'REDEEMED', redeemedAt: expect.any(Date) },
    });
    expect(calls).toEqual(['claim', 'credit']);
  });

  it('rejects redeem when the daily ad limit was reached after nonce issuance', async () => {
    const tx = makeTx({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({
          aiCredits: 0,
          csvImportCredits: 0,
          adWatchesToday: 10,
        }),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json).toEqual({ success: false, reason: 'daily_ad_limit' });
    expect(tx.adRewardGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-1' },
      data: { status: 'REJECTED' },
    });
  });

  it('rejects redeem when the AI credit balance reached the AI cap after nonce issuance', async () => {
    const tx = makeTx({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({
          aiCredits: 3,
          csvImportCredits: 0,
          adWatchesToday: 0,
        }),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ success: false, reason: 'cap_reached' });
    expect(tx.adRewardGrant.update).toHaveBeenCalledWith({
      where: { id: 'grant-1' },
      data: { status: 'REJECTED' },
    });
  });
});
