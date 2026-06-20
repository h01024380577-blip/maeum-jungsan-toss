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
    iapOrder: { updateMany: vi.fn(), count: vi.fn() },
  },
}));

import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';
import { prisma } from '@/src/lib/prisma';
import { POST } from './route';

function reqWith(body: object) {
  return new NextRequest('http://localhost/api/iap/reconcile', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/iap/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({ userId: 'u1', userKey: 'k', sessionVersion: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tossUserKey: 'k' } as never);
  });

  it('revokes premium when refunded order leaves no PURCHASED orders', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: 's', status: 'REFUNDED', statusDeterminedAt: 't', reason: 'r' } as never);
    vi.mocked(prisma.iapOrder.count).mockResolvedValue(0 as never);

    const res = await POST(reqWith({ refundedOrderIds: ['o1'] }));
    expect((await res.json()).premium).toBe(false);
    expect(prisma.iapOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o1', userId: 'u1' }, data: expect.objectContaining({ status: 'REFUNDED' }) }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { premiumAdFree: false } });
  });

  it('keeps premium when a PURCHASED order still remains', async () => {
    vi.mocked(getOrderStatus).mockResolvedValue({ orderId: 'o1', sku: 's', status: 'REFUNDED', statusDeterminedAt: 't', reason: 'r' } as never);
    vi.mocked(prisma.iapOrder.count).mockResolvedValue(1 as never);

    const res = await POST(reqWith({ refundedOrderIds: ['o1'] }));
    expect((await res.json()).premium).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { premiumAdFree: true } });
  });
});
