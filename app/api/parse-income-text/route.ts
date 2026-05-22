import { NextRequest, NextResponse } from 'next/server';
import { AI_ANALYSIS_FAILED_MESSAGE } from '@/src/lib/aiErrorMessage';
import { GoogleGenAI } from '@google/genai';
import { corsResponse, withCors } from '@/src/lib/cors';
import { getAuthenticatedUserId } from '@/src/lib/apiAuth';
import {
  parseAiResponse,
  isRateLimitError,
  RATE_LIMIT_RESPONSE,
} from '@/src/lib/geminiHelpers';
import { normalizeIncomeBatch } from '@/src/lib/parseIncomeText';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

const SYSTEM_INSTRUCTION = `너는 한국 송금 알림 문자 분석 전문가야.
카카오페이/토스/은행/삼성페이 등 송금·입금 알림 텍스트에서 발신자 정보를 배열로 추출해.

규칙:
1. 한 텍스트 안에 여러 알림이 있으면 모두 배열로 반환.
2. senderName: 돈을 보낸 사람의 이름 1명 (콤마로 합치지 말 것). 이름이 불분명하면 해당 항목 제외.
3. amount: 숫자(원 단위). "5만원" → 50000, "100,000원" → 100000.
4. bank: 카카오페이/토스/KB국민/신한/우리/하나/NH농협/IBK/삼성페이 등. 불명확하면 null.
5. date: 명시된 경우 YYYY-MM-DD, 없으면 null. 연도 없으면 2026 가정.
6. confidence: high(이름+금액+은행 모두 확실) / medium(이름+금액만) / low(불분명)
7. 카드 결제, 출금, 광고는 제외. 입금·송금 받은 건만.

출력 형식: { "data": [{ "senderName": "...", "amount": ..., "bank": "...", "date": "...", "confidence": "..." }] }`;

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'unauthorized', message: '로그인이 필요합니다.' },
        { status: 401 },
      ));
    }

    const body = await req.json().catch(() => null);
    const text = body?.text;
    if (typeof text !== 'string' || text.trim().length < 5) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'invalid_input', message: '텍스트를 입력해주세요.' },
        { status: 400 },
      ));
    }
    if (text.length > 10000) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'too_long', message: '텍스트가 너무 깁니다. (최대 10,000자)' },
        { status: 400 },
      ));
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'ai_failed', message: 'API 키가 설정되지 않았습니다.' },
        { status: 500 },
      ));
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `다음 알림 텍스트에서 송금/입금 건을 추출해줘.\n\n${text}`,
      config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
    });

    const parsed = parseAiResponse(response.text || '{}');
    const data = normalizeIncomeBatch(parsed);

    return withCors(req, NextResponse.json({
      success: true,
      data,
      source: 'gemini-text',
    }));
  } catch (e: unknown) {
    console.error('[parse-income-text] error:', (e as Error)?.message);
    if (isRateLimitError(e)) {
      return withCors(req, NextResponse.json(RATE_LIMIT_RESPONSE, { status: 429 }));
    }
    return withCors(req, NextResponse.json(
      { success: false, reason: 'ai_failed', message: AI_ANALYSIS_FAILED_MESSAGE },
      { status: 500 },
    ));
  }
}
