import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { tossMessengerFetch } from '@/src/lib/tossMessengerFetch';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  const userId = session?.userId;

  if (!userId) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'not_logged_in' }));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsEnabled: true, tossUserKey: true },
  });
  const userKey = user?.tossUserKey;

  if (!userKey) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'not_logged_in' }));
  }

  if (!user?.notificationsEnabled) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'not_enabled' }));
  }

  const templateCode = process.env.TOSS_MSG_TEMPLATE_CODE;
  if (!templateCode) {
    return withCors(req, NextResponse.json({ ok: false, reason: 'no_template_configured' }));
  }

  const body = await req.json().catch(() => ({}));
  const context = body.context ?? {};

  try {
    const result = await tossMessengerFetch(
      '/api-partner/v1/apps-in-toss/messenger/send-message',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-toss-user-key': userKey,
        },
        body: JSON.stringify({ templateSetCode: templateCode, context }),
      }
    );
    return withCors(req, NextResponse.json({ ok: true, result }));
  } catch {
    return withCors(req, NextResponse.json({ ok: false, reason: 'send_failed' }, { status: 500 }));
  }
}
