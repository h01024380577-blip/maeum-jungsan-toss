# 온보딩 마이그레이션 설계

## 목표

분산된 온보딩(첫 진입 1p + AI버튼 2p + 가져오기버튼 2p + 9단계 투어)을 첫 진입 시 전체화면 슬라이드 5장으로 통합한다. 앱 실제 화면 스크린샷을 활용해 핵심 기능을 시각적으로 전달하고, 건너뛰기로 게스트 진입도 허용한다.

---

## 파일 변경 범위

### 신규 생성
- `src/components/onboarding/FullscreenSlideOnboarding.tsx`

### 수정
- `src/tabs/HomeTab.tsx` — `AI_SLIDES`, `AI_ONBOARDING_KEY`, `SlideOnboarding` 임포트·사용 코드 제거
- `src/tabs/HistoryTab.tsx` — `IMPORT_SLIDES`, `IMPORT_ONBOARDING_KEY`, `SlideOnboarding` 임포트·사용 코드 제거
- `IntroScreen` 진입점 (Layout 또는 상위 컴포넌트) — `IntroScreen` → `FullscreenSlideOnboarding` 교체

### 삭제
- `src/components/onboarding/IntroScreen.tsx`
- `src/components/onboarding/SlideOnboarding.tsx`
- `src/components/onboarding/OnboardingTourContext.tsx`
- `src/components/onboarding/onboardingTour.ts`
- `src/components/onboarding/tooltipPosition.ts`
- `src/components/onboarding/onboardingTour.test.ts`
- `src/components/onboarding/onboardingTypography.test.ts`
- `src/components/onboarding/tooltipPosition.test.ts`
- `src/components/Onboarding.tsx`

---

## 컴포넌트 설계: `FullscreenSlideOnboarding`

### Props

```ts
interface FullscreenSlideOnboardingProps {
  onComplete: () => void; // 로그인 완료 후 호출
  onSkip: () => void;     // 건너뛰기 후 호출
}
```

### 레이아웃 구조

```
fixed inset-0 z-[500] bg-white flex flex-col
├── 상단 이미지 영역 (flex-1, object-cover)   ← 슬라이드 1~4
│   또는 앱 아이콘 중앙 정렬 블록              ← 슬라이드 5 (CTA)
│
└── 하단 콘텐츠 영역 (shrink-0, px-6, pb-safe)
    ├── 우상단 "건너뛰기" 버튼 (슬라이드 1~4에만 표시)
    ├── 페이지 도트 (active = w-6 blue-500, inactive = w-1.5 gray-200)
    ├── 제목 (text-[22px] font-black text-gray-950)
    ├── 설명 (text-[15px] font-semibold text-gray-500, break-keep)
    └── CTA 버튼
        ├── 슬라이드 1~4: "다음" → setIndex(+1)
        └── 슬라이드 5: "토스로 시작하기" → handleLogin()
```

### 슬라이드 전환

`framer-motion` `AnimatePresence` + `initial={{ opacity: 0, x: 20 }}` / `exit={{ opacity: 0, x: -20 }}` 슬라이드 인/아웃. 터치 스와이프 제스처는 제외(AIT WebView 터치 충돌 방지).

---

## 슬라이드 콘텐츠

| # | 이미지 | 제목 | 설명 |
|---|---|---|---|
| 1 | `/onboarding/maeum-onboarding-01-overview.png` | 경조사 마음,<br>한눈에 정리해요 | 줬다·받은 마음을 한곳에 기록하고<br>언제든 꺼내볼 수 있어요 |
| 2 | `/onboarding/maeum-onboarding-02-ai-analysis.png` | 청첩장 링크 하나로<br>자동 입력돼요 | AI가 이름·날짜·장소를 읽어서<br>바로 채워줘요 |
| 3 | `/onboarding/maeum-onboarding-import-01-deposit.png` | 받은 마음도<br>자동으로 정리해요 | 입금 내역 이미지를 올리면 AI가<br>받은 마음을 한번에 찾아줘요 |
| 4 | `/onboarding/maeum-onboarding-05-my-stats.png` | 관계별 통계로<br>흐름을 파악해요 | 누구에게 얼마나 마음을 건넸는지<br>한눈에 볼 수 있어요 |
| 5 (CTA) | 앱 아이콘 `/icon.png` (80px, 이미지 영역 없음) | 시작할 준비가<br>됐어요 | 로그인하면 기록이 안전하게<br>저장돼요 |

---

## 상태 / 진입 조건

| 항목 | 내용 |
|---|---|
| 표시 조건 | `localStorage.getItem('heartbook-onboarding-seen') !== 'true'` |
| 완료(로그인) | `localStorage.setItem('heartbook-onboarding-seen', 'true')` → `onComplete()` |
| 건너뛰기 | `localStorage.setItem('heartbook-onboarding-seen', 'true')` → `onSkip()` (게스트 진입) |
| 기존 유저 | 기존 키를 그대로 사용하므로 기존 유저에게 재노출 없음 |

---

## 제거 대상 localStorage 키

- `heartbook-ai-onboarding-seen` (AI_SLIDES 용) — 코드 제거 시 함께 사라짐
- `heartbook-import-onboarding-seen` (IMPORT_SLIDES 용) — 코드 제거 시 함께 사라짐

---

## 제외 사항

- 터치 스와이프 네비게이션 — AIT WebView 충돌 리스크로 제외
- 슬라이드 5(CTA)에 건너뛰기 버튼 — 마지막 슬라이드는 로그인 유도에만 집중
