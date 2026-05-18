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

  it('keeps the selected calendar date visible while the tile has focus', () => {
    const css = read('app/globals.css');

    expect(css).toContain('.react-calendar__tile--active:enabled:focus');
    expect(css).toContain('.react-calendar__tile--active:enabled:hover');
  });

  it('mentions both wedding and obituary URLs in the home URL placeholder', () => {
    const home = read('src/tabs/HomeTab.tsx');

    expect(home).toContain('청첩장 또는 부고장 URL을 붙여넣으세요');
    expect(home).not.toContain('초대장 URL을 붙여넣으세요');
  });

  it('defaults the home input mode to URL', () => {
    const home = read('src/tabs/HomeTab.tsx');

    expect(home).toContain("useState<'text' | 'url'>('url')");
    expect(home).not.toContain("useState<'text' | 'url'>('text')");
  });

  it('keeps the live banner ad group as a fallback when env is missing', () => {
    const myPage = read('src/tabs/MyPageTab.tsx');

    expect(myPage).toContain("|| 'ait.v2.live.b224cbf2d96249cc'");
    expect(myPage).not.toContain("?? ''");
  });

  it('cleans server-only AIT build artifacts after the CSR build settles', () => {
    const script = read('scripts/build-ait.sh');

    expect(script).toContain('cleanup_server_artifacts');
    expect(script).toMatch(/sleep\s+0\.[0-9]+/);
    expect(script).toMatch(/cleanup_server_artifacts[\s\S]+sleep\s+0\.[0-9]+[\s\S]+cleanup_server_artifacts/);
  });

  it('sets the new-user AI credit default to 3 in schema and deployment migration', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/manual-migrations/2026-05-18_set_ai_credit_default_3.sql');
    const deploy = read('scripts/deploy.sh');

    expect(schema).toContain('aiCredits        Int      @default(3)');
    expect(schema).not.toContain('웰컴 5회');
    expect(migration).toContain('ALTER COLUMN "aiCredits" SET DEFAULT 3');
    expect(deploy).toContain('2026-05-18_set_ai_credit_default_3.sql');
  });
});
