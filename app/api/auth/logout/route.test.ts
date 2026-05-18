import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    user: {
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: { deleteMany: vi.fn() },
    event: { deleteMany: vi.fn() },
    contact: { deleteMany: vi.fn() },
    adRewardGrant: { deleteMany: vi.fn() },
    paymentOrder: { deleteMany: vi.fn() },
  },
}));

vi.mock('@/src/lib/apiAuth', () => ({
  AUTH_COOKIE_NAME: 'toss_auth_token',
  getAuthenticatedSessionFromRequest: vi.fn(),
}));

vi.mock('@/src/lib/tossApiClient', () => ({
  TOSS_API_BASE: 'https://toss.example',
  fetchWithRetry: vi.fn(),
}));

import { prisma } from '@/src/lib/prisma';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { fetchWithRetry } from '@/src/lib/tossApiClient';
import { POST } from './route';

function makeRequest() {
  return new NextRequest('https://maeum-jungsan.test/api/auth/logout', {
    method: 'POST',
  });
}

describe('/api/auth/logout POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({
      userId: 'user-1',
      userKey: '123',
      sessionVersion: 0,
    });
    vi.mocked(fetchWithRetry).mockResolvedValue({ ok: true } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma));
  });

  it('withdraws the service account by disconnecting Toss and deleting local data', async () => {
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(fetchWithRetry).toHaveBeenCalledWith(
      'https://toss.example/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userKey: 123 }),
      }),
    );
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.contact.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.adRewardGrant.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.paymentOrder.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
