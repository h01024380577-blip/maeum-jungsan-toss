# Repository Guidelines

## Project Structure & Module Organization
This is a Next.js 16 App Router project for the Toss mini-app `마음정산`. Put pages in `app/*/page.tsx` and server handlers in `app/api/**/route.ts`. Shared UI lives in `components/` and `src/components/`; core logic, auth, and parsers live in `src/lib/`; hooks, state, tabs, and utilities live in `src/hooks/`, `src/store/`, `src/tabs/`, and `src/utils/`. Keep schema changes in `prisma/`, static assets in `public/`, and ops scripts in `scripts/`.

## Build, Test, and Development Commands
Use `npm run dev` to start the Granite/Toss dev server. Use `npm run build` for the Apps-in-Toss CSR bundle, `npm run build:next` for the full server build, and `npm run build:csr` for a manual CSR export. Use `npm run start` only after `npm run build:next`. Run `npm run lint` before opening a PR. Tests use Vitest directly: `npx vitest run`, `npx vitest`, or `npx vitest run src/lib/parseUrl.test.ts`.

## Coding Style & Naming Conventions
Write strict TypeScript and keep existing formatting: 2-space indentation, single quotes, and semicolons. Components and tabs use PascalCase filenames such as `BulkImportModal.tsx`; hooks use `useX.ts`; utilities use camelCase filenames such as `parseIncomeText.ts`. Prefer the `@/` alias over deep relative imports. Follow App Router names (`page.tsx`, `layout.tsx`, `route.ts`). User-facing copy is Korean, so keep new labels and prompts in Korean.

## Testing Guidelines
Place tests next to the code they cover using `*.test.ts`, for example `src/lib/ics.test.ts` or `src/hooks/useEvents.test.ts`. Add or update tests whenever parser logic, auth helpers, export helpers, or API-adjacent utilities change. There is no enforced coverage threshold, so cover edge cases with targeted assertions.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits with scopes, for example `feat(calendar): ...`, `fix(security): ...`, and `chore(release): ...`. Keep commits focused by subsystem. PRs should include a short summary, linked issue or context, test evidence (`npm run lint`, `npx vitest run`), and screenshots for UI changes. State whether a change affects the EC2 server build, the AIT bundle, or both.

## Security & Configuration Tips
Never commit real secrets; use `.env.example` as the template. Treat auth, cron, and payment code as sensitive paths, and preserve Bearer-token checks around `app/api/cron/*`. This repo has two deployment targets: server-only changes can use `build:next`, but UI or shared client changes usually require both the server build and the Toss CSR bundle.
