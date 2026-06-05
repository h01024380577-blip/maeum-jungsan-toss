# 온보딩 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분산된 온보딩(IntroScreen 1p + AI버튼 2p + 가져오기버튼 2p + 9단계 투어)을 첫 진입 시 전체화면 슬라이드 5장(기능 4장 + 로그인 CTA 1장)으로 통합하고, 건너뛰기로 게스트 진입을 허용한다.

**Architecture:** `FullscreenSlideOnboarding` 컴포넌트를 신규 생성하여 `components/Providers.tsx`에서 기존 `IntroScreen`을 대체한다. `showOnboarding` 조건에 `!hasSeenOnboarding`을 추가해 건너뛰기 후 재노출을 방지한다. AI/가져오기 슬라이드 온보딩은 탭 파일에서 제거하고, Tour 관련 파일 9개를 삭제한다.

**Tech Stack:** Next.js App Router, React 19, framer-motion, Tailwind CSS v4, sonner toast, @apps-in-toss/web-framework (tossLogin)

---

## 파일 맵

| 액션 | 경로 | 역할 |
|---|---|---|
| **Create** | `src/components/onboarding/FullscreenSlideOnboarding.tsx` | 전체화면 5슬라이드 온보딩 (기능 4 + CTA 1) |
| **Modify** | `components/Providers.tsx` | IntroScreen → FullscreenSlideOnboarding, showOnboarding 조건 수정 |
| **Modify** | `src/tabs/HomeTab.tsx` | AI_SLIDES / AI_ONBOARDING_KEY / highlightAiBanner / showAiOnboarding 제거 |
| **Modify** | `src/tabs/HistoryTab.tsx` | IMPORT_SLIDES / IMPORT_ONBOARDING_KEY / highlightImport / showImportOnboarding 제거 |
| **Delete** | `src/components/onboarding/IntroScreen.tsx` | 구 온보딩 전체화면 (대체됨) |
| **Delete** | `src/components/onboarding/SlideOnboarding.tsx` | 구 바텀시트 슬라이드 (대체됨) |
| **Delete** | `src/components/onboarding/OnboardingTourContext.tsx` | Tour 컨텍스트 (제거) |
| **Delete** | `src/components/onboarding/onboardingTour.ts` | Tour 스텝 정의 (제거) |
| **Delete** | `src/components/onboarding/tooltipPosition.ts` | Tour 툴팁 위치 계산 (제거) |
| **Delete** | `src/components/onboarding/onboardingTour.test.ts` | Tour 테스트 (제거) |
| **Delete** | `src/components/onboarding/onboardingTypography.test.ts` | Tour 타이포 테스트 (제거) |
| **Delete** | `src/components/onboarding/tooltipPosition.test.ts` | 툴팁 위치 테스트 (제거) |
| **Delete** | `src/components/Onboarding.tsx` | Tour UI 컴포넌트 (제거) |

---

## Task 1: FullscreenSlideOnboarding 컴포넌트 생성

**Files:**
- Create: `src/components/onboarding/FullscreenSlideOnboarding.tsx`

- [ ] **Step 1: 파일 생성**

`src/components/onboarding/FullscreenSlideOnboarding.tsx`를 아래 내용으로 생성한다.

