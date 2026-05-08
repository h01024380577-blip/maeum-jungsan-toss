import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv, formatValidationFailure, listMissingOptional } from './env';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://u:p@h:6543/db',
  DIRECT_URL: 'postgresql://u:p@h:5432/db',
  JWT_SECRET: 'a'.repeat(64),
  TOSS_DECRYPT_KEY: 'decrypt-key',
  TOSS_DECRYPT_AAD: 'decrypt-aad',
  TOSS_CALLBACK_SECRET: 'callback-secret',
  CRON_SECRET: 'cron-secret-value-1234',
  GEMINI_API_KEY: 'gemini-key',
  RESEND_API_KEY: 're_test_key',
};

describe('validateEnv', () => {
  it('returns ok=true when all required vars are present and valid', () => {
    const result = validateEnv(VALID_ENV);
    expect(result).toEqual({ ok: true });
  });

  it('flags missing required keys', () => {
    const env = { ...VALID_ENV };
    delete (env as any).JWT_SECRET;
    delete (env as any).GEMINI_API_KEY;
    const result = validateEnv(env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(expect.arrayContaining(['JWT_SECRET', 'GEMINI_API_KEY']));
      expect(result.missing).toHaveLength(2);
    }
  });

  it('treats empty string as missing', () => {
    const result = validateEnv({ ...VALID_ENV, RESEND_API_KEY: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('RESEND_API_KEY');
    }
  });

  it('treats whitespace-only string as missing', () => {
    const result = validateEnv({ ...VALID_ENV, TOSS_DECRYPT_KEY: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain('TOSS_DECRYPT_KEY');
    }
  });

  it('reports JWT_SECRET length error (< 32 chars)', () => {
    const result = validateEnv({ ...VALID_ENV, JWT_SECRET: 'too-short' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).not.toContain('JWT_SECRET'); // present, not missing
      expect(result.errors.some((e) => e.includes('JWT_SECRET') && e.includes('32'))).toBe(true);
    }
  });

  it('reports CRON_SECRET length error (< 16 chars)', () => {
    const result = validateEnv({ ...VALID_ENV, CRON_SECRET: 'short' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('CRON_SECRET') && e.includes('16'))).toBe(true);
    }
  });

  it('does not duplicate keys between missing and errors', () => {
    const env = { ...VALID_ENV };
    delete (env as any).JWT_SECRET;
    const result = validateEnv(env);
    if (!result.ok) {
      expect(result.missing).toContain('JWT_SECRET');
      expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(false);
    }
  });

  it('reports multiple errors at once', () => {
    const env = { ...VALID_ENV };
    delete (env as any).DATABASE_URL;
    delete (env as any).DIRECT_URL;
    const result = validateEnv({ ...env, JWT_SECRET: 'short', CRON_SECRET: 'short' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(expect.arrayContaining(['DATABASE_URL', 'DIRECT_URL']));
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('formatValidationFailure', () => {
  it('joins missing and errors into a single readable string', () => {
    const formatted = formatValidationFailure({
      ok: false,
      missing: ['A', 'B'],
      errors: ['C: too short'],
    });
    expect(formatted).toContain('missing=[A,B]');
    expect(formatted).toContain('errors=[C: too short]');
  });

  it('omits empty sections', () => {
    expect(formatValidationFailure({ ok: false, missing: ['X'], errors: [] })).toBe('missing=[X]');
    expect(formatValidationFailure({ ok: false, missing: [], errors: ['Y'] })).toBe('errors=[Y]');
  });
});

describe('listMissingOptional', () => {
  it('returns empty when all optional keys are set', () => {
    const env = {
      TOSS_MSG_TEMPLATE_CODE: 'tpl',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: 'g1',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: 'g2',
      NEXT_PUBLIC_API_URL: 'https://x',
    };
    expect(listMissingOptional(env)).toEqual([]);
  });

  it('returns missing/empty optional keys', () => {
    const env = {
      TOSS_MSG_TEMPLATE_CODE: 'tpl',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: '',
      // NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT undefined
      NEXT_PUBLIC_API_URL: 'https://x',
    };
    const missing = listMissingOptional(env);
    expect(missing).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT', 'NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT']),
    );
    expect(missing).not.toContain('TOSS_MSG_TEMPLATE_CODE');
  });
});

describe('validateEnv on real process.env (sanity)', () => {
  // 로컬 .env 가 모든 required 키를 set 하고 있어야 통과 (vitest config 가 .env 로드 안 하므로 process 는 그대로)
  const originalEnv = process.env;
  beforeEach(() => {
    // 격리 위해 stub 적용
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses process.env by default', () => {
    process.env = VALID_ENV as any;
    expect(validateEnv()).toEqual({ ok: true });
  });
});
