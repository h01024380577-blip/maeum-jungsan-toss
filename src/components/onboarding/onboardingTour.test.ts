import { describe, expect, it } from 'vitest';
import { ONBOARDING_TOUR_STEPS } from './onboardingTour';

describe('ONBOARDING_TOUR_STEPS', () => {
  it('matches the approved guided tour contract using real history and import UI', () => {
    expect(ONBOARDING_TOUR_STEPS).toHaveLength(10);
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ONBOARDING_TOUR_STEPS[0].targetId).toBeUndefined();
    expect(ONBOARDING_TOUR_STEPS[0].pulseTargetId).toBeUndefined();
    expect(ONBOARDING_TOUR_STEPS[0].placement).toBe('center');
    expect(ONBOARDING_TOUR_STEPS[1].title).toBe('청첩장 또는 부고장 URL을 붙여넣어요');
    expect(ONBOARDING_TOUR_STEPS[1].body).toBe('링크를 붙여넣고 분석 버튼을 눌러요.');
    expect(ONBOARDING_TOUR_STEPS[1].body).not.toMatch(/금액 추천|보낼 금액도 추천/);
    expect(ONBOARDING_TOUR_STEPS[2].body).not.toMatch(/금액 추천|보낼 금액도 추천/);
    expect(ONBOARDING_TOUR_STEPS[2].body).toBe('AI가 이름·날짜·장소를 실제 입력칸에 정리해줘요.');
    expect(ONBOARDING_TOUR_STEPS[3].body).toContain('보낼 금액도 추천');
    expect(ONBOARDING_TOUR_STEPS[3].action).toBe('transfer');
    expect(ONBOARDING_TOUR_STEPS[4].targetId).toBe('toss-transfer-button');
    expect(ONBOARDING_TOUR_STEPS[4].body).toBe('마음만 전할 경우, 토스로 송금할 수 있어요.');
    expect(ONBOARDING_TOUR_STEPS[4].action).toBe('history');
    expect(ONBOARDING_TOUR_STEPS[5].targetId).toBe('history-saved-entry');
    expect(ONBOARDING_TOUR_STEPS[6].targetId).toBe('history-import-button');
    expect(ONBOARDING_TOUR_STEPS[6].action).toBe('import');
    expect(ONBOARDING_TOUR_STEPS[7].targetId).toBe('bulk-import-deposit-button');
    expect(ONBOARDING_TOUR_STEPS[7].action).toBe('deposit');
    expect(ONBOARDING_TOUR_STEPS[8].targetId).toBe('bulk-import-deposit-review');
    expect(ONBOARDING_TOUR_STEPS[9].action).toBe('login');
    expect(ONBOARDING_TOUR_STEPS[9].placement).toBe('center');
    expect(ONBOARDING_TOUR_STEPS[9].body).toBe('로그인하면 체험한 흐름 그대로 경조사 기록을 안전하게 저장할 수 있어요.');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('home-reflected');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('history-tab-button');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('received-import-button');
    expect(ONBOARDING_TOUR_STEPS.map((step) => step.targetId)).not.toContain('imported-deposit-panel');
  });
});
