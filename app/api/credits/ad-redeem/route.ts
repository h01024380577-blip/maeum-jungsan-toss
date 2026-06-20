import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { isAllowedRewardAdGroupId, resolveDbUserId } from '@/src/lib/credits';

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

      return { success: true as const, grant };
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        nonce_not_found: 404,
        nonce_user_mismatch: 403,
        nonce_already_used: 409,
        nonce_expired: 410,
        invalid_ad_group_id: 400,
      };
      return withCors(
        req,
        NextResponse.json(
          { success: false, reason: result.reason },
          { status: statusMap[result.reason] ?? 500 },
        ),
      );
    }

    return withCors(
      req,
      NextResponse.json({
        success: true,
        rewardType: result.grant.rewardType,
        permissionReady: true,
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
    };
    return withCors(
      req,
      NextResponse.json({ success: false, reason }, { status: statusMap[reason] ?? 500 }),
    );
  }
}
