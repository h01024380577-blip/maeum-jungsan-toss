import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent } };
  }),
}));

vi.mock('@/src/lib/credits', () => ({
  isGuardEnabled: vi.fn(),
  consumeCredit: vi.fn(),
  resolveDbUserId: vi.fn(),
}));

vi.mock('@/src/lib/importCreditToken', () => ({
  mintCsvCreditBypassToken: vi.fn(() => 'credit-token-1'),
}));

import { consumeCredit, isGuardEnabled, resolveDbUserId } from '@/src/lib/credits';
import { POST } from './route';

function makeRequest(image = 'data:image/jpeg;base64,abc123') {
  return new NextRequest('https://maeum-jungsan.test/api/parse-deposit-image', {
    method: 'POST',
    body: JSON.stringify({ image }),
  });
}

describe('/api/parse-deposit-image POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    vi.mocked(resolveDbUserId).mockResolvedValue('user-1');
    vi.mocked(isGuardEnabled).mockReturnValue(true);
    vi.mocked(consumeCredit).mockResolvedValue(true);
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
    expect(consumeCredit).toHaveBeenCalledWith('user-1', 'CSV_CREDIT');
  });


  it('does not consume CSV credit when AI analysis fails', async () => {
    generateContent.mockRejectedValue(new Error('model failed'));

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({ success: false, reason: 'ai_failed' });
    expect(consumeCredit).not.toHaveBeenCalled();
  });

  it('requires login before analyzing screenshots', async () => {
    vi.mocked(resolveDbUserId).mockResolvedValue(null);

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toMatchObject({ success: false, reason: 'unauthorized' });
    expect(generateContent).not.toHaveBeenCalled();
    expect(consumeCredit).not.toHaveBeenCalled();
  });
});
