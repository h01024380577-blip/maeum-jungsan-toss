import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { cronUnauthorizedResponse, isCronRequestAuthorized } from '@/src/lib/cronAuth';

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return cronUnauthorizedResponse();
  }

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(new Date(tomorrow).setHours(0, 0, 0, 0));
    const end = new Date(new Date(tomorrow).setHours(23, 59, 59, 999));

    const events = await prisma.event.findMany({
      where: { date: { gte: start, lte: end } },
    });

    if (events.length === 0) {
      return NextResponse.json({ message: 'No events for tomorrow' });
    }

    return NextResponse.json({ message: `Found ${events.length} events for tomorrow` });
  } catch (error: any) {
    console.error('Cron notify failed:', error);
    return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
  }
}
