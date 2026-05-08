import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { resolveDbUserId } from '@/src/lib/credits';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function GET(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) return withCors(req, NextResponse.json({ enabled: false }));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsEnabled: true },
  });

  return withCors(req, NextResponse.json({ enabled: user?.notificationsEnabled ?? false }));
}

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }));
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== 'boolean') {
    return withCors(req, NextResponse.json({ error: 'invalid_enabled' }, { status: 400 }));
  }

  await prisma.user.update({
    where: { id: userId },
    data: { notificationsEnabled: body.enabled },
  });

  return withCors(req, NextResponse.json({ ok: true, enabled: body.enabled }));
}
