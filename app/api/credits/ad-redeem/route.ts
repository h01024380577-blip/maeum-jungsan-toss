import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { CREDITS_CONFIG, resolveDbUserId } from '@/src/lib/credits';

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
      const grant = await tx.adRewardGrant.findUnique({ where: { rewardNonce: nonce } });
      if (!grant) throw new Error('nonce_not_found');
      if (grant.userId !== userId) throw new Error('nonce_user_mismatch');
      if (grant.status !== 'ISSUED') throw new Error('nonce_already_used');
      if (grant.expiresAt < new Date()) {
        await tx.adRewardGrant.update({
          where: { id: grant.id },
          data: { status: 'EXPIRED' },
        });
        throw new Error('nonce_expired');
      }

      const field = grant.rewardType === 'AI_CREDIT' ? 'aiCredits' : 'csvImportCredits';
      const cap =
        grant.rewardType === 'AI_CREDIT'
          ? CREDITS_CONFIG.ai.cap
          : CREDITS_CONFIG.csv.cap;

      // 원자적 increment (cap 미만인 경우에만). cap 도달이면 count===0
      const updateResult = await tx.user.updateMany({
        where: { id: userId, [field]: { lt: cap } },
        data: { [field]: { increment: grant.rewardAmount } },
      });
      const capReached = updateResult.count === 0;

      // nonce 상태 마킹 — capReached 면 REJECTED, 아니면 REDEEMED.
      // 트랜잭션 정상 commit 으로 마킹 보장 (이전엔 throw 가 update 까지 롤백시켜 nonce 재사용 가능)
      await tx.adRewardGrant.update({
        where: { id: grant.id },
        data: capReached
          ? { status: 'REJECTED' }
          : { status: 'REDEEMED', redeemedAt: new Date() },
      });

      // 광고 시청 카운터는 cap 여부와 무관하게 증가 (시청은 발생함)
      await tx.user.update({
        where: { id: userId },
        data: { adWatchesToday: { increment: 1 } },
      });

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { aiCredits: true, csvImportCredits: true, adWatchesToday: true },
      });

      return { grant, user: user!, capReached };
    });

    if (result.capReached) {
      return withCors(
        req,
        NextResponse.json({ success: false, reason: 'cap_reached' }, { status: 409 }),
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
    };
    return withCors(
      req,
      NextResponse.json({ success: false, reason }, { status: statusMap[reason] ?? 500 }),
    );
  }
}
