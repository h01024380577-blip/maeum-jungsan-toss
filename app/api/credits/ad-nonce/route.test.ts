import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    adRewardGrant: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/src/lib/credits', () => ({
  CREDITS_CONFIG: {
    ad: { nonceTtlMs: 5 * 60 * 1000, activeNonceLimit: 3 },
  },
  isAllowedRewardAdGroupId: vi.fn(),
  resolveDbUserId: vi.fn(),
}));

vi.mock('@/src/lib/cors', () => ({
  corsResponse: vi.fn().mockResolvedValue(new Response()),
  withCors: (_req: unknown, res: Response) => res,
}));

import { prisma } from '@/src/lib/prisma';
import { isAllowedRewardAdGroupId, resolveDbUserId } from '@/src/lib/credits';
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
    vi.mocked(isAllowedRewardAdGroupId).mockReturnValue(true);
    vi.mocked(prisma.adRewardGrant.count).mockResolvedValue(0);
    vi.mocked(prisma.adRewardGrant.create).mockResolvedValue({ id: 'grant-1' } as any);
  });

  it('issues a nonce when all checks pass', async () => {
    const response = await POST(makeRequest({
      rewardType: 'AI_CREDIT',
      adGroupId: 'ait.valid.rewarded',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ nonce: expect.any(String), rewardType: 'AI_CREDIT', expiresAt: expect.any(String) });
    expect(prisma.adRewardGrant.create).toHaveBeenCalled();
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

  it('rejects missing reward type', async () => {
    const response = await POST(makeRequest({ adGroupId: 'ait.valid.rewarded' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'invalid_reward_type' });
  });
});
