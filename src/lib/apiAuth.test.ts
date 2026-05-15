import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedSessionFromRequestParts } from './apiAuth';
import { signJwt } from './jwt';
import { prisma } from '@/src/lib/prisma';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('getAuthenticatedSessionFromRequestParts', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-value-that-is-long-enough';
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ sessionVersion: 0 } as any);
  });

  it('authenticates a valid Bearer JWT', async () => {
    const token = signJwt({ userId: 'user-1', userKey: '12345', sessionVersion: 0 });

    expect(await getAuthenticatedSessionFromRequestParts({
      authorization: `Bearer ${token}`,
      authCookie: null,
      legacyUserIdCookie: null,
      legacyUserKeyCookie: null,
    })).toEqual({ userId: 'user-1', userKey: '12345', sessionVersion: 0 });
  });

  it('authenticates a valid signed auth cookie when Bearer is absent', async () => {
    const token = signJwt({ userId: 'user-2', userKey: '67890', sessionVersion: 0 });

    expect(await getAuthenticatedSessionFromRequestParts({
      authorization: null,
      authCookie: token,
      legacyUserIdCookie: null,
      legacyUserKeyCookie: null,
    })).toEqual({ userId: 'user-2', userKey: '67890', sessionVersion: 0 });
  });

  it('does not authenticate legacy raw user id cookies', async () => {
    expect(await getAuthenticatedSessionFromRequestParts({
      authorization: null,
      authCookie: null,
      legacyUserIdCookie: 'user-1',
      legacyUserKeyCookie: '12345',
    })).toBeNull();
  });

  it('rejects a JWT whose sessionVersion is older than the database version', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ sessionVersion: 2 } as any);
    const token = signJwt({ userId: 'user-1', userKey: '12345', sessionVersion: 1 });

    expect(await getAuthenticatedSessionFromRequestParts({
      authorization: `Bearer ${token}`,
      authCookie: null,
      legacyUserIdCookie: null,
      legacyUserKeyCookie: null,
    })).toBeNull();
  });
});
