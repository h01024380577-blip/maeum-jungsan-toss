import { NextRequest, NextResponse } from 'next/server';
import { AI_ANALYSIS_FAILED_MESSAGE } from '@/src/lib/aiErrorMessage';
import { GoogleGenAI } from '@google/genai';
import { fetchPageHtml } from '@/src/lib/fetchPage';
import { assertSafePublicUrl } from '@/src/lib/urlSafety';
import { extractMetaTags, extractJsonLd, extractBodyText, hasEnoughData } from '@/src/lib/parseUrl';
import { corsResponse, withCors } from '@/src/lib/cors';
import {
  parseAiResponse,
  calculateConfidence as calculateConfidenceFromFields,
  isTransientGeminiError,
  TRANSIENT_RESPONSE,
  hasMeaningfulData,
  LOW_CONFIDENCE_RESPONSE,
} from '@/src/lib/geminiHelpers';
import {
  consumeCredit,
  refundCredit,
  resolveDbUserId,
  isGuardEnabled,
} from '@/src/lib/credits';

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req);
}

const SYSTEM_INSTRUCTION = `너는 한국 경조사 초대장 분석 전문가야.
제공되는 데이터에서 경조사 정보를 추출해 JSON으로 반환해.

핵심 규칙:
1. 반드시 제공된 데이터에 있는 정보만 사용해.
2. 없는 정보는 빈 문자열("")로 반환해.
3. 절대 추측하지 마. 데이터에 명시되지 않은 이름, 날짜, 장소를 만들어내지 마.
4. 날짜는 반드시 YYYY-MM-DD 형식으로. 연도가 없으면 2026년으로 가정.
5. 계좌번호는 "은행명 계좌번호 예금주" 형식으로.
6. ⚠️ targetName에는 반드시 1명의 이름만 넣어. 절대 콤마로 여러명을 합치지 마. "김진호, 이나은" ← 이렇게 하면 안됨. "김진호" ← 이렇게 해야함.
7. ⚠️ account에도 반드시 계좌 1개만 넣어. 여러 계좌는 suggestedAccounts에 넣어.

suggestedNames 규칙 — 파싱된 모든 인물 이름을 역할과 함께 배열로 반환:
- 결혼식: [{"name":"신랑이름","label":"신랑측 · 신랑이름"},{"name":"신부이름","label":"신부측 · 신부이름"}]
- 부고: [{"name":"고인이름","label":"고인 · 고인이름"},{"name":"상주이름","label":"상주 · 상주이름"}]
- 생일/기타: 주인공 + 기타 등장인물 이름을 동일 형식으로 포함

suggestedAccounts 규칙 — 파싱된 모든 계좌번호를 역할과 함께 배열로 반환:
- 결혼식: 신랑측/신부측 계좌 모두 포함 [{"account":"은행명 계좌번호 예금주","label":"신랑측 · 은행명"}]
- 부고: 상주 측 계좌 모두 포함
- 여러 계좌가 있으면 모두 포함`;

const OUTPUT_SCHEMA = `{
  "eventType": "wedding|funeral|birthday|other",
  "targetName": "주인공 이름",
  "suggestedNames": [{"name":"이름","label":"역할 · 이름"}],
  "suggestedAccounts": [{"account":"은행명 계좌번호 예금주","label":"역할 · 은행명"}],
  "date": "YYYY-MM-DD",
  "location": "장소명, 전체 주소",
  "relation": "",
  "account": "은행명 계좌번호 예금주",
  "type": "EXPENSE"
}`;

function normalizeData(parsed: any) {
  // suggestedNames / suggestedAccounts 보존
  const result: any = {
    eventType: parsed.eventType || 'other',
    targetName: parsed.targetName || '',
    date: parsed.date || '',
    location: parsed.location || '',
    relation: parsed.relation || '',
    account: parsed.account || '',
    type: parsed.type || 'EXPENSE',
  };
  if (Array.isArray(parsed.suggestedNames) && parsed.suggestedNames.length > 0) {
    result.suggestedNames = parsed.suggestedNames;
  }
  if (Array.isArray(parsed.suggestedAccounts) && parsed.suggestedAccounts.length > 0) {
    result.suggestedAccounts = parsed.suggestedAccounts;
  }
  return result;
}

function calculateConfidence(data: any): 'high' | 'medium' | 'low' {
  return calculateConfidenceFromFields([data.targetName, data.date, data.location]);
}

/**
 * Jina Reader API로 JS 렌더링된 페이지 텍스트 가져오기
 * SPA 사이트에서도 실제 콘텐츠를 추출할 수 있음
 */
