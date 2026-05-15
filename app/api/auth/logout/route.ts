import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { fetchWithRetry, TOSS_API_BASE } from '@/src/lib/tossApiClient';
import { corsResponse, withCors } from '@/src/lib/cors';
import { AUTH_COOKIE_NAME, getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  const userId = session?.userId;
  const userKey = session?.userKey;

  // 토스 연결 끊기 (remove-by-user-key)
  if (userKey) {
    try {
      await fetchWithRetry(
        `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userKey: Number(userKey) }),
          retries: 1,
        } as any
      );
    } catch {
      // 연결 끊기 실패해도 로컬 세션은 정리
    }
  }

  // DB 토큰 삭제
  if (userId) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          sessionVersion: { increment: 1 },
        },
      });
    } catch {}
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE_NAME);
  res.cookies.delete('toss_user_id');
  res.cookies.delete('toss_user_key');
  return withCors(req, res);
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}
