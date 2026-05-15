import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { corsResponse, getCorsHeaders, isAllowedCorsOrigin } from './cors';

describe('cors helpers', () => {
  it('reflects allowed Apps-in-Toss origins with credentials', () => {
    const headers = getCorsHeaders('https://maeum-jungsan.apps.tossmini.com');

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://maeum-jungsan.apps.tossmini.com',
    );
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(isAllowedCorsOrigin('https://maeum-jungsan.private-apps.tossmini.com')).toBe(true);
  });

  it('does not grant CORS access to unknown origins', () => {
    const headers = getCorsHeaders('https://example.evil');

    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(headers).not.toHaveProperty('Access-Control-Allow-Credentials');
    expect(isAllowedCorsOrigin('https://example.evil')).toBe(false);
  });

  it('rejects preflight from unknown browser origins', () => {
    const req = new NextRequest('https://maeum-jungsan.duckdns.org/api/events', {
      method: 'OPTIONS',
      headers: { origin: 'https://example.evil' },
    });

    const res = corsResponse(req);

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows non-browser requests without adding wildcard CORS', () => {
    const req = new NextRequest('https://maeum-jungsan.duckdns.org/api/events', {
      method: 'OPTIONS',
    });

    const res = corsResponse(req);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
