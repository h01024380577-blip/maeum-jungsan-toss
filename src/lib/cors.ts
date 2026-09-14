import { NextRequest, NextResponse } from 'next/server';

// AIT 번들은 토스가 호스팅하는 Origin 에서 실행되고 여기(EC2)로 cross-origin 호출을 한다.
// SDK 3.0.x 는 *.web.tossmini.com 에서 서빙했는데 3.1.1 에서 2.x 와 같은
// *.apps.tossmini.com 으로 되돌아갔다(릴리즈 노트 2026-08-25).
// 어느 쪽으로 서빙되든 막히지 않도록 두 쌍을 모두 허용한다.
const ALLOWED_ORIGINS = [
  'https://maeum-jungsan.apps.tossmini.com',
  'https://maeum-jungsan.private-apps.tossmini.com',
  'https://maeum-jungsan.web.tossmini.com',
  'https://maeum-jungsan.private-web.tossmini.com',
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
