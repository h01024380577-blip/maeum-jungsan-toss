import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('@/src/lib/credits', () => ({
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

const issuedGrant = {
  id: 'grant-1',
  userId: 'user-1',
  adGroupId: 'ait.valid.rewarded',
  rewardNonce: 'nonce-1',
  rewardType: 'AI_CREDIT',
  rewardAmount: 1,
  status: 'ISSUED',
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
  };
}

describe('/api/credits/ad-redeem POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveDbUserId).mockResolvedValue('user-1');
    vi.mocked(isAllowedRewardAdGroupId).mockReturnValue(true);
  });

  it('transitions ISSUED → REDEEMED and returns permissionReady: true', async () => {
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, rewardType: 'AI_CREDIT', permissionReady: true });
    expect(tx.adRewardGrant.updateMany).toHaveBeenCalledWith({
      where: {
        rewardNonce: 'nonce-1',
        userId: 'user-1',
        status: 'ISSUED',
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: 'REDEEMED', redeemedAt: expect.any(Date) },
    });
  });

  it('returns 404 when nonce is not found', async () => {
    const tx = makeTx({
      adRewardGrant: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-missing' }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toMatchObject({ success: false, reason: 'nonce_not_found' });
  });

  it('returns 409 when nonce was already used (not ISSUED)', async () => {
    const tx = makeTx({
      adRewardGrant: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ ...issuedGrant, status: 'REDEEMED' }),
        update: vi.fn(),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toMatchObject({ success: false, reason: 'nonce_already_used' });
  });

  it('returns 410 when nonce has expired', async () => {
    const expiredGrant = { ...issuedGrant, status: 'ISSUED', expiresAt: new Date(Date.now() - 1000) };
    const tx = makeTx({
      adRewardGrant: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(expiredGrant),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(410);
    expect(json).toMatchObject({ success: false, reason: 'nonce_expired' });
    expect(tx.adRewardGrant.update).toHaveBeenCalledWith({
      where: { id: expiredGrant.id },
      data: { status: 'EXPIRED' },
    });
  });

  it('rejects invalid ad group id and marks grant REJECTED', async () => {
    vi.mocked(isAllowedRewardAdGroupId).mockReturnValue(false);
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(tx));

    const response = await POST(makeRequest({ nonce: 'nonce-1' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ success: false, reason: 'invalid_ad_group_id' });
    expect(tx.adRewardGrant.update).toHaveBeenCalledWith({
      where: { id: issuedGrant.id },
      data: { status: 'REJECTED' },
    });
  });
});
