import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { corsResponse, withCors } from '@/src/lib/cors';
import {
  consumeCredit,
  refundCredit,
  resolveDbUserId,
  isGuardEnabled,
} from '@/src/lib/credits';
import {
  isTransientGeminiError,
  TRANSIENT_RESPONSE,
  hasMeaningfulData,
  LOW_CONFIDENCE_RESPONSE,
} from '@/src/lib/geminiHelpers';
import { getRequestOrigin } from '@/src/lib/requestOrigin';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

const SYSTEM_INSTRUCTION = `Extract event info in JSON only.
Fields: eventType("wedding"|"funeral"|"birthday"|"other"),
date(YYYY-MM-DD, default current year), location,
targetName(⚠️ MUST be exactly ONE person name, NEVER combine like "김진호, 이나은"),
relation("가족"|"절친"|"직장 동료"|"지인"),
type("EXPENSE"|"INCOME"),
account(⚠️ exactly ONE account as "은행명 계좌번호 예금주", NOT multiple).

suggestedNames — ALL person names as separate objects:
- Wedding: [{"name":"신랑이름","label":"신랑측 · 신랑이름"},{"name":"신부이름","label":"신부측 · 신부이름"}]
- Funeral: [{"name":"고인이름","label":"고인 · 고인이름"},{"name":"상주이름","label":"상주 · 상주이름"}]
- Birthday/other: host + any other names

suggestedAccounts — ALL bank accounts as separate objects:
- [{"account":"은행명 계좌번호 예금주","label":"신랑측 · 은행명"},{"account":"은행명 계좌번호 예금주","label":"신부측 · 은행명"}]

Respond ONLY with valid JSON, no markdown.`;

export async function POST(req: NextRequest) {
  const { type, data } = await req.json();

  // AI 크레딧 가드 (env로 on/off)
  // type === 'url'인 경우는 내부적으로 /api/parse-url을 호출하므로 거기서 차감되게 중복 방지
  let aiCreditUserId: string | null = null;
  if (isGuardEnabled('AI_CREDIT') && type !== 'url') {
    aiCreditUserId = await resolveDbUserId(req);
    if (!aiCreditUserId) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'unauthorized' },
        { status: 401 },
      ));
    }
    const consumed = await consumeCredit(aiCreditUserId, 'AI_CREDIT');
    if (!consumed) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'no_credits', rewardType: 'AI_CREDIT' },
        { status: 402 },
      ));
    }
  }

  try {
    let responseText = '{}';

    if (type === 'text') {
      const r = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: data,
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
      });
      responseText = r.text ?? '{}';

    } else if (type === 'image') {
      const b64 = (data as string).includes(',') ? data.split(',')[1] : data;
      const r = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { data: b64, mimeType: 'image/jpeg' } },
            { text: '경조사 정보 추출' },
          ],
        },
        config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
      });
      responseText = r.text ?? '{}';

    } else if (type === 'url') {
      const base = getRequestOrigin({
        headers: req.headers,
        nextUrlOrigin: req.nextUrl.origin,
      });
      // 원본 요청의 인증 컨텍스트(JWT/쿠키/x-user-id)를 parse-url로 전달해야
      // 크레딧 가드가 정상 동작한다. 헤더 누락 시 parse-url이 401로 튕겨
      // 차감도 환불도 일어나지 않음.
      const fwdHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      const auth = req.headers.get('authorization');
      if (auth) fwdHeaders['Authorization'] = auth;
      const cookie = req.headers.get('cookie');
      if (cookie) fwdHeaders['Cookie'] = cookie;
      const xUserId = req.headers.get('x-user-id');
      if (xUserId) fwdHeaders['x-user-id'] = xUserId;

      const res = await fetch(`${base}/api/parse-url`, {
        method: 'POST',
        headers: fwdHeaders,
        body: JSON.stringify({ url: data }),
      });
      const body = await res.json();
      // 실패 상태 코드도 그대로 전달해야 클라가 reason별 UX 분기 가능
      return withCors(req, NextResponse.json(body, { status: res.status }));
    }

    const parsedData = JSON.parse(responseText);
    // 핵심 필드 모두 비어있으면 환불 + low_confidence 응답
    if (!hasMeaningfulData(parsedData)) {
      if (aiCreditUserId) await refundCredit(aiCreditUserId, 'AI_CREDIT');
      return withCors(req, NextResponse.json(LOW_CONFIDENCE_RESPONSE, { status: 200 }));
    }
    return withCors(req, NextResponse.json({ success: true, data: parsedData }));

  } catch (e: any) {
    const transient = isTransientGeminiError(e);
    if (transient && aiCreditUserId) {
      await refundCredit(aiCreditUserId, 'AI_CREDIT');
    }
    console.error('[analyze] error:', e?.message || e);
    if (transient) {
      return withCors(req, NextResponse.json(TRANSIENT_RESPONSE, { status: 503 }));
    }
    return withCors(req, NextResponse.json(
      { success: false, reason: 'parse_error' },
      { status: 500 }
    ));
  }
}
