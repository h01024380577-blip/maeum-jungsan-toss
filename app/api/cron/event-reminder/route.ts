import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { cronUnauthorizedResponse, isCronRequestAuthorized } from '@/src/lib/cronAuth';

const eventTypeLabel = (type: string, custom?: string | null) => {
  if (type === 'WEDDING') return '결혼';
  if (type === 'FUNERAL') return '부고';
  if (type === 'BIRTHDAY') return '생일';
  return custom || '기타';
};

export async function GET(req: NextRequest) {
  if (!isCronRequestAuthorized(req)) {
    return cronUnauthorizedResponse();
  }

  const templateCode = process.env.TOSS_MSG_TEMPLATE_CODE;
  if (!templateCode) {
    return NextResponse.json({ ok: false, reason: 'no_template_configured' });
  }

  // 오늘 날짜 범위 계산 (KST = UTC+9)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowKST.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const startUTC = new Date(`${todayStr}T00:00:00+09:00`);
  const endUTC = new Date(`${todayStr}T23:59:59+09:00`);

  // 오늘 경조사가 있고 알림이 허용된 사용자의 이벤트 조회
  const events = await prisma.event.findMany({
    where: {
      date: { gte: startUTC, lte: endUTC },
      user: { notificationsEnabled: true },
    },
    select: {
      targetName: true,
      eventType: true,
      customEventName: true,
      location: true,
      user: {
        select: { tossUserKey: true },
      },
    },
  });

  if (events.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  let sent = 0;
  let failed = 0;
  const { tossMessengerFetch } = await import('@/src/lib/tossMessengerFetch');

  for (const event of events) {
    const userKey = event.user.tossUserKey;
    if (!userKey) { failed++; continue; }

    try {
      await tossMessengerFetch(
        '/api-partner/v1/apps-in-toss/messenger/send-message',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-toss-user-key': userKey,
          },
          body: JSON.stringify({
            templateSetCode: templateCode,
            context: {
              targetName: event.targetName,
              eventType: eventTypeLabel(event.eventType, event.customEventName),
              location: event.location || '',
            },
          }),
        }
      );
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed });
}
