import { describe, expect, it } from 'vitest';
import {
  buildBulkDuplicateKey,
  buildExistingBulkDuplicateKeys,
  bulkDateSearchWindow,
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

  it('builds different keys for income and expense rows', () => {
    const base = {
      targetName: '김민수',
      amount: parseBulkAmount('10만'),
      dateKey: parseBulkDate('2026.5.3').dateKey,
    };
    expect(buildBulkDuplicateKey({ ...base, type: 'INCOME' })).not.toBe(
      buildBulkDuplicateKey({ ...base, type: 'EXPENSE' }),
    );
  });

  it('builds existing duplicate keys from all transactions and stored fingerprints', () => {
    const storedFingerprint = 'stored-key';
    const keys = buildExistingBulkDuplicateKeys([
      {
        targetName: '김민수',
        date: new Date('2026-05-03T00:00:00.000Z'),
        importFingerprint: storedFingerprint,
        transactions: [
          { amount: 100000, type: 'EXPENSE' },
          { amount: 50000, type: 'INCOME' },
        ],
      },
    ]);

    expect(keys.has(storedFingerprint)).toBe(true);
    expect(keys.has(buildBulkDuplicateKey({
      targetName: '김민수',
      amount: 100000,
      dateKey: '2026-05-03',
      type: 'EXPENSE',
    }))).toBe(true);
    expect(keys.has(buildBulkDuplicateKey({
      targetName: '김민수',
      amount: 50000,
      dateKey: '2026-05-03',
      type: 'INCOME',
    }))).toBe(true);
  });

  it('matches KST-midnight stored dates to user-facing CSV dates', () => {
    const keys = buildExistingBulkDuplicateKeys([
      {
        targetName: '김민수',
        // 2026-05-03 00:00 KST
        date: new Date('2026-05-02T15:00:00.000Z'),
        transactions: [{ amount: 100000, type: 'EXPENSE' }],
      },
    ]);

    expect(keys.has(buildBulkDuplicateKey({
      targetName: '김민수',
      amount: parseBulkAmount('10만'),
      dateKey: parseBulkDate('2026-05-03').dateKey,
      type: 'EXPENSE',
    }))).toBe(true);
  });

  it('uses a one-day buffer around bulk import date searches', () => {
    const window = bulkDateSearchWindow(['2026-05-03', '2026-05-05']);
    expect(window?.startDate.toISOString()).toBe('2026-05-02T00:00:00.000Z');
    expect(window?.endDate.toISOString()).toBe('2026-05-06T23:59:59.999Z');
  });
});
