import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/apiAuth', () => ({
  getAuthenticatedSessionFromRequest: vi.fn(),
}));

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    paymentOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/src/lib/tossPayFetch', () => ({
  tossPayFetch: vi.fn(),
}));

import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { prisma } from '@/src/lib/prisma';
import { tossPayFetch } from '@/src/lib/tossPayFetch';
import { POST as createPayment } from './create/route';
import { POST as executePayment } from './execute/route';

const mockPrisma = prisma as any;

function makeRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`https://maeum-jungsan.test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/payment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({
      userId: 'user-1',
      userKey: '12345',
      sessionVersion: 0,
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      tossUserKey: '12345',
    } as any);
    vi.mocked(tossPayFetch).mockResolvedValue({
      resultType: 'SUCCESS',
      success: { payToken: 'pay-token-1' },
    });
    mockPrisma.paymentOrder.create.mockResolvedValue({ id: 'order-1' });
    mockPrisma.paymentOrder.update.mockResolvedValue({ id: 'order-1' });
    mockPrisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects invalid create amounts before calling Toss Pay', async () => {
    const response = await createPayment(makeRequest('/api/payment/create', {
      amount: 0,
      productDesc: '경조사 축의금',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'invalid_amount' });
    expect(tossPayFetch).not.toHaveBeenCalled();
    expect(mockPrisma.paymentOrder.create).not.toHaveBeenCalled();
  });

  it('persists a created payment order before returning the payToken', async () => {
    const response = await createPayment(makeRequest('/api/payment/create', {
      amount: 50000,
      productDesc: '  경조사 축의금  ',
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ payToken: 'pay-token-1', orderNo: expect.stringMatching(/^maeum-/) });
    expect(mockPrisma.paymentOrder.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        orderNo: json.orderNo,
        payToken: 'pay-token-1',
        amount: 50000,
        productDesc: '경조사 축의금',
        status: 'CREATED',
      },
    });
  });

  it('rejects executing another user payment order', async () => {
    mockPrisma.paymentOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'other-user',
      payToken: 'pay-token-1',
      status: 'CREATED',
    });

    const response = await executePayment(makeRequest('/api/payment/execute', {
      orderNo: 'maeum-1',
      payToken: 'pay-token-1',
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: 'order_user_mismatch' });
    expect(tossPayFetch).not.toHaveBeenCalled();
  });

  it('rejects executing with a mismatched payToken', async () => {
    mockPrisma.paymentOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      payToken: 'server-pay-token',
      status: 'CREATED',
    });

    const response = await executePayment(makeRequest('/api/payment/execute', {
      orderNo: 'maeum-1',
      payToken: 'client-pay-token',
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'pay_token_mismatch' });
    expect(tossPayFetch).not.toHaveBeenCalled();
  });

  it('claims a created order before executing and marks it executed once Toss succeeds', async () => {
    mockPrisma.paymentOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      orderNo: 'maeum-1',
      payToken: 'pay-token-1',
      status: 'CREATED',
    });

    const response = await executePayment(makeRequest('/api/payment/execute', {
      orderNo: 'maeum-1',
      payToken: 'pay-token-1',
    }));

    expect(response.status).toBe(200);
    expect(mockPrisma.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'CREATED' },
      data: { status: 'EXECUTING' },
    });
    expect(tossPayFetch).toHaveBeenCalledWith(
      '/api-partner/v1/apps-in-toss/pay/execute-payment',
      expect.objectContaining({
        body: JSON.stringify({
          payToken: 'pay-token-1',
          orderNo: 'maeum-1',
          isTestPayment: true,
        }),
      }),
    );
    expect(mockPrisma.paymentOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'EXECUTED', executedAt: expect.any(Date) },
    });
  });
});
