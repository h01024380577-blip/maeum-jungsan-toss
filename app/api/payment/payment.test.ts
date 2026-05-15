import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST as createPayment } from './create/route';
import { POST as executePayment } from './execute/route';

function makeRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`https://maeum-jungsan.test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/payment', () => {
  it('keeps payment APIs disabled for launch', async () => {
    const createResponse = await createPayment(makeRequest('/api/payment/create', {
      amount: 50000,
      productDesc: '경조사 축의금',
    }));
    const executeResponse = await executePayment(makeRequest('/api/payment/execute', {
      orderNo: 'maeum-1',
      payToken: 'pay-token-1',
    }));

    await expect(createResponse.json()).resolves.toEqual({ error: 'not_found' });
    await expect(executeResponse.json()).resolves.toEqual({ error: 'not_found' });
    expect(createResponse.status).toBe(404);
    expect(executeResponse.status).toBe(404);
  });
});
