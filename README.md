# 마음정산

마음정산은 결혼식, 장례식, 생일 등 경조사에서 주고받은 마음을 기록하고 관리하는 Apps-in-Toss 미니앱입니다. Toss WebView 안에서 동작하는 클라이언트와 EC2에서 실행되는 Next.js API 서버를 같은 코드베이스로 관리합니다.

## 주요 기능

- 경조사 내역 등록, 수정, 삭제, 검색
- 결혼, 부고, 생일, 기타 이벤트별 수입/지출 기록
- 연락처 동기화 및 관계별 경조사 이력 관리
- 청첩장/부고장 URL, 이미지, 텍스트 기반 AI 정보 추출
- 입금 내역 이미지, 송금 알림 텍스트, CSV 대량 가져오기
- 과거 이력과 관계 기반 금액 추천
- 경조사 달력 및 ICS/CSV 내보내기
- Toss OAuth 로그인, Toss Messenger 리마인드, 리워드 광고 크레딧
- MY 탭 통계, 크레딧 현황, 설정, 피드백, 회원 탈퇴

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- Apps-in-Toss Web Framework Granite, `@toss/tds-mobile`
- Tailwind CSS v4, Zustand, Framer Motion, Sonner
- Prisma 6, PostgreSQL
- Google Gemini 2.5 Flash via `@google/genai`
- Vitest, ESLint
- EC2, pm2, node-cron

## 프로젝트 구조

```text
app/                    Next.js App Router pages and API routes
app/api/**/route.ts     Server route handlers
components/             App shell and shared root providers
src/components/         Feature UI components
src/tabs/               Bottom-tab screens
src/store/              Zustand client state and API-facing actions
src/lib/                Auth, Prisma, AI parsers, Toss API, exports, cron helpers
src/hooks/              React hooks
src/utils/              CSV, amount, image utility helpers
prisma/                 Prisma schema and manual SQL migrations
public/                 Static web assets
scripts/                Build, deploy, cron, smoke-test scripts
docs/                   Planning and operational notes
```

## 실행 준비

Node.js 22 이상과 npm을 권장합니다. 의존성 설치 후 `postinstall`에서 Prisma Client가 자동 생성됩니다.

```bash
npm install
npm run dev
```

`npm run dev`는 `granite dev`를 실행하며, `granite.config.ts`에 따라 로컬 Next.js 서버는 `localhost:3000`에서 동작합니다.

## 환경 변수

필수 환경 변수는 `src/lib/env.ts`에서 서버 시작 시 검증됩니다. 운영 환경에서 누락되면 앱이 부팅되지 않습니다.

```bash
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
TOSS_DECRYPT_KEY=
TOSS_DECRYPT_AAD=
TOSS_CALLBACK_SECRET=
CRON_SECRET=
GEMINI_API_KEY=
RESEND_API_KEY=
```

자주 쓰는 선택 변수입니다.

```bash
NEXT_PUBLIC_API_URL=
TOSS_MSG_TEMPLATE_CODE=
NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT=
NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT=
NEXT_PUBLIC_AD_GROUP_ID_STATS_BANNER=
AI_CREDIT_GUARD_ENABLED=
CSV_CREDIT_GUARD_ENABLED=
AI_CREDIT_WELCOME=
CSV_CREDIT_WELCOME=
AI_CREDIT_CAP=
CSV_CREDIT_CAP=
AD_DAILY_LIMIT=
APP_URL=
APP_PORT=
MTLS_CERT_DIR=
TOSS_MTLS_CERT_PATH=
TOSS_MTLS_KEY_PATH=
TEST_MESSAGE_API_ENABLED=
```

실제 비밀값은 커밋하지 마세요. `DATABASE_URL`은 일반 Prisma 연결에, `DIRECT_URL`은 수동 마이그레이션과 DDL 실행에 사용됩니다.

## 주요 명령어

```bash
npm run dev          # Granite/Toss 개발 서버
npm run build        # Apps-in-Toss CSR 아티팩트 빌드
npm run build:next   # API 포함 Next.js 서버 빌드
npm run build:csr    # 수동 CSR export
npm run build:ait    # AIT 번들용 CSR 빌드 스크립트
npm run start        # build:next 이후 Next.js 서버 실행
npm run lint         # ESLint
npx vitest run       # 전체 테스트
npx vitest           # 테스트 watch 모드
```

특정 테스트만 실행할 때는 파일 경로를 넘깁니다.

```bash
npx vitest run src/lib/parseUrl.test.ts
```

## 빌드와 배포 구조

이 저장소는 하나의 코드베이스에서 두 가지 산출물을 만듭니다.

1. EC2 서버 빌드: `npm run build:next`
   - `app/api/**` 라우트, Prisma, Gemini, Toss 서버 API, cron을 포함합니다.
   - EC2의 pm2 프로세스 `maeum-jungsan`으로 실행됩니다.

