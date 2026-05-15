import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  if (process.env.TEST_MESSAGE_API_ENABLED !== 'true') {
    return withCors(req, NextResponse.json({ error: 'not_found' }, { status: 404 }));
  }

  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tossUserKey: true },
  });
  const userKey = user?.tossUserKey;
  if (!userKey) {
    return withCors(req, NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
  }

  const { templateSetCode, deploymentId, context } = await req.json();
  if (!templateSetCode || !deploymentId) {
    return withCors(req, NextResponse.json({ error: 'templateSetCode와 deploymentId가 필요합니다.' }, { status: 400 }));
  }

  const res = await fetch(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/messenger/send-test-message`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-toss-user-key': userKey,
      },
      body: JSON.stringify({
        templateSetCode,
        deploymentId,
        context: context || {},
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    return withCors(req, NextResponse.json({ error: '발송 실패', detail: data }, { status: res.status }));
  }

  return withCors(req, NextResponse.json({ ok: true, result: data }));
}