```tsx
'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useStore } from '@/src/store/useStore';
import { apiFetch, setAuthToken } from '@/src/lib/apiClient';
import { tossLogin } from '@/src/lib/tossAuth';

interface Slide {
  image: string;
  imageAlt: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    image: '/onboarding/maeum-onboarding-01-overview.png',
    imageAlt: '마음정산 홈 화면',
    title: '경조사 마음,\n한눈에 정리해요',
    body: '줬다·받은 마음을 한곳에 기록하고\n언제든 꺼내볼 수 있어요',
  },
  {
    image: '/onboarding/maeum-onboarding-02-ai-analysis.png',
    imageAlt: 'AI 자동 입력 화면',
    title: '청첩장 링크 하나로\n자동 입력돼요',
    body: 'AI가 이름·날짜·장소를 읽어서\n바로 채워줘요',
  },
  {
    image: '/onboarding/maeum-onboarding-import-01-deposit.png',
    imageAlt: '입금 내역 분석 화면',
    title: '받은 마음도\n자동으로 정리해요',
    body: '입금 내역 이미지를 올리면 AI가\n받은 마음을 한번에 찾아줘요',
  },
  {
    image: '/onboarding/maeum-onboarding-05-my-stats.png',
    imageAlt: '관계별 통계 화면',
    title: '관계별 통계로\n흐름을 파악해요',
    body: '누구에게 얼마나 마음을 건넸는지\n한눈에 볼 수 있어요',
  },
];

// SLIDES.length(4) = 기능 슬라이드, index 4 = CTA 슬라이드
const CTA_INDEX = SLIDES.length;

interface FullscreenSlideOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function FullscreenSlideOnboarding({ onComplete, onSkip }: FullscreenSlideOnboardingProps) {
  const { loadFromSupabase } = useStore();
  const [index, setIndex] = useState(0);
  const [isLogging, setIsLogging] = useState(false);
  const isCta = index === CTA_INDEX;

  const handleLogin = useCallback(async () => {
    setIsLogging(true);
    try {
      const result = await tossLogin();
      if (!result) {
        toast.error('토스 로그인이 취소되었습니다.');
        return;
      }
      const res = await apiFetch('/api/auth/toss', {
        method: 'POST',
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || err.error || `로그인 실패 (${res.status})`);
        return;
      }
      const data = await res.json();
      if (data.token) setAuthToken(data.token);
      localStorage.setItem('heartbook-onboarding-seen', 'true');
      await loadFromSupabase();
      onComplete();
    } catch {
      toast.error('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLogging(false);
    }
  }, [loadFromSupabase, onComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('heartbook-onboarding-seen', 'true');
    onSkip();
  }, [onSkip]);

  const slide = SLIDES[index];

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-white">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {isCta ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-blue-50 to-emerald-50">
              <Image
                src="/icon.png"
                alt="마음정산"
                width={80}
                height={80}
                className="h-20 w-20 rounded-[24px] shadow-lg"
              />
              <p className="text-center text-[14px] font-semibold leading-relaxed text-gray-500">
                경조사 마음을<br />스마트하게 정리해요
              </p>
            </div>
          ) : (
            <div className="relative flex-1 overflow-hidden bg-gray-100">
              <Image
                src={slide.image}
                alt={slide.imageAlt}
                fill
                className="object-cover object-top"
                priority={index === 0}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 하단 고정 콘텐츠 */}
      <div className="shrink-0 px-6 pb-[max(24px,env(safe-area-inset-bottom,24px))] pt-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: CTA_INDEX + 1 }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>
          {!isCta && (
            <button
              type="button"
              onClick={handleSkip}
              className="text-[13px] font-bold text-gray-400 active:text-gray-600"
            >
              건너뛰기
            </button>
          )}
        </div>

        <h2 className="whitespace-pre-line text-[22px] font-black leading-snug text-gray-950">
          {isCta ? '시작할 준비가\n됐어요' : slide.title}
        </h2>
        <p className="mt-2 whitespace-pre-line break-keep text-[15px] font-semibold leading-relaxed text-gray-500">
          {isCta ? '로그인하면 기록이 안전하게\n저장돼요' : slide.body}
        </p>

        <button
          type="button"
          onClick={isCta ? handleLogin : () => setIndex((i) => i + 1)}
          disabled={isLogging}
          className="mt-5 h-14 w-full rounded-2xl bg-blue-500 text-[16px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {isCta ? (isLogging ? '로그인 중...' : '토스로 시작하기') : '다음'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음 (또는 기존 에러만)

- [ ] **Step 3: 커밋**

```bash
git add src/components/onboarding/FullscreenSlideOnboarding.tsx
git commit -m "feat(onboarding): FullscreenSlideOnboarding 컴포넌트 생성"
```

---

## Task 2: Providers.tsx — IntroScreen 교체 및 showOnboarding 조건 수정

**Files:**
- Modify: `components/Providers.tsx`

현재 `components/Providers.tsx`:
- Line 8: `import IntroScreen from "@/src/components/onboarding/IntroScreen";`
- Line 19: `const [hasSeenOnboarding, setHasSeenOnboarding] = useState(...)`
- Line 52: `const showOnboarding = !tossUserId && !SKIP_ONBOARDING_PATHS.includes(pathname);`
- Lines 57-59: `<IntroScreen onComplete={handleOnboardingComplete} />`

- [ ] **Step 1: import 교체**

`components/Providers.tsx` 8번 줄을:
```tsx
import IntroScreen from "@/src/components/onboarding/IntroScreen";
```
→
```tsx
import FullscreenSlideOnboarding from "@/src/components/onboarding/FullscreenSlideOnboarding";
```

- [ ] **Step 2: showOnboarding 조건에 !hasSeenOnboarding 추가**

52번 줄을:
```tsx
  const showOnboarding = !tossUserId && !SKIP_ONBOARDING_PATHS.includes(pathname);
