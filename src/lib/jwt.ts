import crypto from 'crypto';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64url');
}

export interface JwtPayload {
  userId: string;
  userKey: string;
  sessionVersion: number;
}

/** JWT 발급 (HS256, 14일 만료) */
export function signJwt(payload: JwtPayload): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
  }));
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** JWT 검증 — 유효하면 payload, 아니면 null */
export function verifyJwt(token: string): JwtPayload | null {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    const headerJson = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (headerJson.alg !== 'HS256') return null;
    const expected = crypto
      .createHmac('sha256', getJwtSecret())
      .update(`${header}.${body}`)
      .digest('base64url');
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    const sessionVersion = payload.sessionVersion === undefined ? 0 : payload.sessionVersion;
    if (typeof payload.userId !== 'string' || !payload.userId.trim()) return null;
    if (typeof payload.userKey !== 'string' || !payload.userKey.trim()) return null;
    if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) return null;
    return { userId: payload.userId, userKey: payload.userKey, sessionVersion };
  } catch {
    return null;
  }
}
