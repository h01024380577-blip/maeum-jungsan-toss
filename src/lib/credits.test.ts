import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CREDITS_CONFIG,
  looksLikeTossUserKey,
  normalizeGuestDeviceId,
  consumeAdPermission,
  restoreAdPermission,
  isAllowedRewardAdGroupId,
} from './credits';

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    adRewardGrant: {
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/src/lib/prisma';

describe('CREDITS_CONFIG', () => {
  it('has nonce TTL and active nonce limit for replay protection', () => {
    expect(CREDITS_CONFIG.ad.nonceTtlMs).toBeGreaterThan(0);
    expect(CREDITS_CONFIG.ad.activeNonceLimit).toBeGreaterThan(0);
  });
});

describe('isAllowedRewardAdGroupId', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts the single configured rewarded ad group ID', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_REWARDED: 'ait.v2.live.new',
      AD_GROUP_ID_ROLLOVER_ALLOW: '',
    };

    expect(isAllowedRewardAdGroupId(' ait.v2.live.new ')).toBe(true);
    expect(isAllowedRewardAdGroupId('ait.v2.live.other')).toBe(false);
    expect(isAllowedRewardAdGroupId('')).toBe(false);
  });

  it('accepts rollover IDs while the old bundle is still live', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_REWARDED: 'ait.v2.live.new',
      AD_GROUP_ID_ROLLOVER_ALLOW: 'ait.v2.live.old1, ait.v2.live.old2',
    };

    expect(isAllowedRewardAdGroupId('ait.v2.live.old1')).toBe(true);
    expect(isAllowedRewardAdGroupId('ait.v2.live.old2')).toBe(true);
    expect(isAllowedRewardAdGroupId('ait.v2.live.old3')).toBe(false);
  });

  it('rejects the test ad group ID in production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_REWARDED: 'ait.v2.live.new',
      AD_GROUP_ID_ROLLOVER_ALLOW: '',
    };

    expect(isAllowedRewardAdGroupId('ait-ad-test-rewarded-id')).toBe(false);
  });
});

describe('consumeAdPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions a REDEEMED or unexpired ISSUED grant to CONSUMED', async () => {
    vi.mocked(prisma.adRewardGrant.updateMany).mockResolvedValue({ count: 1 });

    const before = Date.now();
    const result = await consumeAdPermission('user-1', 'AI_CREDIT', 'nonce-abc');

    expect(result).toBe(true);
    expect(prisma.adRewardGrant.updateMany).toHaveBeenCalledWith({
      where: {
        rewardNonce: 'nonce-abc',
        userId: 'user-1',
        rewardType: 'AI_CREDIT',
        OR: [
          { status: 'REDEEMED' },
          { status: 'ISSUED', expiresAt: { gt: expect.any(Date) } },
        ],
      },
      data: { status: 'CONSUMED' },
    });
    // ISSUED 허용은 만료 전 nonce로 한정 — 비교 기준 시각이 현재여야 한다
    const where = vi.mocked(prisma.adRewardGrant.updateMany).mock.calls[0][0]!.where as any;
    expect(where.OR[1].expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('returns false when no REDEEMED grant matches (ad not watched or nonce already used)', async () => {
    vi.mocked(prisma.adRewardGrant.updateMany).mockResolvedValue({ count: 0 });

    const result = await consumeAdPermission('user-1', 'AI_CREDIT', 'nonce-missing');

    expect(result).toBe(false);
  });

  it('works for CSV_CREDIT reward type', async () => {
    vi.mocked(prisma.adRewardGrant.updateMany).mockResolvedValue({ count: 1 });

    const result = await consumeAdPermission('user-2', 'CSV_CREDIT', 'nonce-csv');

    expect(result).toBe(true);
    expect(prisma.adRewardGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ rewardType: 'CSV_CREDIT' }) }),
    );
  });
});

describe('restoreAdPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions a CONSUMED grant back to REDEEMED for retry', async () => {
    vi.mocked(prisma.adRewardGrant.updateMany).mockResolvedValue({ count: 1 });

    await restoreAdPermission('user-1', 'AI_CREDIT', 'nonce-abc');

    expect(prisma.adRewardGrant.updateMany).toHaveBeenCalledWith({
      where: { rewardNonce: 'nonce-abc', userId: 'user-1', rewardType: 'AI_CREDIT', status: 'CONSUMED' },
      data: { status: 'REDEEMED' },
    });
  });
});

describe('guest identity helpers', () => {
  it('normalizes valid guest device ids', () => {
    expect(normalizeGuestDeviceId('  device-123  ')).toBe('device-123');
  });

  it('rejects empty or oversized guest device ids', () => {
    expect(normalizeGuestDeviceId('   ')).toBeNull();
    expect(normalizeGuestDeviceId('a'.repeat(192))).toBeNull();
  });

  it('detects numeric Toss user keys', () => {
    expect(looksLikeTossUserKey('123456789')).toBe(true);
    expect(looksLikeTossUserKey('device-123')).toBe(false);
    expect(looksLikeTossUserKey('6f3b7e18-1f95-49e4-bf9e-4377f2d0c0b4')).toBe(false);
  });
});
