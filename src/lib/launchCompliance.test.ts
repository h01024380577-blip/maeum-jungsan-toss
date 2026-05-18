import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Apps-in-Toss launch compliance', () => {
  it('forces the mini-app theme to light mode', () => {
    const layout = read('app/layout.tsx');
    const theme = read('src/lib/theme.tsx');
    const settings = read('src/components/mypage/SettingsSheet.tsx');

    expect(layout).not.toContain('prefers-color-scheme');
    expect(layout).not.toContain("classList.add('dark')");
    expect(layout).toContain("document.documentElement.style.colorScheme='light'");

    expect(theme).not.toContain('"dark"');
    expect(theme).not.toContain('"system"');
    expect(settings).not.toContain('ThemePickerSheet');
  });

  it('labels the account removal action as membership withdrawal', () => {
    const settings = read('src/components/mypage/SettingsSheet.tsx');
    const dialog = read('src/components/mypage/LogoutConfirmDialog.tsx');

    expect(settings).toContain('회원탈퇴');
    expect(settings).not.toContain('label="로그아웃"');
    expect(dialog).toContain('저장된 데이터가 모두 삭제');
  });

  it('avoids direct external navigation and browser alerts in review-sensitive UI', () => {
    const reviewSensitiveFiles = [
      'src/components/mypage/FeedbackSheet.tsx',
      'src/tabs/HomeTab.tsx',
      'src/tabs/ContactsTab.tsx',
    ];
    const source = reviewSensitiveFiles.map((path) => read(path)).join('\n');

    expect(source).not.toMatch(/alert\s*\(/);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*`mailto:/);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*['"]supertoss:\/\//);
  });
});
