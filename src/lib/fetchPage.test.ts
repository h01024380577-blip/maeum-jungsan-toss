import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPageHtml, SCRAPER_USER_AGENT } from './fetchPage';

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}));

// global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function mockResponse(body: string, init?: ResponseInit & { url?: string }) {
  const resp = new Response(body, init);
  if (init?.url) Object.defineProperty(resp, 'url', { value: init.url });
  return resp;
}

describe('fetchPageHtml', () => {
  it('카카오봇 User-Agent로 요청한다', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('<html></html>'));

    await fetchPageHtml('https://example.com/wedding');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/wedding',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': SCRAPER_USER_AGENT,
        }),
      }),
    );
  });

  it('HTML 본문을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('<html><body>결혼합니다</body></html>'));

    const html = await fetchPageHtml('https://example.com/wedding');
    expect(html).toContain('결혼합니다');
  });

  it('meta refresh 리다이렉트를 따라간다 (최대 3회)', async () => {
    const redirectHtml = '<html><head><meta http-equiv="refresh" content="0;url=https://final.com/page"></head><body></body></html>';
    const finalHtml = '<html><body>최종 페이지</body></html>';

    mockFetch
      .mockResolvedValueOnce(mockResponse(redirectHtml))
      .mockResolvedValueOnce(mockResponse(finalHtml));

    const html = await fetchPageHtml('https://short.url/abc');
    expect(html).toContain('최종 페이지');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('HTTP location 리다이렉트를 따라간다', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse('', {
        status: 302,
        headers: { Location: 'https://final.com/page' },
      }))
      .mockResolvedValueOnce(mockResponse('<html><body>최종 페이지</body></html>'));

    const html = await fetchPageHtml('https://start.com/page');
    expect(html).toContain('최종 페이지');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('HTTP 403 응답 시 에러를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Forbidden', { status: 403 }));

    await expect(fetchPageHtml('https://blocked.com')).rejects.toThrow('blocked');
  });

  it('HTTP 429 응답 시 에러를 던진다', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse('Too Many Requests', { status: 429 }));

    await expect(fetchPageHtml('https://ratelimited.com')).rejects.toThrow('blocked');
  });

  it('네트워크 에러 시 fetch_failed 에러를 던진다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(fetchPageHtml('https://down.com')).rejects.toThrow('fetch_failed');
  });

  it('무한 meta refresh 리다이렉트를 3회로 제한한다', async () => {
    const loopHtml = '<html><head><meta http-equiv="refresh" content="0;url=https://loop.com"></head><body></body></html>';

    mockFetch
      .mockResolvedValueOnce(mockResponse(loopHtml))
      .mockResolvedValueOnce(mockResponse(loopHtml))
      .mockResolvedValueOnce(mockResponse(loopHtml));

    // 3회 리다이렉트 후 마지막 HTML 반환 (에러 아님)
    const html = await fetchPageHtml('https://loop.com');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
