import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
]);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal'];

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return BLOCKED_HOSTS.has(normalized) || BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
}

function isPrivateOrReservedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertPublicDns(hostname: string): Promise<void> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error('unsafe_url');
  }
  if (records.some((record) => isPrivateOrReservedIp(record.address))) {
    throw new Error('unsafe_url');
  }
}

export async function assertSafePublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('unsafe_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('unsafe_url');
  }
  if (!url.hostname || url.username || url.password || isBlockedHostname(url.hostname)) {
    throw new Error('unsafe_url');
  }

  if (net.isIP(url.hostname)) {
    if (isPrivateOrReservedIp(url.hostname)) {
      throw new Error('unsafe_url');
    }
    return url;
  }

  await assertPublicDns(url.hostname);
  return url;
}

export async function resolveSafeRedirectUrl(fromUrl: string, redirectTarget: string): Promise<string> {
  const resolved = new URL(redirectTarget, fromUrl).toString();
  const safeUrl = await assertSafePublicUrl(resolved);
  return safeUrl.toString();
}