```
→
```tsx
  const showOnboarding = !tossUserId && !hasSeenOnboarding && !SKIP_ONBOARDING_PATHS.includes(pathname);
```

- [ ] **Step 3: JSX 교체 — onSkip 추가**

57-59번 줄을:
```tsx
        <IntroScreen onComplete={handleOnboardingComplete} />
```
→
```tsx
        <FullscreenSlideOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
        />
```

`onSkip`과 `onComplete` 모두 `handleOnboardingComplete`를 사용한다. 두 경우 모두 `setHasSeenOnboarding(true)`가 목적이며, localStorage 쓰기는 컴포넌트 내부에서 처리한다.

- [ ] **Step 4: 빌드 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add components/Providers.tsx
git commit -m "feat(onboarding): Providers에서 IntroScreen → FullscreenSlideOnboarding 교체"
```

---

## Task 3: HomeTab.tsx — AI 슬라이드 온보딩 코드 제거

**Files:**
- Modify: `src/tabs/HomeTab.tsx`

제거 대상:
- `import SlideOnboarding, { type OnboardingSlide }` import
- `AI_ONBOARDING_KEY` 상수
- `AI_SLIDES` 배열 (19-32줄)
- `showAiOnboarding` state
- `highlightAiBanner` state
- `{showAiOnboarding && <SlideOnboarding ... />}` JSX 블록 (425-435줄)
- AI 배너 버튼 onClick의 분기 로직 → `setShowAiSheet(true)` 직접 호출
- 배너 버튼 className의 `highlightAiBanner` 조건 제거

- [ ] **Step 1: import 제거**

6번 줄:
```tsx
import SlideOnboarding, { type OnboardingSlide } from '../components/onboarding/SlideOnboarding';
```
→ 이 줄 전체 삭제

- [ ] **Step 2: 상수·슬라이드 배열 제거**

```tsx
const AI_ONBOARDING_KEY = 'heartbook-ai-onboarding-seen';

const AI_SLIDES: OnboardingSlide[] = [
  {
    image: '/onboarding/maeum-onboarding-ai-01-parse.png',
    imageAlt: 'AI 자동 입력 예시',
    title: 'AI가 폼을 채워줘요',
    body: '청첩장·부고장 링크나 이미지를 붙여넣으면 이름·날짜·장소를 자동으로 채워줘요.',
  },
  {
    image: '/onboarding/maeum-onboarding-ai-02-amount.png',
    imageAlt: '금액 추천 예시',
    title: '금액도 추천해줘요',
    body: '과거 내역과 관계를 분석해 보낼 금액을 추천해 드려요. 직접 수정도 가능해요.',
  },
];
```
→ 이 블록 전체 삭제

- [ ] **Step 3: state 2개 제거**

```tsx
  const [showAiOnboarding, setShowAiOnboarding] = useState(false);
  const [highlightAiBanner, setHighlightAiBanner] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(AI_ONBOARDING_KEY) !== 'true'
  );
```
→ 이 4줄 삭제

- [ ] **Step 4: JSX — SlideOnboarding 블록 제거**

```tsx
      {showAiOnboarding && (
        <SlideOnboarding
          slides={AI_SLIDES}
          doneLabel="분석 시작하기"
          onClose={() => {
            localStorage.setItem(AI_ONBOARDING_KEY, 'true');
            setShowAiOnboarding(false);
            setShowAiSheet(true);
          }}
        />
      )}
```
→ 이 블록 전체 삭제

