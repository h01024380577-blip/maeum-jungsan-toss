import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { fetchWithRetry, decryptField, parseScopes, stringifyScopes, TOSS_API_BASE } from '@/src/lib/tossApiClient';
import { signJwt } from '@/src/lib/jwt';
import { corsResponse, withCors } from '@/src/lib/cors';
import { AUTH_COOKIE_NAME } from '@/src/lib/apiAuth';

export async function POST(req: NextRequest) {
  let body: { authorizationCode?: string; referrer?: string };
  try { body = await req.json(); } catch {
    return withCors(req, NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }));
  }

  const { authorizationCode, referrer } = body;
  if (!authorizationCode) {
    return withCors(req, NextResponse.json({ error: 'Missing authorizationCode' }, { status: 400 }));
  }

  // Step 1: AccessToken 발급 (인가코드 유효시간 10분)
  let tokenData: any;
  try {
    const tokenRes = await fetchWithRetry(
      `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationCode, referrer: referrer ?? 'DEFAULT' }),
      }
    );
    tokenData = await tokenRes.json();
  } catch {
    return withCors(req, NextResponse.json({ error: 'NETWORK_ERROR', message: '토스 서버 연결 실패' }, { status: 503 }));
  }

  // invalid_grant: 인가코드 만료 또는 중복 사용
  if (tokenData.error?.code === 'invalid_grant') {
    return withCors(req, NextResponse.json({ error: 'INVALID_GRANT', message: '인가코드가 만료되었거나 이미 사용되었습니다. 다시 로그인해 주세요.' }, { status: 401 }));
  }
  if (!tokenData.success?.accessToken) {
    return withCors(req, NextResponse.json({ error: 'TOKEN_FAILED', detail: tokenData.error?.code }, { status: 401 }));
  }

  const { accessToken, refreshToken, expiresIn } = tokenData.success;
  // accessToken 유효시간 1시간, 5분 여유 두고 저장
  const tokenExpiresAt = new Date(Date.now() + ((expiresIn ?? 3600) - 300) * 1000);

  // Step 2: 사용자 정보 조회
  let userData: any;
  try {
    const userRes = await fetchWithRetry(
      `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    userData = await userRes.json();
  } catch {
    return withCors(req, NextResponse.json({ error: 'NETWORK_ERROR', message: '사용자 정보 조회 실패' }, { status: 503 }));
  }

  if (!userData.success?.userKey) {
    return withCors(req, NextResponse.json({ error: 'USER_FETCH_FAILED' }, { status: 401 }));
  }

  const { userKey, name: rawName, scope } = userData.success;

  // 개인정보 복호화 (키 없으면 null - 최소 식별정보만 저장)
  const decryptedName = decryptField(rawName);

  // scope 안전 파싱 (2026-01-02부터 user_key 추가, 신규 scope도 예외 없이 처리)
  const scopes = parseScopes(scope);

  // Step 3: DB upsert
  const user = await prisma.user.upsert({
    where: { tossUserKey: String(userKey) },
    update: {
      name: decryptedName,
      accessToken,
      refreshToken: refreshToken ?? null,
      tokenExpiresAt,
      scopes: stringifyScopes(scopes),
      updatedAt: new Date(),
    },
    create: {
      tossUserKey: String(userKey),
      name: decryptedName,
      accessToken,
      refreshToken: refreshToken ?? null,
      tokenExpiresAt,
      scopes: stringifyScopes(scopes),
    },
    select: { id: true, createdAt: true, sessionVersion: true },
  });

  // 파밍 감사 로그: 방금 생성된 계정이면 IP/UA 기록
  // (재가입 패턴, 동일 IP 다수 계정 생성 등 사후 추적용)
  if (Date.now() - user.createdAt.getTime() < 5000) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ua = (req.headers.get('user-agent') || 'unknown').slice(0, 120);
    console.info(
      `[audit] new_login_user id=${user.id} userKey=${userKey} ip=${ip} ua=${ua}`,
    );
  }

  // JWT 발급 (CSR 모드용)
  const token = signJwt({ userId: user.id, userKey: String(userKey), sessionVersion: user.sessionVersion });

  const res = NextResponse.json({ ok: true, userId: user.id, token });
  // 쿠키도 유지 (SSR 하위호환)
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 14, // refreshToken 유효기간 14일
  };
  res.cookies.set(AUTH_COOKIE_NAME, token, cookieOpts);
  res.cookies.delete('toss_user_id');
  res.cookies.delete('toss_user_key');
  return withCors(req, res);
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}
