import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry, TOSS_API_BASE } from '@/src/lib/tossApiClient';
import { corsResponse, withCors } from '@/src/lib/cors';
import { AUTH_COOKIE_NAME, getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';
import { deleteUserAccountData } from '@/src/lib/accountDeletion';

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

  // 서비스 회원탈퇴: 사용자의 로컬 서비스 데이터 전체 삭제
  if (userId) {
    try {
      await deleteUserAccountData(userId);
    } catch (err) {
      console.error('[auth/logout] account deletion failed:', err);
      return withCors(
        req,
        NextResponse.json({ error: 'withdraw_failed' }, { status: 500 }),
      );
    }
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
