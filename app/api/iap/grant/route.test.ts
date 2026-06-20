import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/src/lib/cors', () => ({
  corsResponse: () => new Response(null),
  withCors: (_req: unknown, res: Response) => res,
}));
vi.mock('@/src/lib/apiAuth', () => ({ getAuthenticatedSessionFromRequest: vi.fn() }));
vi.mock('@/src/lib/iapClient', () => ({ getOrderStatus: vi.fn() }));
vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    iapOrder: { upsert: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';
import { prisma } from '@/src/lib/prisma';
import { POST } from './route';

function reqWith(body: object) {
  return new NextRequest('http://localhost/api/iap/grant', {
    method: 'POST', body: JSON.stringify(body),
  });
}

const PREMIUM_SKU = 'ait.0000026455.4d539c9c.1a46e05a7b.1944872484';

describe('POST /api/iap/grant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({ userId: 'u1', userKey: 'k', sessionVersion: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tossUserKey: 'k' } as never);
  });

  it('rejects guests with login_required', async () => {
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue(null as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('login_required');
  });

  it('grants when sku matches and status PURCHASED', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: PREMIUM_SKU, status: 'PURCHASED', statusDeterminedAt: 't', reason: 'ok' } as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect((await res.json()).granted).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { premiumAdFree: true } });
  });

  it('denies on sku mismatch', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: 'other', status: 'PURCHASED', statusDeterminedAt: 't', reason: 'ok' } as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect((await res.json())).toMatchObject({ granted: false, reason: 'sku_mismatch' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('denies when status is REFUNDED', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: PREMIUM_SKU, status: 'REFUNDED', statusDeterminedAt: 't', reason: 'r' } as never);
    const res = await POST(reqWith({ orderId: 'o1' }));
    expect((await res.json()).granted).toBe(false);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
