import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { verifyJwt } from '@/src/lib/jwt';
import { prisma } from '@/src/lib/prisma';

export const AUTH_COOKIE_NAME = 'toss_auth_token';

export interface AuthenticatedSession {
  userId: string;
  userKey: string;
  sessionVersion: number;
}

export interface RequestAuthParts {
  authorization: string | null;
  authCookie: string | null;
  legacyUserIdCookie?: string | null;
  legacyUserKeyCookie?: string | null;
}

function validSession(payload: ReturnType<typeof verifyJwt>): AuthenticatedSession | null {
  if (!payload) return null;
  if (typeof payload.userId !== 'string' || !payload.userId.trim()) return null;
  if (typeof payload.userKey !== 'string' || !payload.userKey.trim()) return null;
  if (!Number.isSafeInteger(payload.sessionVersion) || payload.sessionVersion < 0) return null;
  return { userId: payload.userId, userKey: payload.userKey, sessionVersion: payload.sessionVersion };
}

async function verifyCurrentSessionVersion(session: AuthenticatedSession): Promise<AuthenticatedSession | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { sessionVersion: true },
    });
    if (!user || user.sessionVersion !== session.sessionVersion) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getAuthenticatedSessionFromRequestParts({
  authorization,
  authCookie,
}: RequestAuthParts): Promise<AuthenticatedSession | null> {
  if (authorization?.startsWith('Bearer ')) {
    const session = validSession(verifyJwt(authorization.slice(7)));
    if (session) return verifyCurrentSessionVersion(session);
  }

  if (authCookie) {
    const session = validSession(verifyJwt(authCookie));
    if (session) return verifyCurrentSessionVersion(session);
  }

  return null;
}

export async function getAuthenticatedSessionFromRequest(req: NextRequest): Promise<AuthenticatedSession | null> {
  return getAuthenticatedSessionFromRequestParts({
    authorization: req.headers.get('authorization'),
    authCookie: req.cookies.get(AUTH_COOKIE_NAME)?.value ?? null,
    // Legacy raw cookies are passed only to make the trust boundary explicit:
    // they are intentionally ignored by getAuthenticatedSessionFromRequestParts.
    legacyUserIdCookie: req.cookies.get('toss_user_id')?.value ?? null,
    legacyUserKeyCookie: req.cookies.get('toss_user_key')?.value ?? null,
  });
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return getAuthenticatedSessionFromRequestParts({
    authorization: headerStore.get('authorization'),
    authCookie: cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null,
    legacyUserIdCookie: cookieStore.get('toss_user_id')?.value ?? null,
    legacyUserKeyCookie: cookieStore.get('toss_user_key')?.value ?? null,
  });
}

/**
 * 현재 요청의 인증된 사용자 ID 반환
 * 1순위: Bearer 토큰 (CSR 모드)
 * 2순위: 서명된 auth 쿠키 (SSR 하위호환)
 * 미인증이면 null
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  return (await getAuthenticatedSession())?.userId ?? null;
}
