import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent } };
  }),
}));

vi.mock('@/src/lib/credits', () => ({
  consumeAdPermission: vi.fn(),
  resolveDbUserId: vi.fn(),
}));

vi.mock('@/src/lib/importCreditToken', () => ({
  mintCsvCreditBypassToken: vi.fn(() => 'credit-token-1'),
}));

vi.mock('@/src/lib/cors', () => ({
  corsResponse: vi.fn().mockResolvedValue(new Response()),
  withCors: (_req: unknown, res: Response) => res,
}));

import { consumeAdPermission, resolveDbUserId } from '@/src/lib/credits';
import { POST } from './route';

function makeRequest(image = 'data:image/jpeg;base64,abc123', permissionNonce = 'nonce-valid') {
  return new NextRequest('https://maeum-jungsan.test/api/parse-deposit-image', {
    method: 'POST',
    body: JSON.stringify({ image, permissionNonce }),
  });
}

describe('/api/parse-deposit-image POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    vi.mocked(resolveDbUserId).mockResolvedValue('user-1');
    vi.mocked(consumeAdPermission).mockResolvedValue(true);
  });

  it('returns normalized deposit candidates from a screenshot', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        data: [
          {
            senderName: '김진호',
            amount: '50,000원',
            bank: '토스뱅크',
            date: '2026-05-21',
            confidence: 'high',
            isLikelyEventRelated: true,
          },
        ],
      }),
    });

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: [
        {
          senderName: '김진호',
          amount: 50000,
          bank: '토스뱅크',
          date: '2026-05-21',
          memo: '',
          confidence: 'high',
          isLikelyEventRelated: true,
          reason: '',
        },
      ],
      source: 'gemini-image',
      creditToken: 'credit-token-1',
    });
    expect(consumeAdPermission).toHaveBeenCalledWith('user-1', 'CSV_CREDIT', 'nonce-valid');
  });

  it('returns 402 when no permissionNonce is provided', async () => {
    const req = new NextRequest('https://maeum-jungsan.test/api/parse-deposit-image', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,abc123' }),
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(402);
    expect(json).toMatchObject({ reason: 'ad_required', rewardType: 'CSV_CREDIT' });
    expect(consumeAdPermission).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('requires login before analyzing screenshots', async () => {
    vi.mocked(resolveDbUserId).mockResolvedValue(null);

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toMatchObject({ success: false, reason: 'unauthorized' });
    expect(generateContent).not.toHaveBeenCalled();
    expect(consumeAdPermission).not.toHaveBeenCalled();
  });
});
