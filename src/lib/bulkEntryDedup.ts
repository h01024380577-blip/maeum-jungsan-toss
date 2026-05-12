export type BulkTransactionType = 'INCOME' | 'EXPENSE';
export type BulkEventType = 'WEDDING' | 'FUNERAL' | 'BIRTHDAY' | 'OTHER';

const BULK_DUPLICATE_SEPARATOR = '\u001f';
const MAN_UNIT_THRESHOLD = 1000;
const BULK_DATE_SEARCH_BUFFER_DAYS = 1;

export type ExistingBulkDuplicateEvent = {
  targetName: string;
  date: Date;
  importFingerprint?: string | null;
  transactions?: Array<{
    amount: number;
    type: BulkTransactionType;
  }>;
};

export function normalizeBulkEventType(raw: unknown): BulkEventType {
  const upper = String(raw ?? '').toUpperCase();
  if (upper === 'WEDDING' || upper === 'FUNERAL' || upper === 'BIRTHDAY' || upper === 'OTHER') {
    return upper;
  }
  const lower = String(raw ?? '').toLowerCase();
  if (lower.includes('결혼') || lower === 'wedding') return 'WEDDING';
  if (lower.includes('장례') || lower.includes('부고') || lower.includes('조의') || lower === 'funeral') return 'FUNERAL';
  if (lower.includes('생일') || lower.includes('돌') || lower === 'birthday') return 'BIRTHDAY';
  return 'OTHER';
}

export function normalizeBulkName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .replace(/[·ㆍ・.,/\\|_-]/g, '')
    .replace(/님$/u, '');
}

export function parseBulkAmount(raw: unknown): number {
  if (typeof raw === 'number') return normalizeBulkAmountNumber(raw);
  if (typeof raw !== 'string') return 0;

  const value = raw.normalize('NFKC').trim();
  if (!value) return 0;

  const hasManUnit = value.includes('만');
  const hasWonUnit = value.includes('원') || value.includes('₩');
  const normalized = value.replace(/,/g, '');
  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return 0;

  const parsed = Math.abs(Number(matched[0]));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  if (hasManUnit || (!hasWonUnit && parsed < MAN_UNIT_THRESHOLD)) {
    return Math.round(parsed * 10000);
  }

  return Math.round(parsed);
}

function normalizeBulkAmountNumber(raw: number): number {
  const amount = Math.abs(raw);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  // Older clients stripped "10만" to numeric 10 before sending it to the API.
  // In this app domain, sub-1000 bulk amounts are interpreted as 만 units.
  if (amount < MAN_UNIT_THRESHOLD) return Math.round(amount * 10000);
  return Math.round(amount);
}

export function parseBulkDate(raw: unknown, fallback = new Date()): { date: Date; dateKey: string } {
  const value = raw instanceof Date ? raw.toISOString() : String(raw ?? '').normalize('NFKC').trim();
  const direct = matchDateKey(value) ?? matchKoreanDateKey(value);
  const dateKey = direct ?? parseFallbackDateKey(value) ?? dateKeyInKst(fallback);
  return {
    date: dateFromBulkDateKey(dateKey),
    dateKey,
  };
}

export function dateFromBulkDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function dateKeyFromBulkDate(date: Date): string {
  return dateKeyInKst(date);
}

export function buildBulkDuplicateKey(entry: {
  targetName: string;
  amount: number;
  date?: Date;
  dateKey?: string;
  type: BulkTransactionType;
}): string {
  const dateKey = entry.dateKey ?? (entry.date ? dateKeyFromBulkDate(entry.date) : '');
  return [
    normalizeBulkName(entry.targetName),
    dateKey,
    Math.round(Math.abs(entry.amount)),
    entry.type,
  ].join(BULK_DUPLICATE_SEPARATOR);
}

export function buildExistingBulkDuplicateKeys(events: ExistingBulkDuplicateEvent[]): Set<string> {
  const keys = new Set<string>();

  for (const event of events) {
    if (typeof event.importFingerprint === 'string' && event.importFingerprint.length > 0) {
      keys.add(event.importFingerprint);
    }

    for (const transaction of event.transactions ?? []) {
      keys.add(buildBulkDuplicateKey({
        targetName: event.targetName,
        amount: transaction.amount,
        date: event.date,
        type: transaction.type,
      }));
    }
  }

  return keys;
}

export function bulkDateSearchWindow(dateKeys: string[]): { startDate: Date; endDate: Date } | null {
  if (dateKeys.length === 0) return null;

  const sorted = Array.from(new Set(dateKeys)).sort();
  const startDate = addUtcDays(dateFromBulkDateKey(sorted[0]), -BULK_DATE_SEARCH_BUFFER_DAYS);
  const endDate = addUtcDays(dateFromBulkDateKey(sorted[sorted.length - 1]), BULK_DATE_SEARCH_BUFFER_DAYS);
  endDate.setUTCHours(23, 59, 59, 999);

  return { startDate, endDate };
}

function matchDateKey(value: string): string | null {
  const matched = value.match(/(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!matched) return null;
  return buildDateKey(matched[1], matched[2], matched[3]);
}

function matchKoreanDateKey(value: string): string | null {
  const matched = value.match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (!matched) return null;
  return buildDateKey(matched[1], matched[2], matched[3]);
}

function buildDateKey(yearRaw: string, monthRaw: string, dayRaw: string): string {
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw.padStart(4, '0');
  const month = monthRaw.padStart(2, '0');
  const day = dayRaw.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseFallbackDateKey(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateKeyInKst(parsed);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKeyInKst(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}
