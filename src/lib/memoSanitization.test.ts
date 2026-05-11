import { describe, expect, it } from 'vitest';
import { normalizeImportMemo } from './memoSanitization';

describe('memoSanitization', () => {
  it('removes generated import memo labels', () => {
    expect(normalizeImportMemo('대량 불러오기')).toBe('');
    expect(normalizeImportMemo(' 백업 복원 ')).toBe('');
    expect(normalizeImportMemo('알림 파싱')).toBe('');
    expect(normalizeImportMemo('토스뱅크 알림 파싱')).toBe('');
  });

  it('preserves user-entered memo content', () => {
    expect(normalizeImportMemo('축의금 전달 확인')).toBe('축의금 전달 확인');
  });
});
