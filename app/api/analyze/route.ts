import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { corsResponse, withCors } from '@/src/lib/cors';
import {
  consumeAdPermission,
  restoreAdPermission,
  resolveDbUserId,
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
  const { type, data, permissionNonce } = await req.json();

  const userId = await resolveDbUserId(req);
  if (!userId) {
    return withCors(req, NextResponse.json(
      { success: false, reason: 'unauthorized' },
      { status: 401 },
    ));
  }

  // URL 분석은 parse-url로 위임하고, 거기서 nonce를 소비한다
  if (type === 'url') {
    const base = getRequestOrigin({
      headers: req.headers,
      nextUrlOrigin: req.nextUrl.origin,
    });
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
      body: JSON.stringify({ url: data, permissionNonce }),
    });
    const body = await res.json();
    return withCors(req, NextResponse.json(body, { status: res.status }));
  }

  // 텍스트/이미지 분석: nonce 필수
  const nonce = typeof permissionNonce === 'string' ? permissionNonce : '';
  if (!nonce) {
    return withCors(req, NextResponse.json(
      { success: false, reason: 'ad_required', rewardType: 'AI_CREDIT' },
      { status: 402 },
    ));
  }

  const permitted = await consumeAdPermission(userId, 'AI_CREDIT', nonce);
  if (!permitted) {
    return withCors(req, NextResponse.json(
      { success: false, reason: 'ad_required', rewardType: 'AI_CREDIT' },
      { status: 402 },
    ));
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
    }

    const parsedData = JSON.parse(responseText);
    if (!hasMeaningfulData(parsedData)) {
      return withCors(req, NextResponse.json(LOW_CONFIDENCE_RESPONSE, { status: 200 }));
    }
    return withCors(req, NextResponse.json({ success: true, data: parsedData }));

  } catch (e: any) {
    const transient = isTransientGeminiError(e);
    if (transient) {
      await restoreAdPermission(userId, 'AI_CREDIT', nonce);
      return withCors(req, NextResponse.json(TRANSIENT_RESPONSE, { status: 503 }));
    }
    console.error('[analyze] error:', e?.message || e);
    return withCors(req, NextResponse.json(
      { success: false, reason: 'parse_error' },
      { status: 500 }
    ));
  }
}
