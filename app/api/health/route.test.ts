import { describe, expect, it } from 'vitest';
import { buildHealthBody } from './route';

describe('/api/health response body', () => {
  const checks = {
    env: { ok: false, detail: 'missing=[JWT_SECRET]' },
    db: { ok: false, detail: 'password authentication failed' },
  };

  it('redacts diagnostic details for public responses', () => {
    const body = buildHealthBody(
      checks,
      ['NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT'],
      false,
      '2026-05-15T00:00:00.000Z',
    );

    expect(body).toEqual({
      ok: false,
      checks: {
        env: { ok: false },
        db: { ok: false },
      },
      timestamp: '2026-05-15T00:00:00.000Z',
    });
  });

  it('keeps diagnostic details for authorized internal responses', () => {
    const body = buildHealthBody(
      checks,
      ['NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT'],
      true,
      '2026-05-15T00:00:00.000Z',
    );

    expect(body).toEqual({
      ok: false,
      checks,
      optionalMissing: ['NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT'],
      timestamp: '2026-05-15T00:00:00.000Z',
    });
  });
});
