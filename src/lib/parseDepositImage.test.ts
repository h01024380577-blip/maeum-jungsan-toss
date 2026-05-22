import { describe, expect, it } from 'vitest';
import { normalizeDepositImageBatch, normalizeDepositImageItem } from './parseDepositImage';

describe('normalizeDepositImageItem', () => {
  it('normalizes one deposit row from AI vision output', () => {
    expect(normalizeDepositImageItem({
      senderName: '  김진호 ',
      amount: '50,000',
      bank: '토스뱅크',
      date: '2026-05-21',
      memo: '축의금',
      confidence: 'HIGH',
      isLikelyEventRelated: true,
      reason: '메모에 축의금이 있음',
    })).toEqual({
      senderName: '김진호',
      amount: 50000,
      bank: '토스뱅크',
      date: '2026-05-21',
      memo: '축의금',
      confidence: 'high',
      isLikelyEventRelated: true,
      reason: '메모에 축의금이 있음',
    });
  });

  it('rejects rows without a sender name or positive amount', () => {
    expect(normalizeDepositImageItem({ senderName: '', amount: 50000 })).toBeNull();
    expect(normalizeDepositImageItem({ senderName: '김진호', amount: 0 })).toBeNull();
    expect(normalizeDepositImageItem({ senderName: '김진호', amount: '결제' })).toBeNull();
  });

  it('keeps non-event deposits selectable but marks them as unlikely', () => {
    const item = normalizeDepositImageItem({
      senderName: '카카오페이증권',
      amount: 1300,
      isLikelyEventRelated: false,
      reason: '이자 입금으로 보임',
    });

    expect(item?.isLikelyEventRelated).toBe(false);
    expect(item?.reason).toBe('이자 입금으로 보임');
  });
});

describe('normalizeDepositImageBatch', () => {
  it('filters invalid rows and preserves valid deposit candidates', () => {
    const result = normalizeDepositImageBatch({
      data: [
        { senderName: '김진호', amount: 50000, confidence: 'high' },
        { senderName: '', amount: 30000 },
        { senderName: '이나은', amount: '100,000원', confidence: 'medium', isLikelyEventRelated: false },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.senderName)).toEqual(['김진호', '이나은']);
    expect(result[1].amount).toBe(100000);
    expect(result[1].isLikelyEventRelated).toBe(false);
  });
});
