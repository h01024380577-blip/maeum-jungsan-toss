export function formatAmountMan(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  const man = Math.abs(amount) / 10000;
  const formatted = Number.isInteger(man)
    ? man.toLocaleString()
    : man.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${formatted}만`;
}

export function formatSignedAmountMan(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${formatAmountMan(amount)}`;
}

export function formatManInputValue(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  if (amount === 0) return '';
  const man = amount / 10000;
  return Number.isInteger(man)
    ? String(man)
    : String(Math.round(man * 10) / 10);
}

export function parseManInputToWon(value: string): number {
  const normalized = value.replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 10000));
}
