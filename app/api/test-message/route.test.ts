import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/apiAuth', () => ({
  getAuthenticatedSessionFromRequest: vi.fn(),
}));

vi.mock('@/src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { prisma } from '@/src/lib/prisma';
import { POST } from './route';

const originalEnv = process.env;
const mockFetch = vi.fn();

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://maeum-jungsan.test/api/test-message', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/test-message', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(getAuthenticatedSessionFromRequest).mockResolvedValue({
      userId: 'user-1',
      userKey: '12345',
      sessionVersion: 0,
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      tossUserKey: '12345',
    } as any);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ resultType: 'SUCCESS' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('keeps the internal test-message API disabled unless explicitly enabled', async () => {
    const response = await POST(makeRequest({
      templateSetCode: 'template',
      deploymentId: 'deployment',
      context: {},
    }));

    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    expect(response.status).toBe(404);
    expect(getAuthenticatedSessionFromRequest).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends a test message only when explicitly enabled', async () => {
    process.env.TEST_MESSAGE_API_ENABLED = 'true';

    const response = await POST(makeRequest({
      templateSetCode: 'template',
      deploymentId: 'deployment',
      context: { name: '홍길동' },
    }));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: { resultType: 'SUCCESS' },
    });
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/messenger/send-test-message',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          templateSetCode: 'template',
          deploymentId: 'deployment',
          context: { name: '홍길동' },
        }),
      }),
    );
  });
});