- [ ] **Step 5: AI 배너 버튼 onClick 단순화**

```tsx
          onClick={() => {
            setHighlightAiBanner(false);
            const seen = typeof window !== 'undefined' && localStorage.getItem(AI_ONBOARDING_KEY) === 'true';
            if (!seen) {
              setShowAiOnboarding(true);
            } else {
              setShowAiSheet(true);
            }
          }}
```
→
```tsx
          onClick={() => setShowAiSheet(true)}
```

- [ ] **Step 6: 배너 버튼 className에서 highlightAiBanner 조건 제거**

```tsx
          className={`mt-4 w-full rounded-2xl bg-blue-500 px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
            highlightAiBanner
              ? 'ring-[3px] ring-offset-2 ring-blue-300 shadow-lg shadow-blue-300/50'
              : 'shadow-md shadow-blue-200'
          }`}
```
→
```tsx
          className="mt-4 w-full rounded-2xl bg-blue-500 px-4 py-3.5 text-left transition-all active:scale-[0.98] shadow-md shadow-blue-200"
```

- [ ] **Step 7: 빌드 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/tabs/HomeTab.tsx
git commit -m "refactor(onboarding): HomeTab에서 AI 슬라이드 온보딩 코드 제거"
```

---

## Task 4: HistoryTab.tsx — 가져오기 슬라이드 온보딩 코드 제거

**Files:**
- Modify: `src/tabs/HistoryTab.tsx`

제거 대상:
- `import SlideOnboarding, { type OnboardingSlide }` import
- `IMPORT_ONBOARDING_KEY` 상수
- `IMPORT_SLIDES` 배열
- `showImportOnboarding` state
- `highlightImport` state
- `handleImportClick` 내 분기 로직 → `setImportOpen(true)` 직접 호출
- `{showImportOnboarding && <SlideOnboarding ... />}` JSX 블록
- 가져오기 버튼 className의 `highlightImport` 조건 제거

- [ ] **Step 1: import 제거**

9번 줄:
```tsx
import SlideOnboarding, { type OnboardingSlide } from '../components/onboarding/SlideOnboarding';
```
→ 이 줄 전체 삭제

- [ ] **Step 2: 상수·슬라이드 배열 제거**

```tsx
const IMPORT_ONBOARDING_KEY = 'heartbook-import-onboarding-seen';

const IMPORT_SLIDES: OnboardingSlide[] = [
  {
    image: '/onboarding/maeum-onboarding-import-01-deposit.png',
    imageAlt: '입금 내역 분석 예시',
    title: '입금 내역을 분석해요',
    body: '카카오페이·토스 입금 내역 이미지를 업로드하면 받은 마음을 자동으로 인식해줘요.',
  },
  {
    image: '/onboarding/maeum-onboarding-import-02-csv.png',
    imageAlt: 'CSV 가져오기 예시',
    title: 'CSV로도 가져올 수 있어요',
    body: '기존에 쓰던 엑셀·스프레드시트를 CSV로 내보내면 한번에 불러올 수 있어요.',
  },
];
```
→ 이 블록 전체 삭제

- [ ] **Step 3: state 2개 제거**

```tsx
  const [showImportOnboarding, setShowImportOnboarding] = useState(false);
  const [highlightImport, setHighlightImport] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(IMPORT_ONBOARDING_KEY) !== 'true'
  );
```
→ 이 4줄 삭제

- [ ] **Step 4: handleImportClick 단순화**

```tsx
  const handleImportClick = () => {
    setHighlightImport(false);
    const seen = typeof window !== 'undefined' && localStorage.getItem(IMPORT_ONBOARDING_KEY) === 'true';
    if (!seen) {
      setShowImportOnboarding(true);
    } else {
      setImportOpen(true);
    }
  };
```
→
```tsx
  const handleImportClick = () => setImportOpen(true);
```

- [ ] **Step 5: JSX — SlideOnboarding 블록 제거**

```tsx
      {showImportOnboarding && (
        <SlideOnboarding
          slides={IMPORT_SLIDES}
          doneLabel="가져오기 시작"
          onClose={() => {
            localStorage.setItem(IMPORT_ONBOARDING_KEY, 'true');
            setShowImportOnboarding(false);
            setImportOpen(true);
          }}
        />
      )}
