import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return { models: { generateContent } };
  }),
}));

vi.mock('@/src/lib/apiAuth', () => ({
  getAuthenticatedUserId: vi.fn(),
}));

import { getAuthenticatedUserId } from '@/src/lib/apiAuth';
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
    vi.mocked(getAuthenticatedUserId).mockResolvedValue('user-1');
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
    });
  });

  it('requires login before analyzing screenshots', async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(null);

    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toMatchObject({ success: false, reason: 'unauthorized' });
    expect(generateContent).not.toHaveBeenCalled();
  });
});
