import { chromium } from '/Users/jiwon/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';

// ─── Mock data ─────────────────────────────────────────────────────────────

const MOCK_ME = { userId: 'mock-user', name: '김지원', notificationsEnabled: false };

const MOCK_CONTACTS = [
  { id: 'c1', name: '김하운', relation: '친구', userId: 'mock-user' },
  { id: 'c2', name: '박민준', relation: '직장', userId: 'mock-user' },
  { id: 'c3', name: '이서연', relation: '친구', userId: 'mock-user' },
  { id: 'c4', name: '최유진', relation: '가족', userId: 'mock-user' },
  { id: 'c5', name: '정다은', relation: '친구', userId: 'mock-user' },
];

const now = Date.now();
const day = 86400000;
const MOCK_ENTRIES = [
  { id: 'e1', contactId: 'c1', eventType: 'wedding', type: 'EXPENSE', date: '2026-06-14', location: '라움아트센터', targetName: '김하운', amount: 100000, relation: '친구', isIncome: false, source: 'URL',    createdAt: now - day * 1,  userId: 'mock-user' },
  { id: 'e2', contactId: 'c2', eventType: 'funeral', type: 'INCOME',  date: '2026-06-08', location: '',          targetName: '박민준', amount: 50000,  relation: '직장', isIncome: true,  source: 'MANUAL', createdAt: now - day * 3,  userId: 'mock-user' },
  { id: 'e3', contactId: 'c3', eventType: 'wedding', type: 'INCOME',  date: '2026-06-08', location: '롯데호텔', targetName: '이서연', amount: 100000, relation: '친구', isIncome: true,  source: 'CSV',    createdAt: now - day * 4,  userId: 'mock-user' },
  { id: 'e4', contactId: 'c4', eventType: 'birthday',type: 'INCOME',  date: '2026-05-30', location: '',          targetName: '최유진', amount: 70000,  relation: '가족', isIncome: true,  source: 'MANUAL', createdAt: now - day * 6,  userId: 'mock-user' },
  { id: 'e5', contactId: 'c1', eventType: 'funeral', type: 'INCOME',  date: '2026-05-22', location: '',          targetName: '김하운', amount: 50000,  relation: '친구', isIncome: true,  source: 'MANUAL', createdAt: now - day * 14, userId: 'mock-user' },
  { id: 'e6', contactId: 'c3', eventType: 'wedding', type: 'EXPENSE', date: '2026-05-20', location: '그랜드볼룸', targetName: '이서연', amount: 100000, relation: '친구', isIncome: false, source: 'MANUAL', createdAt: now - day * 16, userId: 'mock-user' },
  { id: 'e7', contactId: 'c2', eventType: 'wedding', type: 'EXPENSE', date: '2026-04-10', location: '신라호텔', targetName: '박민준', amount: 100000, relation: '직장', isIncome: false, source: 'MANUAL', createdAt: now - day * 56, userId: 'mock-user' },
];

const MOCK_ANALYZE_RESULT = {
  success: true,
  data: {
    targetName: '김도윤·이서연',
    eventType: 'wedding',
    date: '2026-06-14',
    location: '라움아트센터',
    relation: '친구',
    type: 'EXPENSE',
    isIncome: false,
    amount: 100000,
  },
};

const MOCK_CREDITS = {
  ai: { balance: 3, cap: 3, canWatchAd: true },
  csv: { balance: 2, cap: 3, canWatchAd: true },
  ad: { watchesRemaining: 3, dailyLimit: 3, resetAt: null },
  loaded: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function setupMocks(page) {
  await page.route('**/api/auth/me**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ME) })
  );
  await page.route('**/api/entries**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: MOCK_ENTRIES, contacts: MOCK_CONTACTS }) })
  );
  await page.route('**/api/contacts**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: MOCK_CONTACTS }) })
  );
  await page.route('**/api/credits**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CREDITS) })
  );
  await page.route('**/api/analyze**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_RESULT) })
  );
  await page.route('**/api/parse-url**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ANALYZE_RESULT) })
  );
}

async function hideOnboarding(page) {
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach(el => {
      const s = window.getComputedStyle(el);
      if (s.position === 'fixed' && parseInt(s.zIndex, 10) >= 500) el.style.display = 'none';
    });
  });
}

async function load(page, path) {
  await page.goto(`http://localhost:3000${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);
  await hideOnboarding(page);
  await page.waitForTimeout(300);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('heartbook-onboarding-seen', 'true'));
await setupMocks(page);

// ── Slide 1: 전체 내역 (overview)
await load(page, '/history');
const slide1Bytes = await page.screenshot({ type: 'png' });
writeFileSync('public/onboarding/maeum-onboarding-01-overview.png', slide1Bytes);
console.log('✓ slide1 → maeum-onboarding-01-overview.png');

// ── Slide 2: AI 분석 후 폼 채워진 상태
await load(page, '/');
// AI 배너 클릭 → AI 시트 열기
await page.getByText('AI로 초대장 분석하기').click();
await page.waitForTimeout(600);
// URL 입력
await page.locator('textarea[placeholder*="URL"]').fill('https://wedding.example.com/doyoon-seoyeon');
await page.waitForTimeout(300);
// 분석하기 버튼 클릭
await page.getByRole('button', { name: '분석하기', exact: true }).click();
// API 응답 처리 + 폼 채워지길 대기
await page.waitForTimeout(1500);
// AI 시트가 닫히고 폼이 채워진 홈 화면 캡처
const slide2Bytes = await page.screenshot({ type: 'png' });
writeFileSync('public/onboarding/maeum-onboarding-02-ai-analysis.png', slide2Bytes);
console.log('✓ slide2 → maeum-onboarding-02-ai-analysis.png');

// ── Slide 3: 내역 "받은 마음" 필터
await load(page, '/history');
await page.getByText('받은 마음').first().click();
await page.waitForTimeout(400);
const slide3Bytes = await page.screenshot({ type: 'png' });
writeFileSync('public/onboarding/maeum-onboarding-import-01-deposit.png', slide3Bytes);
console.log('✓ slide3 → maeum-onboarding-import-01-deposit.png');

// ── Slide 4: MY / 통계
await load(page, '/stats');
const slide4Bytes = await page.screenshot({ type: 'png' });
writeFileSync('public/onboarding/maeum-onboarding-05-my-stats.png', slide4Bytes);
console.log('✓ slide4 → maeum-onboarding-05-my-stats.png');

await browser.close();
console.log('Done.');
