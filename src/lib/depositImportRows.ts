import type { EventType } from '@/src/store/useStore';

export type DepositConfidence = 'high' | 'medium' | 'low';

export interface DepositCandidateDraft {
  senderName: string;
  amount: number;
  bank: string | null;
  date: string | null;
  memo: string;
  confidence: DepositConfidence;
  isLikelyEventRelated: boolean;
  reason: string;
}

export interface DepositReviewRow extends DepositCandidateDraft {
  _key: string;
  _selected: boolean;
  _eventType: EventType;
  _relation: string;
  _customRelation: string;
  _customEventName: string;
}

export interface DepositImportDraft {
  senderName: string;
  amount: number;
  bank: string | null;
  date: string | null;
  memo: string;
  reason: string;
  eventType: EventType;
  relation: string;
  customRelation?: string;
  customEventName?: string;
  selected: boolean;
}

export function buildDepositReviewRows(rows: DepositCandidateDraft[], keySeed: number = Date.now()): DepositReviewRow[] {
  return rows.map((row, index) => ({
    ...row,
    _key: `${keySeed}-${index}`,
    _selected: true,
    _eventType: 'other',
    _relation: '지인',
    _customRelation: '',
    _customEventName: '',
  }));
}

function resolveDepositRelation(row: DepositImportDraft) {
  if (row.relation === '기타') {
    return row.customRelation?.trim() || '기타';
  }

  return row.relation.trim() || '지인';
}

function resolveDepositCustomEventName(row: DepositImportDraft) {
  if (row.eventType !== 'other') return '';
  return row.customEventName?.trim() || '';
}

export function buildDepositBulkEntries(rows: DepositImportDraft[], fallbackDate: string) {
  return rows
    .filter((row) => row.selected && row.senderName.trim() && row.amount > 0)
    .map((row) => ({
      targetName: row.senderName.trim(),
      amount: row.amount,
      date: row.date || fallbackDate,
      eventType: row.eventType,
      customEventName: resolveDepositCustomEventName(row),
      location: row.bank || '입금내역',
      relation: resolveDepositRelation(row),
      type: 'INCOME' as const,
      isIncome: true,
      memo: row.memo || row.reason || '입금내역 화면 가져오기',
      account: row.bank || '',
    }));
}
