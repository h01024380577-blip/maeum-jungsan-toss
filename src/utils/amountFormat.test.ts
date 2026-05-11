import { describe, expect, it } from 'vitest';
import {
  formatAmountMan,
  formatManInputValue,
  formatSignedAmountMan,
  parseManInputToWon,
} from './amountFormat';

describe('amountFormat', () => {
  it('formats won values in 만 units', () => {
    expect(formatAmountMan(100000)).toBe('10만');
    expect(formatAmountMan(55000)).toBe('5.5만');
    expect(formatAmountMan(-30000)).toBe('3만');
  });

  it('formats signed won values in 만 units', () => {
    expect(formatSignedAmountMan(100000)).toBe('+10만');
    expect(formatSignedAmountMan(-50000)).toBe('-5만');
    expect(formatSignedAmountMan(0)).toBe('0만');
  });

  it('converts 만 input text back to won values', () => {
    expect(parseManInputToWon('10')).toBe(100000);
    expect(parseManInputToWon('5.5만')).toBe(55000);
    expect(parseManInputToWon('')).toBe(0);
  });

  it('formats won values for 만 input fields', () => {
    expect(formatManInputValue(100000)).toBe('10');
    expect(formatManInputValue(55000)).toBe('5.5');
    expect(formatManInputValue(0)).toBe('');
  });
});
