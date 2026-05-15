import { afterEach, describe, expect, it } from 'vitest';
import { getAdGroupId } from './ads';

describe('getAdGroupId', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns configured reward ad group IDs', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: ' ai-live ',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: 'csv-live',
    };

    expect(getAdGroupId('AI_CREDIT')).toBe('ai-live');
    expect(getAdGroupId('CSV_CREDIT')).toBe('csv-live');
  });

  it('does not fall back to test ad IDs in production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: '',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: '',
    };

    expect(getAdGroupId('AI_CREDIT')).toBe('');
    expect(getAdGroupId('CSV_CREDIT')).toBe('');
  });

  it('keeps the Apps-in-Toss test ID fallback outside production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: '',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: '',
    };

    expect(getAdGroupId('AI_CREDIT')).toBe('ait-ad-test-rewarded-id');
    expect(getAdGroupId('CSV_CREDIT')).toBe('ait-ad-test-rewarded-id');
  });
});
