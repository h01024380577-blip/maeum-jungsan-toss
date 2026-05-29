import { describe, expect, it } from 'vitest';
import { ONBOARDING_TOUR_STEPS } from './onboardingTour';

describe('ONBOARDING_TOUR_STEPS', () => {
  it('matches the approved guided tour contract using AI banner and inline form', () => {
    expect(ONBOARDING_TOUR_STEPS).toHaveLength(9);
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Step 1: welcome (center, no target)
    expect(ONBOARDING_TOUR_STEPS[0].targetId).toBeUndefined();
    expect(ONBOARDING_TOUR_STEPS[0].pulseTargetId).toBeUndefined();
    expect(ONBOARDING_TOUR_STEPS[0].placement).toBe('center');

    // Step 2: AI 배너 버튼
    expect(ONBOARDING_TOUR_STEPS[1].targetId).toBe('ai-analyze-banner');
    expect(ONBOARDING_TOUR_STEPS[1].pulseTargetId).toBe('ai-analyze-banner');
    expect(ONBOARDING_TOUR_STEPS[1].action).toBe('analyze');
    expect(ONBOARDING_TOUR_STEPS[1].body).not.toMatch(/금액 추천|보낼 금액도 추천/);

    // Step 3: 인라인 폼 필드
    expect(ONBOARDING_TOUR_STEPS[2].targetId).toBe('form-fields');
    expect(ONBOARDING_TOUR_STEPS[2].body).toBe('AI가 이름·날짜·장소를 실제 입력칸에 정리해줘요.');
    expect(ONBOARDING_TOUR_STEPS[2].body).not.toMatch(/금액 추천|보낼 금액도 추천/);

    // Step 4: 금액 카드 → 내역으로 이동
    expect(ONBOARDING_TOUR_STEPS[3].targetId).toBe('amount-card');
    expect(ONBOARDING_TOUR_STEPS[3].body).toContain('보낼 금액도 추천');
    expect(ONBOARDING_TOUR_STEPS[3].action).toBe('history');

    // Step 5: 내역 탭 저장 기록
    expect(ONBOARDING_TOUR_STEPS[4].targetId).toBe('history-saved-entry');
    expect(ONBOARDING_TOUR_STEPS[4].action).toBe('next');

    // Step 6: 가져오기 버튼
    expect(ONBOARDING_TOUR_STEPS[5].targetId).toBe('history-import-button');
    expect(ONBOARDING_TOUR_STEPS[5].action).toBe('import');

    // Step 7: 입금내역
    expect(ONBOARDING_TOUR_STEPS[6].targetId).toBe('bulk-import-deposit-button');
    expect(ONBOARDING_TOUR_STEPS[6].action).toBe('deposit');

    // Step 8: 받은 마음 후보 검토
    expect(ONBOARDING_TOUR_STEPS[7].targetId).toBe('bulk-import-deposit-review');

    // Step 9: 로그인 CTA
    expect(ONBOARDING_TOUR_STEPS[8].action).toBe('login');
    expect(ONBOARDING_TOUR_STEPS[8].placement).toBe('center');
    expect(ONBOARDING_TOUR_STEPS[8].body).toBe('로그인하면 체험한 흐름 그대로 경조사 기록을 안전하게 저장할 수 있어요.');

    // 제거된 타깃들
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('input-card');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('toss-transfer-button');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('home-reflected');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('history-tab-button');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('received-import-button');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('imported-deposit-panel');
  });
});
