import { describe, expect, it } from 'vitest';
import {
  buildBulkDuplicateKey,
  normalizeBulkName,
  parseBulkAmount,
  parseBulkDate,
} from './bulkEntryDedup';

describe('bulkEntryDedup', () => {
  it('parses 만 amounts as won values', () => {
    expect(parseBulkAmount('10만')).toBe(100000);
    expect(parseBulkAmount('5.5만원')).toBe(55000);
    expect(parseBulkAmount('100,000원')).toBe(100000);
    expect(parseBulkAmount(10)).toBe(100000);
  });

  it('normalizes names for duplicate matching', () => {
    expect(normalizeBulkName(' 김 민수님 ')).toBe('김민수');
    expect(normalizeBulkName('김민수·이서연')).toBe('김민수이서연');
    expect(normalizeBulkName('김민수 이서연')).toBe('김민수이서연');
  });

  it('normalizes common date formats to a stable key', () => {
    expect(parseBulkDate('2026.5.3').dateKey).toBe('2026-05-03');
    expect(parseBulkDate('26/05/03').dateKey).toBe('2026-05-03');
    expect(parseBulkDate('2026년 5월 3일').dateKey).toBe('2026-05-03');
  });

  it('builds identical keys for equivalent duplicate rows', () => {
    const a = buildBulkDuplicateKey({
      targetName: '김 민수님',
      amount: parseBulkAmount('10만'),
      dateKey: parseBulkDate('2026.5.3').dateKey,
      type: 'EXPENSE',
    });
    const b = buildBulkDuplicateKey({
      targetName: '김민수',
      amount: parseBulkAmount('100,000원'),
      dateKey: parseBulkDate('2026-05-03').dateKey,
      type: 'EXPENSE',
    });
    expect(a).toBe(b);
  });
});