async function fetchRenderedText(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Markdown 이미지 태그 제거, 3000자 제한
    return text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[Image.*?\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 3000);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawUrl = body?.url;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return withCors(request, NextResponse.json(
        { success: false, reason: 'invalid_url', message: 'URL이 필요합니다.' },
        { status: 400 },
      ));
    }
    let safeUrl: string;
    try {
      safeUrl = (await assertSafePublicUrl(rawUrl)).toString();
    } catch {
      return withCors(request, NextResponse.json(
        { success: false, reason: 'invalid_url', message: '지원하지 않는 URL입니다.' },
        { status: 400 },
      ));
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return withCors(request, NextResponse.json(
        { success: false, reason: 'ai_failed', message: 'API 키가 설정되지 않았습니다.' },
        { status: 500 },
      ));
    }

    // AI 크레딧 가드 (env로 on/off)
    let aiCreditUserId: string | null = null;
    if (isGuardEnabled('AI_CREDIT')) {
      aiCreditUserId = await resolveDbUserId(request);
      if (!aiCreditUserId) {
        return withCors(request, NextResponse.json(
          { success: false, reason: 'unauthorized' },
          { status: 401 },
        ));
      }
      const consumed = await consumeCredit(aiCreditUserId, 'AI_CREDIT');
      if (!consumed) {
        return withCors(request, NextResponse.json(
          { success: false, reason: 'no_credits', rewardType: 'AI_CREDIT' },
          { status: 402 },
        ));
      }
    }

    const ai = new GoogleGenAI({ apiKey });

    // ========== Phase 1: 서버사이드 HTML 파싱 ==========
    let meta = { title: '', description: '', image: '', siteName: '' };
    let jsonLd: object | null = null;
    let bodyText = '';
    let fetchSuccess = false;

    try {
      const html = await fetchPageHtml(safeUrl);
      fetchSuccess = true;
      meta = extractMetaTags(html);
      jsonLd = extractJsonLd(html);
      bodyText = extractBodyText(html);
    } catch (e: any) {
      if (e?.message === 'unsafe_url') {
        return withCors(request, NextResponse.json(
          { success: false, reason: 'invalid_url', message: '지원하지 않는 URL입니다.' },
          { status: 400 },
        ));
      }
    }

    // Phase 1a: og + body 텍스트가 충분하면 바로 분석
    if (fetchSuccess && hasEnoughData(meta, bodyText) && bodyText.length > 50) {
      try {
        const parts: string[] = [];
        if (meta.title) parts.push(`제목: ${meta.title}`);
        if (meta.description) parts.push(`설명: ${meta.description}`);
        if (jsonLd) parts.push(`JSON-LD: ${JSON.stringify(jsonLd)}`);
        parts.push(`본문: ${bodyText}`);
        parts.push(`\n위 데이터에서 다음 JSON을 추출해:\n${OUTPUT_SCHEMA}`);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: parts.join('\n'),
          config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
        });
        const data = normalizeData(parseAiResponse(response.text || '{}'));
        const confidence = calculateConfidence(data);

        if (confidence !== 'low') {
          return withCors(request, NextResponse.json({ success: true, data, confidence, source: 'og+body' }));
        }
      } catch (e: any) {
        console.error('[parse-url] Phase 1a error:', e?.message);
        if (isTransientGeminiError(e)) {
          if (aiCreditUserId) await refundCredit(aiCreditUserId, 'AI_CREDIT');
          return withCors(request, NextResponse.json(TRANSIENT_RESPONSE, { status: 503 }));
        }
      }
    }

    // ========== Phase 2: Jina Reader (SPA 렌더링 대응) ==========
    try {
      const renderedText = await fetchRenderedText(safeUrl);
      if (renderedText && renderedText.length > 100) {
        const prompt = `아래는 경조사 초대장 웹페이지의 텍스트 내용이야.
이 데이터에서 경조사 정보를 추출해줘.

${renderedText}

위 데이터에서 다음 JSON을 추출해:
${OUTPUT_SCHEMA}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json' },
        });
        const data = normalizeData(parseAiResponse(response.text || '{}'));
        const confidence = calculateConfidence(data);

        if (confidence !== 'low') {
          return withCors(request, NextResponse.json({ success: true, data, confidence, source: 'rendered' }));
        }
      }
    } catch (e: any) {
      console.error('[parse-url] Phase 2 (Jina) error:', e?.message);
      if (isTransientGeminiError(e)) {
        if (aiCreditUserId) await refundCredit(aiCreditUserId, 'AI_CREDIT');
        return withCors(request, NextResponse.json(TRANSIENT_RESPONSE, { status: 503 }));
      }
    }

    // ========== Phase 3: Gemini urlContext (최후 수단) ==========
    try {
      const prompt = `다음 URL은 한국 경조사 초대장 링크야.
이 URL의 실제 페이지 내용을 읽고 경조사 정보를 추출해줘.
URL: ${safeUrl}
반드시 페이지에서 읽은 실제 데이터만 사용해. 추측하지 마.

다음 JSON 형식으로 반환해:
${OUTPUT_SCHEMA}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION, tools: [{ urlContext: {} }] },
      });
      const data = normalizeData(parseAiResponse(response.text || '{}'));
      const confidence = calculateConfidence(data);

      // 핵심 필드(targetName/date/location)가 모두 비어있다면 사용자에게
      // 아무 가치도 없는 결과이므로 크레딧 환불 + 명시 응답.
      if (!hasMeaningfulData(data)) {
        if (aiCreditUserId) await refundCredit(aiCreditUserId, 'AI_CREDIT');
        return withCors(request, NextResponse.json(LOW_CONFIDENCE_RESPONSE, { status: 200 }));
      }

      return withCors(request, NextResponse.json({ success: true, data, confidence, source: 'url-context' }));
    } catch (e: any) {
      console.error('[parse-url] Phase 3 error:', e?.message);
      if (isTransientGeminiError(e)) {
        if (aiCreditUserId) await refundCredit(aiCreditUserId, 'AI_CREDIT');
        return withCors(request, NextResponse.json(TRANSIENT_RESPONSE, { status: 503 }));
      }
      return withCors(request, NextResponse.json(
        { success: false, reason: 'ai_failed', message: AI_ANALYSIS_FAILED_MESSAGE },
        { status: 500 },
      ));
    }
  } catch {
    return withCors(request, NextResponse.json(
      { success: false, reason: 'parse_failed', message: '요청 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    ));
  }
}
