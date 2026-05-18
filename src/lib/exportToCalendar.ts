import { apiFetch } from './apiClient';
import { isAppsInTossWebView, openExternalUrl } from './openExternalUrl';

export interface ExportToCalendarResult {
  fileName: string;
  eventCount: number;
  via: 'ait-openurl' | 'browser-redirect';
}

interface ServerResponse {
  success?: boolean;
  url?: string;
  token?: string;
  fileName?: string;
  eventCount?: number;
  error?: string;
}

async function requestIcs(
  scope: 'single' | 'all',
  eventId?: string,
): Promise<{ url: string; fileName: string; eventCount: number }> {
  const res = await apiFetch('/api/calendar/ics', {
    method: 'POST',
    body: JSON.stringify({ scope, eventId }),
  });
  const json: ServerResponse = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success || !json.url || !json.fileName) {
    throw new Error(json?.error ?? `http_${res.status}`);
  }
  return {
    url: json.url,
    fileName: json.fileName,
    eventCount: json.eventCount ?? 0,
  };
}

async function openInSystemBrowser(url: string): Promise<'ait-openurl' | 'browser-redirect'> {
  // AIT openURL — 시스템 브라우저로 위임.
  // Android 는 Chrome 빈 화면 + 다운로드 알림만 떠서 사용자가 다음 단계를 모름 → landing 안내 페이지 거침.
  // iOS Safari 는 text/calendar inline disposition 으로 즉시 native 캘린더 sheet 발화하므로 직접 다운로드 URL 유지.
  try {
    const mod = await import('@apps-in-toss/web-framework');
    const m = mod as {
      openURL?: (url: string) => Promise<void>;
      getPlatformOS?: () => string;
    };
    if (typeof m.openURL === 'function') {
      const platform = typeof m.getPlatformOS === 'function' ? m.getPlatformOS() : 'unknown';
      const targetUrl = platform === 'android'
        ? url.replace('/api/export/download/', '/api/calendar/landing/')
        : url;
      await m.openURL(targetUrl);
      return 'ait-openurl';
    }
  } catch (err) {
    console.warn('[ics] AIT openURL 실패:', err);
    if (isAppsInTossWebView()) {
      throw new Error('openurl_failed');
    }
  }

  // 브라우저 폴백 — Toss WebView 밖에서만 같은 창 다운로드 트리거.
  return openExternalUrl(url);
}

export async function exportEventToCalendar(eventId: string): Promise<ExportToCalendarResult> {
  const { url, fileName, eventCount } = await requestIcs('single', eventId);
  const via = await openInSystemBrowser(url);
  return { fileName, eventCount: eventCount || 1, via };
}

export async function exportAllEventsToCalendar(): Promise<ExportToCalendarResult> {
  const { url, fileName, eventCount } = await requestIcs('all');
  const via = await openInSystemBrowser(url);
  return { fileName, eventCount, via };
}
