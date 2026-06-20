import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPremiumUser } from './credits';

vi.mock('@/src/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
import { prisma } from '@/src/lib/prisma';

describe('isPremiumUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when premiumAdFree is true', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ premiumAdFree: true } as never);
    expect(await isPremiumUser('user-1')).toBe(true);
  });

  it('returns false when premiumAdFree is false', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ premiumAdFree: false } as never);
    expect(await isPremiumUser('user-1')).toBe(false);
  });

  it('returns false when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    expect(await isPremiumUser('nope')).toBe(false);
  });
});
