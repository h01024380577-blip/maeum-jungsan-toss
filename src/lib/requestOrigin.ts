interface RequestOriginSource {
  headers: Pick<Headers, 'get'>;
  nextUrlOrigin: string;
}

function firstHeaderValue(value: string | null): string {
  return value?.split(',')[0]?.trim() ?? '';
}

export function getRequestOrigin({
  headers,
  nextUrlOrigin,
}: RequestOriginSource): string {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {}
  }

  const forwardedHost = firstHeaderValue(headers.get('x-forwarded-host'));
  const host = forwardedHost || firstHeaderValue(headers.get('host'));
  if (host) {
    const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'));
    const fallbackProto = new URL(nextUrlOrigin).protocol.replace(':', '') || 'https';
    return `${forwardedProto || fallbackProto}://${host}`;
  }

  return new URL(nextUrlOrigin).origin;
}
