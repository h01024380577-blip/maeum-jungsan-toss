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

/**
 * 배포 전환 구간(서버 선반영 → AIT 번들 업로드 전)에 구 번들이 보내는 예전
 * 광고그룹 ID를 한시적으로 허용하기 위한 서버 전용 allowlist. 쉼표 구분.
 * 신규 번들이 스토어에 완전히 반영되면 이 값을 비운다.
 */
function rolloverAllowedAdGroupIds(): string[] {
  return (process.env.AD_GROUP_ID_ROLLOVER_ALLOW ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function isAllowedRewardAdGroupId(adGroupId: string): boolean {
  const normalized = adGroupId.trim();
  if (!normalized) return false;

  const configured = (process.env.NEXT_PUBLIC_AD_GROUP_ID_REWARDED ?? '').trim();
  if (configured && normalized === configured) return true;

  if (rolloverAllowedAdGroupIds().includes(normalized)) return true;

  return process.env.NODE_ENV !== 'production' && normalized === TEST_REWARDED_AD_GROUP_ID;
}

/**
 * 광고 grant를 CONSUMED로 atomic 전환해 기능 실행을 허가한다.
 * - REDEEMED: 광고 시청 후 실행(구 번들 흐름)
 * - ISSUED(미만료): 광고 재생과 동시에 실행(신 번들 흐름). 클라이언트는 광고를
 *   끝까지 보지 않으면 결과를 버리고, redeem은 CONSUMED 상태에서도 기록만 남긴다.
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
      OR: [
        { status: 'REDEEMED' },
        { status: 'ISSUED', expiresAt: { gt: new Date() } },
      ],
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
