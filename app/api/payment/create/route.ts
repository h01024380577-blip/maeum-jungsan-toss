import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { tossPayFetch } from '@/src/lib/tossPayFetch';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

const MIN_PAYMENT_AMOUNT = 1;
const MAX_PAYMENT_AMOUNT = 10_000_000;
const MAX_PRODUCT_DESC_LENGTH = 100;
const DEFAULT_PRODUCT_DESC = '경조사 축의금';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isSafeInteger(value)) return null;
  if (value < MIN_PAYMENT_AMOUNT || value > MAX_PAYMENT_AMOUNT) return null;
  return value;
}

function normalizeProductDesc(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PRODUCT_DESC;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_PRODUCT_DESC;
  return trimmed.slice(0, MAX_PRODUCT_DESC_LENGTH);
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
  const amount = normalizeAmount(body?.amount);
  if (amount === null) {
    return withCors(req, NextResponse.json({ error: 'invalid_amount' }, { status: 400 }));
  }
  const productDesc = normalizeProductDesc(body?.productDesc);
  const orderNo = `maeum-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const isTest = process.env.NODE_ENV !== 'production';

  try {
    const data = await tossPayFetch(
      '/api-partner/v1/apps-in-toss/pay/make-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': tossUserKey,
        },
        body: JSON.stringify({
          orderNo,
          productDesc,
          amount,
          amountTaxFree: amount,
          cashReceipt: false,
          isTestPayment: isTest,
        }),
      }
    );

    if (data.resultType !== 'SUCCESS') {
      return withCors(req, NextResponse.json({ error: '결제 생성 실패', detail: data }, { status: 400 }));
    }

    await prisma.paymentOrder.create({
      data: {
        userId: session.userId,
        orderNo,
        payToken: data.success.payToken,
        amount,
        productDesc,
        status: 'CREATED',
      },
    });

    return withCors(req, NextResponse.json({ payToken: data.success.payToken, orderNo }));
  } catch (e: any) {
    console.error('[payment/create]', e?.message);
    return withCors(req, NextResponse.json({ error: '결제 생성 중 오류가 발생했습니다.' }, { status: 500 }));
  }
}
