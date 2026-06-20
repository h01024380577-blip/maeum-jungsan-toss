import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedSessionFromRequest } from '@/src/lib/apiAuth';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedSessionFromRequest(req);
  if (!session) {
    return withCors(req, NextResponse.json({ premium: false }));
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { premiumAdFree: true },
  });
  return withCors(req, NextResponse.json({ premium: user?.premiumAdFree === true }));
}
