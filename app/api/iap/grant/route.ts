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
  if (!order) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'verify_failed' }, { status: 502 }));
  }
  if (order.sku !== PREMIUM_SKU) {
    return withCors(req, NextResponse.json({ granted: false, reason: 'sku_mismatch' }, { status: 400 }));
  }
  if (order.status !== 'PURCHASED' && order.status !== 'PAYMENT_COMPLETED') {
    return withCors(req, NextResponse.json({ granted: false, reason: order.status }, { status: 200 }));
  }

  await prisma.$transaction([
    prisma.iapOrder.upsert({
      where: { orderId },
      update: {},
      create: { userId: session.userId, orderId, sku: order.sku, status: 'PURCHASED' },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: { premiumAdFree: true },
    }),
  ]);

  return withCors(req, NextResponse.json({ granted: true }));
}
