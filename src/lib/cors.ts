import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://maeum-jungsan.apps.tossmini.com',
  'https://maeum-jungsan.private-apps.tossmini.com',
  'https://maeum-jungsan.duckdns.org',
  'http://localhost:3000',
];

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
} as const;

export function isAllowedCorsOrigin(origin: string | null): boolean {
  return origin === null || ALLOWED_ORIGINS.includes(origin);
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { ...BASE_CORS_HEADERS };
  if (!ALLOWED_ORIGINS.includes(origin)) return { ...BASE_CORS_HEADERS };

  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
  };
}

/** OPTIONS preflight 응답 */
export function corsResponse(req: NextRequest): NextResponse {
  const origin = req.headers.get('origin');
  if (!isAllowedCorsOrigin(origin)) {
    return NextResponse.json(
      { error: 'CORS origin denied' },
      { status: 403, headers: { Vary: 'Origin' } },
    );
  }

  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

/** 기존 응답에 CORS 헤더 추가 */
export function withCors(req: NextRequest, response: NextResponse): NextResponse {
  const headers = getCorsHeaders(req.headers.get('origin'));
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
