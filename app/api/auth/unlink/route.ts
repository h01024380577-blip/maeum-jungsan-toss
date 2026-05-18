/**
 * 앱인토스 연결 끊기 콜백 엔드포인트
 * - GET 또는 POST 모두 지원
 * - Basic Auth 검증 (TOSS_CALLBACK_SECRET 환경변수)
 * - referrer: UNLINK | WITHDRAWAL_TERMS | WITHDRAWAL_TOSS
 * - 수신 시 해당 userKey의 토큰/세션 폐기
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { deleteUserAccountDataByTossUserKey } from '@/src/lib/accountDeletion';

function verifyBasicAuth(req: NextRequest): boolean {
  const secret = process.env.TOSS_CALLBACK_SECRET;
  if (!secret) return false; // fail-closed: secret 미설정이면 모든 요청 거부

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Basic ')) return false;
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const decodedBuf = Buffer.from(decoded);
  const secretBuf = Buffer.from(secret);
  if (decodedBuf.length !== secretBuf.length) return false;
  return crypto.timingSafeEqual(decodedBuf, secretBuf);
}

async function handleUnlink(req: NextRequest): Promise<NextResponse> {
  if (!verifyBasicAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { userKey?: number; referrer?: string } = {};
  try {
    if (req.method === 'POST') body = await req.json();
    else {
      const url = new URL(req.url);
      const uk = url.searchParams.get('userKey');
      if (uk) body.userKey = Number(uk);
      body.referrer = url.searchParams.get('referrer') ?? undefined;
    }
  } catch {}

  const { userKey, referrer } = body;
  // referrer: UNLINK | WITHDRAWAL_TERMS | WITHDRAWAL_TOSS (신규 값도 예외 없이 처리)
  const validReferrers = ['UNLINK', 'WITHDRAWAL_TERMS', 'WITHDRAWAL_TOSS'];
  const knownReferrer = validReferrers.includes(referrer ?? '') ? referrer : 'UNKNOWN';

  if (!userKey) {
    return NextResponse.json({ error: 'Missing userKey' }, { status: 400 });
  }

  // userKey 기준으로 서비스 회원 데이터 전체 삭제.
  // 토스 연결 끊기/탈퇴 후에도 미니앱 데이터가 남지 않아야 한다.
  try {
    await deleteUserAccountDataByTossUserKey(String(userKey));
  } catch (err) {
    console.error('[auth/unlink] account deletion failed:', err);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, referrer: knownReferrer });
}

export async function GET(req: NextRequest) { return handleUnlink(req); }
export async function POST(req: NextRequest) { return handleUnlink(req); }
