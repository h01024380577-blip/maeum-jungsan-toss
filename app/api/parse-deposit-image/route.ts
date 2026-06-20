import { NextRequest, NextResponse } from 'next/server';
import { AI_ANALYSIS_FAILED_MESSAGE } from '@/src/lib/aiErrorMessage';
import { GoogleGenAI } from '@google/genai';
import { corsResponse, withCors } from '@/src/lib/cors';
import { isRateLimitError, parseAiResponse, RATE_LIMIT_RESPONSE } from '@/src/lib/geminiHelpers';
import { normalizeDepositImageBatch } from '@/src/lib/parseDepositImage';
import { consumeAdPermission, resolveDbUserId, isPremiumUser } from '@/src/lib/credits';
import { mintCsvCreditBypassToken } from '@/src/lib/importCreditToken';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

function splitImageDataUri(image: string): { data: string; mimeType: string } {
  const match = image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (match) return { mimeType: match[1], data: match[2].replace(/\s+/g, '') };
  return { mimeType: 'image/jpeg', data: image.replace(/\s+/g, '') };
}

const currentYear = new Date().getFullYear();

const SYSTEM_INSTRUCTION = `너는 한국 은행/토스/카카오페이 입금내역 화면 OCR 분석 전문가야.
사용자가 올린 입금내역 캡처 이미지에서 "입금/받음/송금받음" 거래만 배열로 추출해.

규칙:
1. 화면에 여러 입금 행이 있으면 모두 반환한다.
2. senderName: 돈을 보낸 사람 또는 표시된 입금자명 1명. 불명확하면 해당 행 제외.
3. amount: 숫자(원 단위). "5만원"은 50000, "50,000원"은 50000.
4. bank: 화면에서 보이는 은행/앱 이름. 불명확하면 null.
5. date: 명시된 경우 YYYY-MM-DD. 연도가 없으면 ${currentYear}년으로 가정. 불명확하면 null.
6. memo: 거래 메모/적요/받는통장 표시가 있으면 짧게.
7. confidence: high(이름+금액+날짜/은행 확실), medium(이름+금액 확실), low(불분명).
8. isLikelyEventRelated: 축의금/부의금/조의금/생일/돌잔치/환갑 등 경조사 관련으로 보이면 true, 이자/급여/환불/정산/카드취소/쇼핑/중고거래 등으로 보이면 false.
9. reason: 경조사 관련 여부를 판단한 짧은 이유. 모르면 빈 문자열.
10. 출금, 결제, 이체 보냄, 카드 사용, 잔액, 광고, UI 텍스트는 제외한다.

출력 형식: { "data": [{ "senderName": "...", "amount": 50000, "bank": "...", "date": "YYYY-MM-DD", "memo": "...", "confidence": "high", "isLikelyEventRelated": true, "reason": "..." }] }`;

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveDbUserId(req);
    if (!userId) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'unauthorized', message: '로그인이 필요합니다.' },
        { status: 401 },
      ));
    }

    const body = await req.json().catch(() => null);
    const image = body?.image;
    const permissionNonce = typeof body?.permissionNonce === 'string' ? body.permissionNonce : '';

    if (typeof image !== 'string' || image.trim().length < 20) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'invalid_input', message: '입금내역 캡처 이미지를 선택해주세요.' },
        { status: 400 },
      ));
    }

    if (!(await isPremiumUser(userId))) {
      if (!permissionNonce) {
        return withCors(req, NextResponse.json(
          { success: false, reason: 'ad_required', rewardType: 'CSV_CREDIT' },
          { status: 402 },
        ));
      }
      const permitted = await consumeAdPermission(userId, 'CSV_CREDIT', permissionNonce);
      if (!permitted) {
        return withCors(req, NextResponse.json(
          { success: false, reason: 'ad_required', rewardType: 'CSV_CREDIT' },
          { status: 402 },
        ));
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return withCors(req, NextResponse.json(
        { success: false, reason: 'ai_failed', message: 'API 키가 설정되지 않았습니다.' },
        { status: 500 },
      ));
    }

    const { data, mimeType } = splitImageDataUri(image);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { data, mimeType } },
          { text: '입금내역 화면에서 입금 거래 후보를 추출해줘.' },
        ],
      },
      config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
    });

    const parsed = parseAiResponse(response.text || '{}');
    const normalized = normalizeDepositImageBatch(parsed);

    return withCors(req, NextResponse.json({
      success: true,
      data: normalized,
      source: 'gemini-image',
      creditToken: mintCsvCreditBypassToken(userId),
    }));
  } catch (e: unknown) {
    console.error('[parse-deposit-image] error:', (e as Error)?.message);
    if (isRateLimitError(e)) {
      return withCors(req, NextResponse.json(RATE_LIMIT_RESPONSE, { status: 429 }));
    }
    return withCors(req, NextResponse.json(
      { success: false, reason: 'ai_failed', message: AI_ANALYSIS_FAILED_MESSAGE },
      { status: 500 },
    ));
  }
}
