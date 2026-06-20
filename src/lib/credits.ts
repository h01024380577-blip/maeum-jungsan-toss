import { NextRequest } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import type { RewardType } from '@prisma/client';

const MAX_GUEST_DEVICE_ID_LENGTH = 191;
const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id';

export const CREDITS_CONFIG = {
  ad: {
    nonceTtlMs: Number(process.env.AD_NONCE_TTL_MS ?? 5 * 60 * 1000),
    activeNonceLimit: Number(process.env.AD_ACTIVE_NONCE_LIMIT ?? 3),
  },
} as const;

function configuredRewardAdGroupId(rewardType: RewardType): string {
  return rewardType === 'AI_CREDIT'
    ? process.env.NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT ?? ''
    : process.env.NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT ?? '';
}

export function isAllowedRewardAdGroupId(
  rewardType: RewardType,
  adGroupId: string,
): boolean {
  const normalized = adGroupId.trim();
  if (!normalized) return false;

  const configured = configuredRewardAdGroupId(rewardType);
  if (configured && normalized === configured) return true;

  return process.env.NODE_ENV !== 'production' && normalized === TEST_REWARDED_AD_GROUP_ID;
}

/**
 * 광고 시청으로 얻은 REDEEMED grant를 CONSUMED로 atomic 전환.
 * 성공(=기능 실행 허가) 시 true, nonce 없음/만료/이미 사용됨이면 false.
 */
export async function consumeAdPermission(
  userId: string,
  rewardType: RewardType,
  nonce: string,
): Promise<boolean> {
  const result = await prisma.adRewardGrant.updateMany({
    where: {
      rewardNonce: nonce,
      userId,
      rewardType,
      status: 'REDEEMED',
    },
    data: { status: 'CONSUMED' },
  });
  return result.count === 1;
}

/**
 * Gemini transient 오류(5xx) 재시도 허용용: CONSUMED → REDEEMED 롤백.
 * 사용자가 광고를 이미 시청했으므로 재시도 기회를 제공.
 */
export async function restoreAdPermission(
  userId: string,
  rewardType: RewardType,
  nonce: string,
): Promise<void> {
  await prisma.adRewardGrant.updateMany({
    where: {
      rewardNonce: nonce,
      userId,
      rewardType,
      status: 'CONSUMED',
    },
    data: { status: 'REDEEMED' },
  });
}

export function normalizeGuestDeviceId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_GUEST_DEVICE_ID_LENGTH) return null;
  return trimmed;
}

export function looksLikeTossUserKey(raw: string): boolean {
  return /^[0-9]+$/.test(raw);
}

async function migrateLegacyGuestRecord(deviceId: string): Promise<string | null> {
  if (looksLikeTossUserKey(deviceId)) return null;

  const legacyGuest = await prisma.user.findFirst({
    where: {
      guestDeviceId: null,
      tossUserKey: deviceId,
      name: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: null,
    },
    select: { id: true, createdAt: true },
  });

  if (!legacyGuest) return null;

  const migrated = await prisma.user.update({
    where: { id: legacyGuest.id },
    data: {
      guestDeviceId: deviceId,
      tossUserKey: null,
    },
    select: { id: true, createdAt: true },
  });

  if (Date.now() - migrated.createdAt.getTime() < 5000) {
    console.info(`[audit] migrated_legacy_guest id=${migrated.id} deviceId=${deviceId}`);
  }

  return migrated.id;
}

export async function ensureUserRecord(
  userId: string,
  isGuest: boolean,
): Promise<string> {
  if (!isGuest) return userId;

  const deviceId = normalizeGuestDeviceId(userId);
  if (!deviceId) {
    throw new Error('invalid_guest_device_id');
  }

  const migratedLegacyId = await migrateLegacyGuestRecord(deviceId);
  if (migratedLegacyId) return migratedLegacyId;

  const user = await prisma.user.upsert({
    where: { guestDeviceId: deviceId },
    update: {},
    create: { guestDeviceId: deviceId },
    select: { id: true, createdAt: true },
  });
  if (Date.now() - user.createdAt.getTime() < 5000) {
    console.info(`[audit] new_guest_user id=${user.id} deviceId=${deviceId}`);
  }
  return user.id;
}

/**
 * 요청에서 DB user.id를 해석. 게스트는 User 레코드를 upsert.
 * 반환값은 항상 Prisma User.id. 인증 정보가 전혀 없으면 null.
 */
export async function resolveDbUserId(req: NextRequest): Promise<string | null> {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (session) return session.userId;

  const deviceId = normalizeGuestDeviceId(req.headers.get('x-user-id'));
  if (deviceId) return ensureUserRecord(deviceId, true);
  return null;
}

/** 사용자가 평생 광고 제거 프리미엄을 보유했는지 여부. */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumAdFree: true },
  });
  return user?.premiumAdFree === true;
}
