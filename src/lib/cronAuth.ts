import { NextResponse } from 'next/server';

type HeaderReadable = {
  headers: {
    get(name: string): string | null;
  };
};

export function isCronRequestAuthorized(request: HeaderReadable): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export function cronUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
