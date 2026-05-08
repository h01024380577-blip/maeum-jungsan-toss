import * as cheerio from 'cheerio';
import { assertSafePublicUrl, resolveSafeRedirectUrl } from './urlSafety';

export const SCRAPER_USER_AGENT = 'facebookexternalhit/1.1; kakaotalk-scrap/1.0';

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT = 8000;

/**
 * meta refresh 태그에서 리다이렉트 URL 추출
 */
function extractMetaRefreshUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const content = $('meta[http-equiv="refresh"]').attr('content') || '';
  const match = content.match(/url=(.+)/i);
  return match ? match[1].trim().replace(/["']/g, '') : null;
}

/**
 * URL의 HTML을 fetch. 카카오봇 UA 사용, meta refresh 리다이렉트 처리.
 */
export async function fetchPageHtml(url: string): Promise<string> {
  let currentUrl = (await assertSafePublicUrl(url)).toString();

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: {
          'User-Agent': SCRAPER_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
    } catch (err) {
      throw new Error('fetch_failed');
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('fetch_failed');
      currentUrl = await resolveSafeRedirectUrl(currentUrl, location);
      continue;
    }

    if (response.status === 403 || response.status === 429) {
      throw new Error('blocked');
    }

    if (!response.ok) {
      throw new Error('fetch_failed');
    }

    const html = await response.text();

    // meta refresh 리다이렉트 확인
    const redirectUrl = extractMetaRefreshUrl(html);
    if (redirectUrl && i < MAX_REDIRECTS - 1) {
      currentUrl = await resolveSafeRedirectUrl(currentUrl, redirectUrl);
      continue;
    }

    return html;
  }

  // MAX_REDIRECTS 도달 시 마지막 fetch 결과 반환
  throw new Error('fetch_failed');
}
