import { describe, expect, it } from 'vitest';
import { buildDepositBulkEntries } from './depositImportRows';

describe('buildDepositBulkEntries', () => {
  it('uses the selected relationship when building bulk entries', () => {
    const result = buildDepositBulkEntries([
      {
        senderName: '송재근',
        amount: 330000,
        bank: '평사리메밀막',
        date: '2026-05-19',
        memo: '',
        reason: '',
        eventType: 'other',
        relation: '직장 동료',
        selected: true,
      },
    ], '2026-05-22');

    expect(result).toEqual([
      expect.objectContaining({
        targetName: '송재근',
        relation: '직장 동료',
        type: 'INCOME',
        isIncome: true,
      }),
    ]);
  });

  it('filters unselected or invalid rows', () => {
    const result = buildDepositBulkEntries([
      {
        senderName: '선택해제',
        amount: 10000,
        bank: null,
        date: null,
        memo: '',
        reason: '',
        eventType: 'other',
        relation: '지인',
        selected: false,
      },
      {
        senderName: '',
        amount: 10000,
        bank: null,
        date: null,
        memo: '',
        reason: '',
        eventType: 'other',
        relation: '가족',
        selected: true,
      },
    ], '2026-05-22');

    expect(result).toEqual([]);
  });
});
