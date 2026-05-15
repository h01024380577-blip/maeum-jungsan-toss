import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { fetchWithRetry, isTokenExpiringSoon, parseScopes, stringifyScopes, TOSS_API_BASE } from '@/src/lib/tossApiClient';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

async function refreshAccessToken(userId: string): Promise<{ accessToken: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { refreshToken: true },
  });
  if (!user?.refreshToken) return null;

  let data: any;
  try {
    const res = await fetchWithRetry(
      `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/refresh-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: user.refreshToken }),
      }
    );
    data = await res.json();
  } catch {
    return null; // 네트워크 오류
  }

  if (!data.success?.accessToken) {
    // refreshToken 만료 또는 invalid_grant → 세션 정리
    await prisma.user.update({
      where: { id: userId },
      data: { accessToken: null, refreshToken: null, tokenExpiresAt: null },
    });
    return null;
  }

  const { accessToken, refreshToken, expiresIn } = data.success;
  const tokenExpiresAt = new Date(Date.now() + ((expiresIn ?? 3600) - 300) * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: { accessToken, refreshToken: refreshToken ?? undefined, tokenExpiresAt },
  });
  return { accessToken };
}

export async function GET(req: NextRequest) {
  const userId = (await getAuthenticatedSessionFromRequest(req))?.userId ?? null;
  if (!userId) return withCors(req, NextResponse.json({ userId: null }, { status: 401 }));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tossUserKey: true, name: true, tokenExpiresAt: true, scopes: true, notificationsEnabled: true },
  });
  if (!user) return withCors(req, NextResponse.json({ userId: null }, { status: 401 }));

  // 만료 5분 전 선제 갱신
  let needsRelogin = false;
  if (isTokenExpiringSoon(user.tokenExpiresAt)) {
    const refreshed = await refreshAccessToken(userId);
    if (!refreshed) needsRelogin = true;
  }

  return withCors(req, NextResponse.json({
    userId: user.id,
    userKey: user.tossUserKey,
    name: user.name,
    scopes: parseScopes(user.scopes),
    notificationsEnabled: user.notificationsEnabled,
    needsRelogin, // true면 클라이언트에서 재로그인 유도
  }));
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}
