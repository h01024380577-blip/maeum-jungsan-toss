import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import {
  CREDITS_CONFIG,
  isAllowedRewardAdGroupId,
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

  // 동시 활성 nonce 개수 제한 (replay 방지)
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

  const nonce = generateNonce();
  const expiresAt = new Date(now.getTime() + CREDITS_CONFIG.ad.nonceTtlMs);

  await prisma.adRewardGrant.create({
    data: {
      userId,
      adGroupId,
      rewardNonce: nonce,
      rewardType,
      rewardAmount: 1,
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
      expiresAt: expiresAt.toISOString(),
    }),
  );
}
