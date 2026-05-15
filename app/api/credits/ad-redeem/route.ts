import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { CREDITS_CONFIG, isAllowedRewardAdGroupId, resolveDbUserId } from '@/src/lib/credits';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const nonce = typeof body?.nonce === 'string' ? body.nonce : '';
  if (!nonce) {
    return withCors(req, NextResponse.json({ error: 'missing_nonce' }, { status: 400 }));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const claim = await tx.adRewardGrant.updateMany({
        where: {
          rewardNonce: nonce,
          userId,
          status: 'ISSUED',
          expiresAt: { gt: now },
        },
        data: { status: 'REDEEMED', redeemedAt: now },
      });

      if (claim.count !== 1) {
        const staleGrant = await tx.adRewardGrant.findUnique({ where: { rewardNonce: nonce } });
        if (!staleGrant) return { success: false as const, reason: 'nonce_not_found' };
        if (staleGrant.userId !== userId) return { success: false as const, reason: 'nonce_user_mismatch' };
        if (staleGrant.status !== 'ISSUED') return { success: false as const, reason: 'nonce_already_used' };
        if (staleGrant.expiresAt <= now) {
          await tx.adRewardGrant.update({
            where: { id: staleGrant.id },
            data: { status: 'EXPIRED' },
          });
          return { success: false as const, reason: 'nonce_expired' };
        }
        return { success: false as const, reason: 'redeem_state_inconsistent' };
      }

      const grant = await tx.adRewardGrant.findUnique({ where: { rewardNonce: nonce } });
      if (!grant) throw new Error('nonce_not_found_after_claim');

      if (!isAllowedRewardAdGroupId(grant.rewardType, grant.adGroupId)) {
        await tx.adRewardGrant.update({
          where: { id: grant.id },
          data: { status: 'REJECTED' },
        });
        return { success: false as const, reason: 'invalid_ad_group_id' };
      }

      const field = grant.rewardType === 'AI_CREDIT' ? 'aiCredits' : 'csvImportCredits';
      const cap =
        grant.rewardType === 'AI_CREDIT'
          ? CREDITS_CONFIG.ai.cap
          : CREDITS_CONFIG.csv.cap;

      // 원자적 increment: cap/일일 광고 한도를 동시에 만족할 때만 지급한다.
      const updateResult = await tx.user.updateMany({
        where: {
          id: userId,
          [field]: { lt: cap },
          adWatchesToday: { lt: CREDITS_CONFIG.ad.dailyLimit },
        },
        data: {
          [field]: { increment: grant.rewardAmount },
          adWatchesToday: { increment: 1 },
        },
      });
      if (updateResult.count === 0) {
        // count===0 의 원인을 검증: user 부재, cap 도달, 일일 한도 도달을 구분한다.
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { aiCredits: true, csvImportCredits: true, adWatchesToday: true },
        });
        if (!current) throw new Error('user_not_found');
        const balance = field === 'aiCredits' ? current.aiCredits : current.csvImportCredits;
        await tx.adRewardGrant.update({
          where: { id: grant.id },
          data: { status: 'REJECTED' },
        });
        if (balance >= cap) {
          return { success: false as const, reason: 'cap_reached' };
        }
        if (current.adWatchesToday >= CREDITS_CONFIG.ad.dailyLimit) {
          return { success: false as const, reason: 'daily_ad_limit' };
        }
        return { success: false as const, reason: 'redeem_state_inconsistent' };
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { aiCredits: true, csvImportCredits: true, adWatchesToday: true },
      });

      return { success: true as const, grant, user: user! };
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        nonce_not_found: 404,
        nonce_user_mismatch: 403,
        nonce_already_used: 409,
        nonce_expired: 410,
        invalid_ad_group_id: 400,
        cap_reached: 409,
        daily_ad_limit: 429,
      };
      return withCors(
        req,
        NextResponse.json(
          { success: false, reason: result.reason },
          { status: statusMap[result.reason] ?? 500 },
        ),
      );
    }

    const balance =
      result.grant.rewardType === 'AI_CREDIT'
        ? result.user.aiCredits
        : result.user.csvImportCredits;
    const cap =
      result.grant.rewardType === 'AI_CREDIT'
        ? CREDITS_CONFIG.ai.cap
        : CREDITS_CONFIG.csv.cap;

    return withCors(
      req,
      NextResponse.json({
        success: true,
        rewardType: result.grant.rewardType,
        granted: result.grant.rewardAmount,
        balance,
        cap,
        adWatchesToday: result.user.adWatchesToday,
      }),
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    const statusMap: Record<string, number> = {
      nonce_not_found: 404,
      nonce_user_mismatch: 403,
      nonce_already_used: 409,
      nonce_expired: 410,
      invalid_ad_group_id: 400,
      cap_reached: 409,
      daily_ad_limit: 429,
    };
    return withCors(
      req,
      NextResponse.json({ success: false, reason }, { status: statusMap[reason] ?? 500 }),
    );
  }
}
