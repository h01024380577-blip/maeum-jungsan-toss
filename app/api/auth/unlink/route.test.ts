import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: { deleteMany: vi.fn() },
    event: { deleteMany: vi.fn() },
    contact: { deleteMany: vi.fn() },
    adRewardGrant: { deleteMany: vi.fn() },
    paymentOrder: { deleteMany: vi.fn() },
  },
}));

import { prisma } from '@/src/lib/prisma';
import { POST } from './route';

const basic = `Basic ${Buffer.from('callback-secret').toString('base64')}`;

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://maeum-jungsan.test/api/auth/unlink', {
    method: 'POST',
    headers: { authorization: basic },
    body: JSON.stringify(body),
  });
}

describe('/api/auth/unlink callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOSS_CALLBACK_SECRET = 'callback-secret';
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma));
  });

  it('deletes all local service data when Toss disconnects the account', async () => {
    const response = await POST(makeRequest({ userKey: 123, referrer: 'UNLINK' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, referrer: 'UNLINK' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { tossUserKey: '123' },
      select: { id: true },
    });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.contact.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.adRewardGrant.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.paymentOrder.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