```
→ 이 블록 전체 삭제

- [ ] **Step 6: 가져오기 버튼 className에서 highlightImport 조건 제거**

```tsx
              className={`inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2.5 text-[11px] font-bold whitespace-nowrap break-keep transition-all active:scale-95 disabled:opacity-50 max-[420px]:h-9 max-[420px]:px-2 max-[420px]:text-[10px] ${
                highlightImport
                  ? 'bg-blue-500 text-white ring-[2px] ring-offset-1 ring-blue-300 shadow-sm shadow-blue-200'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
```
→
```tsx
              className="inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2.5 text-[11px] font-bold whitespace-nowrap break-keep transition-all active:scale-95 disabled:opacity-50 max-[420px]:h-9 max-[420px]:px-2 max-[420px]:text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100"
```

- [ ] **Step 7: 빌드 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/tabs/HistoryTab.tsx
git commit -m "refactor(onboarding): HistoryTab에서 가져오기 슬라이드 온보딩 코드 제거"
```

---

## Task 5: 구 온보딩 파일 삭제

**Files:**
- Delete: 아래 9개 파일

- [ ] **Step 1: 파일 삭제**

```bash
rm \
  src/components/onboarding/IntroScreen.tsx \
  src/components/onboarding/SlideOnboarding.tsx \
  src/components/onboarding/OnboardingTourContext.tsx \
  src/components/onboarding/onboardingTour.ts \
  src/components/onboarding/tooltipPosition.ts \
  src/components/onboarding/onboardingTour.test.ts \
  src/components/onboarding/onboardingTypography.test.ts \
  src/components/onboarding/tooltipPosition.test.ts \
  src/components/Onboarding.tsx
```

- [ ] **Step 2: 빌드 타입 체크 — 삭제 후 참조 없음 확인**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 없음. 에러가 있으면 삭제된 파일을 참조하는 곳이 남아 있는 것이므로 해당 import를 제거한다.

- [ ] **Step 3: 테스트 실행 — 삭제된 테스트 파일 제외 후 전체 통과 확인**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: 삭제한 3개 테스트 파일이 사라지고, 남은 테스트(`parseUrl.test.ts`, `fetchPage.test.ts`, `events.test.ts`, `useEvents.test.ts`)가 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "chore(onboarding): 구 온보딩 파일 9개 삭제 (IntroScreen, SlideOnboarding, Tour, tooltipPosition)"
```

---

## Task 6: 동작 검증

- [ ] **Step 1: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 브라우저에서 localStorage 초기화 후 첫 진입 확인**

브라우저 콘솔에서:
```js
localStorage.removeItem('heartbook-onboarding-seen');
location.reload();
```

Expected:
- 전체화면 슬라이드 온보딩이 표시됨
- 슬라이드 1~4에서 우상단 "건너뛰기" 버튼 보임
- "다음" 버튼으로 슬라이드 이동 및 framer-motion 전환 애니메이션 동작
- 슬라이드 5(CTA)에서 "건너뛰기" 없음, "토스로 시작하기" 버튼 표시

- [ ] **Step 3: 건너뛰기 동작 확인**

슬라이드 1에서 "건너뛰기" 클릭

Expected:
- 온보딩 사라지고 앱 홈 화면 진입
- `localStorage.getItem('heartbook-onboarding-seen')` === `'true'`
- 새로고침해도 비로그인 상태에서 온보딩 재노출되지 않음 (세션 내)

- [ ] **Step 4: AI 배너 버튼 직접 동작 확인**

홈 탭 → "AI로 초대장 분석하기" 배너 클릭

Expected: AI 분석 시트가 바로 열림 (중간 슬라이드 온보딩 없음)

- [ ] **Step 5: 가져오기 버튼 직접 동작 확인**

내역 탭 → "가져오기" 버튼 클릭

Expected: 가져오기 모달이 바로 열림 (중간 슬라이드 온보딩 없음)

- [ ] **Step 6: 최종 커밋**

```bash
git add -A
git commit -m "chore: 온보딩 마이그레이션 완료 검증"
```
