import { describe, expect, it } from 'vitest';
import { buildDepositBulkEntries, buildDepositReviewRows } from './depositImportRows';

describe('buildDepositReviewRows', () => {
  it('starts every parsed deposit candidate selected so users can opt out', () => {
    const result = buildDepositReviewRows([
      {
        senderName: '문서준',
        amount: 16000,
        bank: null,
        date: '2026-05-02',
        memo: '',
        confidence: 'low',
        isLikelyEventRelated: false,
        reason: '경조사 여부 불명확',
      },
    ], 123);

    expect(result).toEqual([
      expect.objectContaining({
        _key: '123-0',
        _selected: true,
        _eventType: 'other',
        _relation: '지인',
      }),
    ]);
  });
});

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
        relation: '친구',
        selected: true,
      },
    ], '2026-05-22');

    expect(result).toEqual([
      expect.objectContaining({
        targetName: '송재근',
        relation: '친구',
        type: 'INCOME',
        isIncome: true,
      }),
    ]);
  });


  it('uses the custom relationship when 기타 is selected', () => {
    const result = buildDepositBulkEntries([
      {
        senderName: '문서준',
        amount: 16000,
        bank: null,
        date: '2026-05-02',
        memo: '',
        reason: '',
        eventType: 'other',
        relation: '기타',
        customRelation: '동호회',
        selected: true,
      },
    ], '2026-05-22');

    expect(result[0]).toEqual(expect.objectContaining({
      relation: '동호회',
    }));
  });

  it('uses the custom event name when 기타 event is selected', () => {
    const result = buildDepositBulkEntries([
      {
        senderName: '오지아',
        amount: 88000,
        bank: null,
        date: '2026-05-02',
        memo: '',
        reason: '',
        eventType: 'other',
        customEventName: '돌잔치',
        relation: '지인',
        selected: true,
      },
    ], '2026-05-22');

    expect(result[0]).toEqual(expect.objectContaining({
      eventType: 'other',
      customEventName: '돌잔치',
    }));
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
