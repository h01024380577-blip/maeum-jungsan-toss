export type OpenExternalUrlResult = 'ait-openurl' | 'browser-redirect';

export function isAppsInTossWebView(): boolean {
  return typeof window !== 'undefined' && window.navigator.userAgent.includes('TossApp');
}

export async function openExternalUrl(url: string): Promise<OpenExternalUrlResult> {
  if (isAppsInTossWebView()) {
    const { openURL } = await import('@apps-in-toss/web-framework');
    await openURL(url);
    return 'ait-openurl';
  }

  if (typeof window !== 'undefined') {
    window.location.href = url;
    return 'browser-redirect';
  }

  throw new Error('no_open_method');
}
