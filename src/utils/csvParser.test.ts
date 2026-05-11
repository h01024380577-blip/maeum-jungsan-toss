import { describe, expect, it } from 'vitest';
import { cleanAmount, cleanDate } from './csvParser';

describe('csvParser', () => {
  it('cleans amount values with 만 and 원 units', () => {
    expect(cleanAmount('10만')).toBe(100000);
    expect(cleanAmount('5.5만원')).toBe(55000);
    expect(cleanAmount('100,000원')).toBe(100000);
    expect(cleanAmount('10')).toBe(100000);
  });

  it('normalizes simple date values', () => {
    expect(cleanDate('2026.5.3')).toBe('2026-05-03');
    expect(cleanDate('26/5/3')).toBe('2026-05-03');
  });
});
