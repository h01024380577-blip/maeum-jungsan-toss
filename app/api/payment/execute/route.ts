import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { tossPayFetch } from '@/src/lib/tossPayFetch';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ error: '토스 로그인이 필요합니다.' }, { status: 401 }));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tossUserKey: true },
  });
  const tossUserKey = user?.tossUserKey;
  if (!tossUserKey) {
    return withCors(req, NextResponse.json({ error: '토스 로그인이 필요합니다.' }, { status: 401 }));
  }

  const body = await req.json().catch(() => null);
  const payToken = typeof body?.payToken === 'string' ? body.payToken : '';
  const orderNo = typeof body?.orderNo === 'string' ? body.orderNo : '';
  if (!payToken || !orderNo) {
    return withCors(req, NextResponse.json({ error: 'missing_payment_order' }, { status: 400 }));
  }
  const isTest = process.env.NODE_ENV !== 'production';

  const order = await prisma.paymentOrder.findUnique({
    where: { orderNo },
    select: { id: true, userId: true, orderNo: true, payToken: true, status: true },
  });
  if (!order) {
    return withCors(req, NextResponse.json({ error: 'order_not_found' }, { status: 404 }));
  }
  if (order.userId !== session.userId) {
    return withCors(req, NextResponse.json({ error: 'order_user_mismatch' }, { status: 403 }));
  }
  if (order.payToken !== payToken) {
    return withCors(req, NextResponse.json({ error: 'pay_token_mismatch' }, { status: 400 }));
  }
  if (order.status !== 'CREATED') {
    return withCors(req, NextResponse.json({ error: 'order_not_created' }, { status: 409 }));
  }

  const claim = await prisma.paymentOrder.updateMany({
    where: { id: order.id, status: 'CREATED' },
    data: { status: 'EXECUTING' },
  });
  if (claim.count !== 1) {
    return withCors(req, NextResponse.json({ error: 'order_not_created' }, { status: 409 }));
  }

  try {
    const data = await tossPayFetch(
      '/api-partner/v1/apps-in-toss/pay/execute-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': tossUserKey,
        },
        body: JSON.stringify({ payToken, orderNo, isTestPayment: isTest }),
      }
    );

    if (data.resultType !== 'SUCCESS') {
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED' },
      });
      return withCors(req, NextResponse.json({ error: '결제 실행 실패', detail: data }, { status: 400 }));
    }

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'EXECUTED', executedAt: new Date() },
    });

    return withCors(req, NextResponse.json(data));
  } catch (e: any) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED' },
    }).catch(() => {});
    console.error('[payment/execute]', e?.message);
    return withCors(req, NextResponse.json({ error: '결제 실행 중 오류가 발생했습니다.' }, { status: 500 }));
  }
}
