import { NextRequest, NextResponse } from 'next/server';
import { corsResponse, withCors } from '@/src/lib/cors';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  return withCors(req, NextResponse.json({ error: 'not_found' }, { status: 404 }));
}
