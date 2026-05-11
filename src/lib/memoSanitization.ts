const GENERATED_IMPORT_MEMOS = new Set([
  '대량 불러오기',
  '백업 복원',
  '알림 파싱',
]);

export function normalizeImportMemo(raw: unknown): string {
  const memo = String(raw ?? '').normalize('NFKC').trim();
  if (!memo) return '';
  if (GENERATED_IMPORT_MEMOS.has(memo)) return '';
  if (/^\S+\s+알림\s*파싱$/u.test(memo)) return '';
  return memo;
}
