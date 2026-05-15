import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST } from './route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('https://maeum-jungsan.test/api/send-notification', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/send-notification', () => {
  it('keeps the manual notification API disabled for launch', async () => {
    const response = await POST(makeRequest({
      context: { name: '홍길동' },
    }));

    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    expect(response.status).toBe(404);
  });
});
