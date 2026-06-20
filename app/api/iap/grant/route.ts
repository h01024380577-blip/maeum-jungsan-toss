import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';
import { PREMIUM_SKU } from '@/src/lib/iapConfig';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'login_required' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'missing_order_id' }, { status: 400 }));
  }

  // 토스 userKey는 DB에서 로드 (기존 토스 서버 라우트 컨벤션)
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tossUserKey: true },
  });
  if (!user?.tossUserKey) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'login_required' }, { status: 401 }));
  }

  const order = await getOrderStatus(user.tossUserKey, orderId);
  const verified =
    !!order &&
    order.sku === PREMIUM_SKU &&
    (order.status === 'PURCHASED' || order.status === 'PAYMENT_COMPLETED');

  // 앱인토스 샌드박스 주문은 운영 주문상태 API에서 NOT_FOUND로 조회되지 않는다.
  // IAP_ALLOW_UNVERIFIED_GRANT=true (샌드박스 테스트 전용)이면 검증 실패에도 지급한다.
  // ⚠️ 운영 환경에는 절대 설정하지 말 것 — 미검증 지급(자가지급) 허용됨.
  if (!verified) {
    if (process.env.IAP_ALLOW_UNVERIFIED_GRANT !== 'true') {
      if (!order) {
        return withCors(req, NextResponse.json({ granted: false, reason: 'verify_failed' }, { status: 502 }));
      }
      if (order.sku !== PREMIUM_SKU) {
        return withCors(req, NextResponse.json({ granted: false, reason: 'sku_mismatch' }, { status: 400 }));
      }
      return withCors(req, NextResponse.json({ granted: false, reason: order.status }, { status: 200 }));
    }
    console.warn(
      `[iap][UNVERIFIED_GRANT] orderId=${orderId} status=${order?.status ?? 'no-order'} sku=${order?.sku ?? 'null'} — IAP_ALLOW_UNVERIFIED_GRANT 활성화로 지급`,
    );
  }

  const grantSku = order?.sku === PREMIUM_SKU ? order.sku : PREMIUM_SKU;
  await prisma.$transaction([
    prisma.iapOrder.upsert({
      where: { orderId },
      update: { status: 'PURCHASED', refundedAt: null },
      create: { userId: session.userId, orderId, sku: grantSku, status: 'PURCHASED' },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: { premiumAdFree: true },
    }),
  ]);

  return withCors(req, NextResponse.json({ granted: true }));
}
