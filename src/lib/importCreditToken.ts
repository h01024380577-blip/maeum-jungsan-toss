import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export type CsvCreditTokenPayload = {
  v: typeof TOKEN_VERSION;
  userId: string;
  rewardType: 'CSV_CREDIT';
  purpose: 'deposit_image';
  exp: number;
};

function getSecret() {
  return process.env.CREDIT_TOKEN_SECRET
    || process.env.NEXTAUTH_SECRET
    || process.env.JWT_SECRET
    || process.env.GEMINI_API_KEY
    || 'dev-credit-token-secret';
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload: string) {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function mintCsvCreditBypassToken(userId: string, now: number = Date.now(), ttlMs: number = DEFAULT_TTL_MS) {
  const payload: CsvCreditTokenPayload = {
    v: TOKEN_VERSION,
    userId,
    rewardType: 'CSV_CREDIT',
    purpose: 'deposit_image',
    exp: now + ttlMs,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyCsvCreditBypassToken(token: string | null | undefined, userId: string, now: number = Date.now()) {
  if (!token) return false;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  const expected = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as CsvCreditTokenPayload;
    return payload.v === TOKEN_VERSION
      && payload.userId === userId
      && payload.rewardType === 'CSV_CREDIT'
      && payload.purpose === 'deposit_image'
      && payload.exp >= now;
  } catch {
    return false;
  }
}
