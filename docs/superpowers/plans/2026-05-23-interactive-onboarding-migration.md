# Interactive Onboarding Migration Implementation Plan

**Goal:** Replace the static onboarding slides with a guided tour on the real 마음정산 UI. The tour lets logged-out users try the core flow directly, then ends with Toss login.

**Current decision:** Every onboarding surface must be actual 마음정산 UI. 받은 마음 자동화 is not a Home section, and there is no separate step that only asks the user to tap the bottom `내역` tab. After the amount recommendation step, the tour shows the real Toss transfer modal and highlights `토스로 송금하기`, then the CTA moves directly to `HistoryTab`, shows the saved record in the real list, highlights the existing `가져오기` button, and uses the real `BulkImportModal` import flow.

**Tour contract:**

1. Home shell: explain that this is a real UI tour.
2. Input card: sample invitation URL and highlight the real AI button.
3. Result info: show AI-filled name/date/event/location/relation fields.
4. Amount card: explain that AI also recommends the amount.
5. Toss transfer modal: show the real transfer modal and highlight `토스로 송금하기` with the copy "마음만 전할 경우, 토스로 송금할 수 있어요."
6. History saved entry: CTA from the transfer step moves directly to `/history`, then the same saved record is shown in the real History list.
7. History import button: highlight the existing `가져오기` button.
8. Bulk import upload UI: highlight the real `입금내역 화면 가져오기` button in `BulkImportModal`.
9. Bulk import deposit review UI: show the real deposit candidate review screen with sample rows.
10. Login CTA: keep the Toss login handoff.

---

### Task 1: Tour Contract

- [x] Update `src/components/onboarding/onboardingTour.test.ts` to assert the 10-step real transfer/History/BulkImport flow.
- [x] Verify the test fails before implementation.
- [x] Update `src/components/onboarding/onboardingTour.ts` with `history`, `import`, and `deposit` steps.
- [x] Re-run the focused Vitest file.

### Task 2: Real UI Integration

- [x] Remove the rejected Home received-money card and Home `BulkImportModal` wiring.
- [x] Keep Home tour demo state for AI analysis, amount recommendation, and saved entry reflection.
- [x] Use the real Toss transfer modal and `토스로 송금하기` button as an onboarding step.
- [x] Remove the redundant Home reflected tour step.
- [x] Remove the bottom-nav-only `내역` tour step.
- [x] Add `data-tour-target="history-saved-entry"` to the real History list row shown during tour.
- [x] Add `data-tour-target="history-import-button"` to the existing History `가져오기` button.
- [x] Use the real `BulkImportModal` upload and deposit review UI for received-money import onboarding.

### Task 3: Onboarding Surface

- [x] Update `Onboarding` to show the dynamic total step count.
- [x] Treat `analyze`, `import`, and `deposit` as real-click steps with no overlay CTA.
- [x] Remove the helper copy that said "강조된 실제 버튼을 눌러..."
- [x] Preserve the final Toss login flow.
- [x] Keep `/intro` as a compatibility redirect to `/`.

### Task 4: Simulator Reset And Verification

- [x] Clear local login/onboarding cache for the simulator browser origins used for testing.
- [x] Run `npx vitest run src/components/onboarding/onboardingTour.test.ts`.
- [x] Run `npx vitest run src/components/onboarding/onboardingTypography.test.ts`.
- [x] Run `npx vitest run`.
- [x] Run `npm run lint`.
- [x] Run `npm run build:next`.
- [x] Run `npm run build`.
- [x] Verify the tour manually in the simulator from Home through real History/BulkImport UI and final login CTA.

### Final UI Polish

- [x] Tour 1 has no target highlight and is centered like the login step.
- [x] Tour tooltip placement is clamped to the real app frame and does not cover the highlighted transfer button.
- [x] Login completion closes onboarding and returns to Home.
- [x] Tour title typography is shared across all steps, including tour 2.
- [x] Removed the animated `animate-ping` emphasis so users can read the main and supporting copy without flicker.
