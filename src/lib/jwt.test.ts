import { beforeEach, describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from './jwt';

describe('jwt helpers', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-value-that-is-long-enough';
  });

  it('round-trips sessionVersion in a signed token', () => {
    const token = signJwt({ userId: 'user-1', userKey: '12345', sessionVersion: 3 });

    expect(verifyJwt(token)).toEqual({
      userId: 'user-1',
      userKey: '12345',
      sessionVersion: 3,
    });
  });
});
