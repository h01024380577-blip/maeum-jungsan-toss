import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/src/lib/tossApiClient', () => ({
  TOSS_API_BASE: 'https://apps-in-toss-api.toss.im',
  fetchWithRetry: vi.fn(),
}));
import { fetchWithRetry } from '@/src/lib/tossApiClient';
import { getOrderStatus } from './iapClient';

describe('getOrderStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the success payload on 200 SUCCESS', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({
      status: 200,
      json: async () => ({
        resultType: 'SUCCESS',
        success: { orderId: 'o1', sku: 'sku1', status: 'PURCHASED', statusDeterminedAt: 't', reason: 'ok' },
      }),
    } as never);

    const r = await getOrderStatus('userkey-1', 'o1');
    expect(r?.status).toBe('PURCHASED');
    expect(r?.sku).toBe('sku1');
    expect(fetchWithRetry).toHaveBeenCalledWith(
      'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-toss-user-key': 'userkey-1' }),
        body: JSON.stringify({ orderId: 'o1' }),
      }),
    );
  });

  it('returns null on non-200', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue({ status: 500, json: async () => ({}) } as never);
    expect(await getOrderStatus('k', 'o')).toBeNull();
  });

  it('returns null when network throws', async () => {
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('boom'));
    expect(await getOrderStatus('k', 'o')).toBeNull();
  });
});
