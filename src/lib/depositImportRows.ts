import type { EventType } from '@/src/store/useStore';

export interface DepositImportDraft {
  senderName: string;
  amount: number;
  bank: string | null;
  date: string | null;
  memo: string;
  reason: string;
  eventType: EventType;
  relation: string;
  selected: boolean;
}

export function buildDepositBulkEntries(rows: DepositImportDraft[], fallbackDate: string) {
  return rows
    .filter((row) => row.selected && row.senderName.trim() && row.amount > 0)
    .map((row) => ({
      targetName: row.senderName.trim(),
      amount: row.amount,
      date: row.date || fallbackDate,
      eventType: row.eventType,
      location: row.bank || '입금내역',
      relation: row.relation.trim() || '지인',
      type: 'INCOME' as const,
      isIncome: true,
      memo: row.memo || row.reason || '입금내역 화면 가져오기',
      account: row.bank || '',
    }));
}
