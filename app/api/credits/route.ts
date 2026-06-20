import { NextRequest, NextResponse } from 'next/server';
import { corsResponse, withCors } from '@/src/lib/cors';
import { resolveDbUserId } from '@/src/lib/credits';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function GET(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  return withCors(req, NextResponse.json({ ok: true }));
}
