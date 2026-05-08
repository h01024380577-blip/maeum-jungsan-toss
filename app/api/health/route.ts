import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { validateEnv, formatValidationFailure, listMissingOptional } from '@/src/lib/env';

/**
 * Health check endpoint — deploy.sh smoke test 와 외부 모니터링용.
 *
 * checks:
 *   - env: 필수 환경변수 검증
 *   - db:  prisma `SELECT 1`
 *
 * 모두 통과 → 200, 하나라도 실패 → 503.
 * 응답 body 의 `checks.<name>.detail` 로 원인 노출 (운영 디버깅).
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  const envResult = validateEnv();
  checks.env = envResult.ok
    ? { ok: true }
    : { ok: false, detail: formatValidationFailure(envResult) };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true };
  } catch (err) {
    checks.db = {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const optionalMissing = listMissingOptional();
  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      ok: allOk,
      checks,
      optionalMissing,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
