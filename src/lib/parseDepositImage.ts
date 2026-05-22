import { calculateConfidence, type Confidence } from './geminiHelpers';

export interface ParsedDepositImageItem {
  senderName: string;
  amount: number;
  bank: string | null;
  date: string | null;
  memo: string;
  confidence: Confidence;
  isLikelyEventRelated: boolean;
  reason: string;
}

const VALID_CONFIDENCE: readonly Confidence[] = ['high', 'medium', 'low'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  if (typeof value !== 'string') return 0;

  const normalized = value
    .replace(/,/g, '')
    .replace(/원/g, '')
    .trim();
  if (!normalized) return 0;

  const manMatch = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*만/);
  if (manMatch) return Math.round(Number(manMatch[1]) * 10000);

  const amount = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeDepositImageItem(raw: unknown): ParsedDepositImageItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const senderName = cleanString(r.senderName);
  const amount = parseAmount(r.amount);
  if (!senderName || amount <= 0) return null;

  const bank = cleanString(r.bank) || null;
  const rawDate = cleanString(r.date);
  const date = DATE_PATTERN.test(rawDate) ? rawDate : null;
  const memo = cleanString(r.memo);
  const reason = cleanString(r.reason);

  const rawConfidence = cleanString(r.confidence).toLowerCase();
  const confidence: Confidence = VALID_CONFIDENCE.includes(rawConfidence as Confidence)
    ? (rawConfidence as Confidence)
    : calculateConfidence([senderName, amount, bank, date]);

  return {
    senderName,
    amount,
    bank,
    date,
    memo,
    confidence,
    isLikelyEventRelated: r.isLikelyEventRelated === false ? false : true,
    reason,
  };
}

export function normalizeDepositImageBatch(parsed: unknown): ParsedDepositImageItem[] {
  const data = (parsed as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeDepositImageItem)
    .filter((item): item is ParsedDepositImageItem => item !== null);
}
