import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import {
  CREDITS_CONFIG,
  isAllowedRewardAdGroupId,
  resetAdWatchesIfNeeded,
  resolveDbUserId,
} from '@/src/lib/credits';
import type { RewardType } from '@prisma/client';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

function generateNonce(): string {
  return `rwd_${randomBytes(18).toString('base64url')}`;
}

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const rewardType = body?.rewardType as RewardType | undefined;
  const adGroupId = typeof body?.adGroupId === 'string' ? body.adGroupId : '';
  if (rewardType !== 'AI_CREDIT' && rewardType !== 'CSV_CREDIT') {
    return withCors(req, NextResponse.json({ error: 'invalid_reward_type' }, { status: 400 }));
  }
  if (!adGroupId) {
    return withCors(req, NextResponse.json({ error: 'missing_ad_group_id' }, { status: 400 }));
  }
  if (!isAllowedRewardAdGroupId(rewardType, adGroupId)) {
    return withCors(req, NextResponse.json({ error: 'invalid_ad_group_id' }, { status: 400 }));
  }

  // KST 자정 기준 광고 시청 카운터 리셋
  const { adWatchesToday } = await resetAdWatchesIfNeeded(userId);
  if (adWatchesToday >= CREDITS_CONFIG.ad.dailyLimit) {
    return withCors(
      req,
      NextResponse.json({ error: 'daily_ad_limit' }, { status: 429 }),
    );
  }

  // rewardType별 잔고 상한 체크
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true, csvImportCredits: true },
  });
  if (!user) {
    return withCors(req, NextResponse.json({ error: 'user_not_found' }, { status: 404 }));
  }

  if (rewardType === 'AI_CREDIT' && user.aiCredits >= CREDITS_CONFIG.ai.cap) {
    return withCors(req, NextResponse.json({ error: 'cap_reached_ai' }, { status: 409 }));
  }
  if (rewardType === 'CSV_CREDIT' && user.csvImportCredits >= CREDITS_CONFIG.csv.cap) {
    return withCors(req, NextResponse.json({ error: 'cap_reached_csv' }, { status: 409 }));
  }

  const now = new Date();
  const activeNonceCount = await prisma.adRewardGrant.count({
    where: {
      userId,
      status: 'ISSUED',
      expiresAt: { gt: now },
    },
  });
  if (activeNonceCount >= CREDITS_CONFIG.ad.activeNonceLimit) {
    return withCors(req, NextResponse.json({ error: 'active_nonce_limit' }, { status: 429 }));
  }

  const rewardAmount =
    rewardType === 'AI_CREDIT'
      ? CREDITS_CONFIG.ai.rewardAmount
      : CREDITS_CONFIG.csv.rewardAmount;
  const nonce = generateNonce();
  const expiresAt = new Date(now.getTime() + CREDITS_CONFIG.ad.nonceTtlMs);

  await prisma.adRewardGrant.create({
    data: {
      userId,
      adGroupId,
      rewardNonce: nonce,
      rewardType,
      rewardAmount,
      status: 'ISSUED',
      expiresAt,
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent') || null,
    },
  });

  return withCors(
    req,
    NextResponse.json({
      nonce,
      rewardType,
      rewardAmount,
      expiresAt: expiresAt.toISOString(),
    }),
  );
}
