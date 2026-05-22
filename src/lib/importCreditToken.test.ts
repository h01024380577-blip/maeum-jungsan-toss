import { describe, expect, it } from 'vitest';
import { mintCsvCreditBypassToken, verifyCsvCreditBypassToken } from './importCreditToken';

describe('CSV credit bypass token', () => {
  it('verifies a token minted for the same user before expiry', () => {
    const token = mintCsvCreditBypassToken('user-1', 1000, 5000);

    expect(verifyCsvCreditBypassToken(token, 'user-1', 2000)).toBe(true);
  });

  it('rejects tokens for another user or after expiry', () => {
    const token = mintCsvCreditBypassToken('user-1', 1000, 5000);

    expect(verifyCsvCreditBypassToken(token, 'user-2', 2000)).toBe(false);
    expect(verifyCsvCreditBypassToken(token, 'user-1', 7000)).toBe(false);
  });
});
