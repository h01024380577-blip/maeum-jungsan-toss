import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { getOrderStatus } from '@/src/lib/iapClient';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  const refundedOrderIds: string[] = Array.isArray(body?.refundedOrderIds)
    ? body.refundedOrderIds.filter((x: unknown) => typeof x === 'string')
    : [];

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tossUserKey: true },
  });
  if (!user?.tossUserKey) {
    return withCors(req, NextResponse.json({ premium: false }));
  }

  for (const orderId of refundedOrderIds) {
    const order = await getOrderStatus(user.tossUserKey, orderId);
    if (order?.status === 'REFUNDED') {
      await prisma.iapOrder.updateMany({
        where: { orderId, userId: session.userId },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
    }
  }

  const remaining = await prisma.iapOrder.count({
    where: { userId: session.userId, status: 'PURCHASED' },
  });
  const premium = remaining > 0;
  await prisma.user.update({
    where: { id: session.userId },
    data: { premiumAdFree: premium },
  });

  return withCors(req, NextResponse.json({ premium }));
}
