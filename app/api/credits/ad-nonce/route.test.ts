import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    adRewardGrant: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/src/lib/credits', () => ({
  CREDITS_CONFIG: {
    ai: { cap: 3, rewardAmount: 1 },
    csv: { cap: 3, rewardAmount: 1 },
    ad: { dailyLimit: 10, nonceTtlMs: 5 * 60 * 1000, activeNonceLimit: 3 },
  },
  isAllowedRewardAdGroupId: vi.fn(),
  resetAdWatchesIfNeeded: vi.fn(),
  resolveDbUserId: vi.fn(),
}));

import { prisma } from '@/src/lib/prisma';
import { isAllowedRewardAdGroupId, resetAdWatchesIfNeeded, resolveDbUserId } from '@/src/lib/credits';
import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://maeum-jungsan.test/api/credits/ad-nonce', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/credits/ad-nonce POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveDbUserId).mockResolvedValue('user-1');
    vi.mocked(resetAdWatchesIfNeeded).mockResolvedValue({
      adWatchesToday: 0,
      adWatchesResetAt: new Date('2026-05-15T00:00:00.000Z'),
    });
    vi.mocked(isAllowedRewardAdGroupId).mockReturnValue(true);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      aiCredits: 0,
      csvImportCredits: 0,
    } as any);
    vi.mocked(prisma.adRewardGrant.count).mockResolvedValue(0);
    vi.mocked(prisma.adRewardGrant.create).mockResolvedValue({ id: 'grant-1' } as any);
  });

  it('rejects ad group ids that are not allowed for the reward type', async () => {
    vi.mocked(isAllowedRewardAdGroupId).mockReturnValue(false);

    const response = await POST(makeRequest({
      rewardType: 'AI_CREDIT',
      adGroupId: 'ait.attacker.rewarded',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'invalid_ad_group_id' });
    expect(prisma.adRewardGrant.create).not.toHaveBeenCalled();
  });

  it('rejects issuing more than the active nonce limit', async () => {
    vi.mocked(prisma.adRewardGrant.count).mockResolvedValue(3);

    const response = await POST(makeRequest({
      rewardType: 'AI_CREDIT',
      adGroupId: 'ait.valid.rewarded',
    }));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json).toEqual({ error: 'active_nonce_limit' });
    expect(prisma.adRewardGrant.create).not.toHaveBeenCalled();
  });

  it('rejects AI reward ad issuance when the balance is already at the AI cap', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      aiCredits: 3,
      csvImportCredits: 1,
    } as any);

    const response = await POST(makeRequest({
      rewardType: 'AI_CREDIT',
      adGroupId: 'ait.valid.rewarded',
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: 'cap_reached_ai' });
    expect(prisma.adRewardGrant.create).not.toHaveBeenCalled();
  });
});
