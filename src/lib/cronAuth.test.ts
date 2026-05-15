import { afterEach, describe, expect, it } from 'vitest';
import { isCronRequestAuthorized } from './cronAuth';

function requestWithAuth(value: string | null) {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() !== 'authorization') return null;
        return value;
      },
    },
  };
}

describe('cron auth', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it('allows a matching bearer token', () => {
    process.env.CRON_SECRET = 'cron-secret-value-1234';

    expect(isCronRequestAuthorized(requestWithAuth('Bearer cron-secret-value-1234'))).toBe(true);
  });

  it('rejects requests when CRON_SECRET is missing', () => {
    delete process.env.CRON_SECRET;

    expect(isCronRequestAuthorized(requestWithAuth('Bearer undefined'))).toBe(false);
    expect(isCronRequestAuthorized(requestWithAuth(null))).toBe(false);
  });

  it('rejects mismatched bearer tokens', () => {
    process.env.CRON_SECRET = 'cron-secret-value-1234';

    expect(isCronRequestAuthorized(requestWithAuth('Bearer wrong'))).toBe(false);
  });
});
