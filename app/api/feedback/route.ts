import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { corsResponse, withCors } from '@/src/lib/cors';
import { resolveDbUserId } from '@/src/lib/credits';

const resend = new Resend(process.env.RESEND_API_KEY);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const lastSubmittedAt = new Map<string, number>();

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

export async function POST(req: NextRequest) {
  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const now = Date.now();
  const last = lastSubmittedAt.get(userId);
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - last)) / 1000);
    return withCors(
      req,
      NextResponse.json(
        { error: 'rate_limited', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      ),
    );
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message : '';
  if (!message.trim()) {
    return withCors(req, NextResponse.json({ error: 'Empty message' }, { status: 400 }));
  }
  if (message.length > 5000) {
    return withCors(req, NextResponse.json({ error: 'message_too_long' }, { status: 413 }));
  }

  // rate-limit timestamp 는 검증 통과 즉시 set. 이후 발송 실패해도 유지 (의도적 throw 유발로 우회 차단).
  lastSubmittedAt.set(userId, now);

  try {
    const timestamp = new Date().toISOString();
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
    const safeUserId = escapeHtml(userId);
    const subjectSnippet = message.slice(0, 50).replace(/[\r\n]+/g, ' ');

    await resend.emails.send({
      from: '마음정산 피드백 <onboarding@resend.dev>',
      to: 'h01024380577@gmail.com',
      subject: `[마음정산 피드백] ${subjectSnippet}`,
      html: `
        <h2>마음정산 사용자 피드백</h2>
        <p><strong>사용자 ID:</strong> ${safeUserId}</p>
        <p><strong>시간:</strong> ${timestamp}</p>
        <hr />
        <p>${safeMessage}</p>
      `,
    });

    return withCors(req, NextResponse.json({ ok: true }));
  } catch (e: any) {
    console.error('[FEEDBACK] 이메일 전송 실패:', e?.message);
    return withCors(req, NextResponse.json({ error: 'Failed' }, { status: 500 }));
  }
}
