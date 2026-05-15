/**
 * Environment variable validator.
 *
 * - Required: 부재/empty 시 운영 동작이 즉시 깨지는 변수. startup 시점에 throw 해서
 *   사용자 트래픽 닿기 전 detect (5-8 JWT_SECRET 운영 다운 incident 재발 방지).
 * - Optional: 부재 시 일부 기능만 비활성. log warn.
 *
 * 사용처:
 * - `instrumentation.ts:register()` 시작 시 fail-fast
 * - `/api/health` 내부 인증 응답 body 의 `checks.env`
 */
import { z } from 'zod';

const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'TOSS_DECRYPT_KEY',
  'TOSS_DECRYPT_AAD',
  'TOSS_CALLBACK_SECRET',
  'CRON_SECRET',
  'GEMINI_API_KEY',
  'RESEND_API_KEY',
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

const requiredEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  TOSS_DECRYPT_KEY: z.string().min(1),
  TOSS_DECRYPT_AAD: z.string().min(1),
  TOSS_CALLBACK_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
  GEMINI_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
});

export type EnvValidationResult =
  | { ok: true }
  | { ok: false; missing: string[]; errors: string[] };

export function validateEnv(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  // 1) 직접 missing 체크 (zod issue.code 의존하지 않기 위해)
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    const v = env[key];
    if (!v || !v.trim()) missing.push(key);
  }

  // 2) zod 추가 검증 (길이/형식)
  const errors: string[] = [];
  const parsed = requiredEnvSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      // 이미 missing 으로 분류된 키는 errors 에 중복 추가하지 않음
      if (missing.includes(path)) continue;
      errors.push(`${path}: ${issue.message}`);
    }
  }

  if (missing.length === 0 && errors.length === 0) return { ok: true };
  return { ok: false, missing, errors };
}

export function formatValidationFailure(result: Extract<EnvValidationResult, { ok: false }>): string {
  const parts: string[] = [];
  if (result.missing.length) parts.push(`missing=[${result.missing.join(',')}]`);
  if (result.errors.length) parts.push(`errors=[${result.errors.join('; ')}]`);
  return parts.join(' ');
}

/**
 * Optional 변수 — 부재 시 일부 기능만 비활성. throw 하지 않음.
 * 검증 결과를 log/내부 health 응답으로 노출.
 */
const OPTIONAL_ENV_KEYS = [
  'TOSS_MSG_TEMPLATE_CODE',
  'NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT',
  'NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT',
  'NEXT_PUBLIC_AD_GROUP_ID_STATS_BANNER',
  'NEXT_PUBLIC_API_URL',
] as const;

export function listMissingOptional(env: Record<string, string | undefined> = process.env): string[] {
  return OPTIONAL_ENV_KEYS.filter((k) => !env[k] || !env[k]?.trim());
}