2. Toss AIT CSR 번들: `npm run build` 또는 `npm run build:ait`
   - Toss WebView에 업로드할 정적 클라이언트 번들입니다.
   - `scripts/build-ait.sh`가 빌드 중 `app/api`를 임시로 제외하고 `NEXT_BUILD_CSR=1`로 Next.js export를 수행합니다.

배포 스크립트는 현재 `aws` remote의 `main` 브랜치로 push한 뒤 EC2에서 pull, install, Prisma Client 생성, 수동 마이그레이션 적용, 서버 빌드, pm2 restart, health check를 수행합니다.

```bash
bash scripts/deploy.sh
```

클라이언트 파일이 바뀐 경우 스크립트가 AIT 번들을 다시 빌드합니다. 번들 업로드는 별도로 `npx ait deploy`를 실행합니다.

## 데이터베이스

Prisma schema는 `prisma/schema.prisma`에 있습니다. 주요 모델은 다음과 같습니다.

- `User`: Toss 사용자 또는 게스트 디바이스 사용자
- `Contact`: 사용자별 연락처
- `Event`: 경조사 이벤트
- `Transaction`: 수입/지출 거래
- `AdRewardGrant`: 리워드 광고 크레딧 nonce와 상태
- `PaymentOrder`: 결제 주문 스키마

수동 SQL 변경은 `prisma/manual-migrations/`에 보관합니다. EC2 배포 시 `scripts/deploy.sh`가 현재 운영에 필요한 수동 마이그레이션을 `DIRECT_URL`로 실행합니다.

## API 개요

- `/api/auth/toss`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/unlink`
- `/api/entries`, `/api/entries/bulk`
- `/api/contacts`, `/api/contacts/bulk`
- `/api/analyze`, `/api/parse-url`, `/api/parse-income-text`, `/api/parse-deposit-image`, `/api/csv-map`
- `/api/credits`, `/api/credits/ad-nonce`, `/api/credits/ad-redeem`
- `/api/calendar/ics`, `/api/calendar/landing/[token]`
- `/api/export/csv`, `/api/export/download/[token]`
- `/api/feedback`, `/api/notification-consent`, `/api/send-notification`
- `/api/cron/event-reminder`, `/api/cron/expire-grants`
- `/api/health`

Cron API는 `Authorization: Bearer ${CRON_SECRET}` 인증을 요구합니다. 현재 `/api/payment/create`와 `/api/payment/execute`는 404 응답을 반환하므로 결제 기능은 활성화된 API로 취급하지 않습니다.

## 인증 흐름

클라이언트는 `src/lib/apiClient.ts`의 `apiFetch`를 사용해 API를 호출합니다. 인증 우선순위는 다음과 같습니다.

1. Toss OAuth 이후 발급된 JWT Bearer token
2. `toss_auth_token` httpOnly cookie
3. 게스트 디바이스 ID 기반 `x-user-id`

서버 인증 헬퍼는 `src/lib/apiAuth.ts`와 `src/lib/credits.ts`에 있습니다. JWT는 `src/lib/jwt.ts`에서 HS256으로 직접 서명/검증하며, `User.sessionVersion`으로 세션 무효화를 지원합니다.

## AI와 가져오기

- `/api/parse-url`: 초대장 URL HTML/OG 추출, Jina Reader fallback, Gemini URL context fallback
- `/api/analyze`: 이미지/텍스트/URL 경조사 정보 추출
- `/api/parse-deposit-image`: 입금 내역 이미지 OCR성 분석
- `/api/parse-income-text`: 송금 알림 텍스트 분석
- `/api/csv-map`: CSV 컬럼 매핑 보조

AI 분석과 대량 가져오기는 크레딧 가드가 켜진 경우 `AI_CREDIT` 또는 `CSV_CREDIT`을 차감합니다. 일시적 Gemini 오류나 낮은 신뢰도 상황은 별도 응답으로 처리해 사용자 UX와 크레딧 환불 흐름을 분기합니다.

## 테스트

Vitest 테스트는 대상 코드 옆에 `*.test.ts`로 둡니다. 파서, 인증, 크레딧, cron, export, API 인접 유틸리티를 바꾸면 관련 테스트를 추가하거나 갱신하세요.

```bash
npm run lint
npx vitest run
```

## 보안 메모

- 실제 `.env` 값, Toss 키, DB URL, Gemini/Resend 키, mTLS 인증서는 커밋하지 않습니다.
- `/api/cron/*`의 Bearer-token 검사를 제거하지 않습니다.
- Gemini 키는 서버 전용 `GEMINI_API_KEY`만 사용하고 `NEXT_PUBLIC_*`로 노출하지 않습니다.
- UI 또는 공유 클라이언트 코드를 바꾸면 EC2 서버 빌드뿐 아니라 Toss CSR 번들 영향도 함께 확인합니다.
