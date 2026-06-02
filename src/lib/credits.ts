import { NextRequest } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import type { RewardType } from '@prisma/client';

const MAX_GUEST_DEVICE_ID_LENGTH = 191;
const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id';

export const CREDITS_CONFIG = {
  ai: {
    welcome: Number(process.env.AI_CREDIT_WELCOME ?? 1),
    cap: Number(process.env.AI_CREDIT_CAP ?? 3),
    rewardAmount: Number(process.env.AI_CREDIT_REWARD_AMOUNT ?? 1),
    guardEnabled: process.env.AI_CREDIT_GUARD_ENABLED === 'true',
  },
  csv: {
    welcome: Number(process.env.CSV_CREDIT_WELCOME ?? 1),
    cap: Number(process.env.CSV_CREDIT_CAP ?? 3),
    rewardAmount: Number(process.env.CSV_CREDIT_REWARD_AMOUNT ?? 1),
    guardEnabled: process.env.CSV_CREDIT_GUARD_ENABLED === 'true',
  },
  ad: {
    dailyLimit: Number(process.env.AD_DAILY_LIMIT ?? 10),
    nonceTtlMs: Number(process.env.AD_NONCE_TTL_MS ?? 5 * 60 * 1000),
    activeNonceLimit: Number(process.env.AD_ACTIVE_NONCE_LIMIT ?? 3),
  },
} as const;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 오늘 자정(UTC 15:00 전날). Date는 UTC로 저장됨. */
export function kstStartOfToday(now: Date = new Date()): Date {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  kstNow.setUTCHours(0, 0, 0, 0);
  return new Date(kstNow.getTime() - KST_OFFSET_MS);
}

/** adWatchesResetAt이 KST 오늘 자정 이전이면 0으로 리셋한 User 레코드를 반환. */
export async function resetAdWatchesIfNeeded(userId: string): Promise<{
  adWatchesToday: number;
  adWatchesResetAt: Date;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { adWatchesToday: true, adWatchesResetAt: true },
  });
  if (!user) throw new Error(`User not found: ${userId}`);

  const todayStart = kstStartOfToday();
  if (user.adWatchesResetAt >= todayStart) return user;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { adWatchesToday: 0, adWatchesResetAt: todayStart },
    select: { adWatchesToday: true, adWatchesResetAt: true },
  });
  return updated;
}

/** 크레딧 atomic decrement. 성공 시 true, 잔고 0이면 false. */
export async function consumeCredit(
  userId: string,
  rewardType: RewardType,
): Promise<boolean> {
  const field = rewardType === 'AI_CREDIT' ? 'aiCredits' : 'csvImportCredits';
  const result = await prisma.user.updateMany({
    where: { id: userId, [field]: { gt: 0 } },
    data: { [field]: { decrement: 1 } },
  });
  return result.count === 1;
}

/** 크레딧 환불 (rate limit 실패 시 호출). cap 초과는 하지 않음. */
export async function refundCredit(
  userId: string,
  rewardType: RewardType,
): Promise<void> {
  const field = rewardType === 'AI_CREDIT' ? 'aiCredits' : 'csvImportCredits';
  const cap =
    rewardType === 'AI_CREDIT' ? CREDITS_CONFIG.ai.cap : CREDITS_CONFIG.csv.cap;
  await prisma.user.updateMany({
    where: { id: userId, [field]: { lt: cap } },
    data: { [field]: { increment: 1 } },
  });
}

/** 잔고 조회 헬퍼. */
export async function getBalance(userId: string, rewardType: RewardType): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true, csvImportCredits: true },
  });
  if (!user) return 0;
  return rewardType === 'AI_CREDIT' ? user.aiCredits : user.csvImportCredits;
}

/** 가드 활성화 여부. false면 크레딧 소진 체크를 bypass. */
export function isGuardEnabled(rewardType: RewardType): boolean {
  return rewardType === 'AI_CREDIT'
    ? CREDITS_CONFIG.ai.guardEnabled
    : CREDITS_CONFIG.csv.guardEnabled;
}

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
  // 과거 guest 레코드는 tossUserKey 컬럼을 재사용했다.
  // 숫자형 값은 실제 Toss userKey 와 겹칠 수 있으므로 legacy guest 로 간주하지 않는다.
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

/** 로그인 사용자(JWT/쿠키)가 아닌 게스트(x-user-id 디바이스ID)에게도 User 레코드를 보장. */
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
  // 파밍 감사 로그: 방금 생성된 게스트 계정을 기록 (디바이스 ID 포함)
  if (Date.now() - user.createdAt.getTime() < 5000) {
    console.info(`[audit] new_guest_user id=${user.id} deviceId=${deviceId}`);
  }
  return user.id;
}

/**
 * 요청에서 DB user.id를 해석. 게스트는 User 레코드를 upsert.
 * 반환값은 항상 Prisma User.id.
 * 인증 정보가 전혀 없으면 null.
 */
export async function resolveDbUserId(req: NextRequest): Promise<string | null> {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (session) return session.userId;

  const deviceId = normalizeGuestDeviceId(req.headers.get('x-user-id'));
  if (deviceId) return ensureUserRecord(deviceId, true);
  return null;
}
