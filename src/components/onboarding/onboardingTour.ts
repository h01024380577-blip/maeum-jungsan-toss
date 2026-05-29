export type OnboardingTourAction = 'next' | 'analyze' | 'save' | 'transfer' | 'history' | 'import' | 'deposit' | 'login';

export interface OnboardingTourStep {
  step: number;
  targetId?: string;
  pulseTargetId?: string;
  title: string;
  body: string;
  action: OnboardingTourAction;
  actionLabel?: string;
  placement?: 'top' | 'bottom' | 'center';
}

export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    step: 1,
    title: '실제 화면에서 익혀요',
    body: '마음정산의 핵심 흐름만 눌러보며 빠르게 체험해요.',
    action: 'next',
    actionLabel: '시작하기',
    placement: 'center',
  },
  {
    step: 2,
    targetId: 'ai-analyze-banner',
    pulseTargetId: 'ai-analyze-banner',
    title: 'AI로 초대장을 분석해요',
    body: '배너를 눌러 청첩장 링크를 붙여넣으면 AI가 이름·날짜·장소를 자동으로 읽어줘요.',
    action: 'analyze',
    placement: 'bottom',
  },
  {
    step: 3,
    targetId: 'form-fields',
    title: '내용을 먼저 확인해요',
    body: 'AI가 이름·날짜·장소를 실제 입력칸에 정리해줘요.',
    action: 'next',
    actionLabel: '금액 보기',
    placement: 'bottom',
  },
  {
    step: 4,
    targetId: 'amount-card',
    title: '금액 추천을 확인해요',
    body: 'AI가 관계와 상황을 보고 보낼 금액도 추천해요. 필요하면 금액만 고치면 돼요.',
    action: 'history',
    actionLabel: '저장 후 내역 보기',
    placement: 'top',
  },
  {
    step: 5,
    targetId: 'history-saved-entry',
    title: '저장된 기록을 확인해요',
    body: '저장한 마음은 내역 탭의 실제 기록 목록에서도 바로 확인할 수 있어요.',
    action: 'next',
    actionLabel: '가져오기 보기',
    placement: 'bottom',
  },
  {
    step: 6,
    targetId: 'history-import-button',
    pulseTargetId: 'history-import-button',
    title: '가져오기 버튼을 눌러요',
    body: '입금내역과 엑셀파일로 받은 마음도 정리돼요.',
    action: 'import',
    placement: 'bottom',
  },
  {
    step: 7,
    targetId: 'bulk-import-deposit-button',
    pulseTargetId: 'bulk-import-deposit-button',
    title: '입금내역 화면을 가져와요',
    body: '입금내역 캡처를 선택하면 받은 마음 후보를 AI가 찾아요. 파일 가져오기로 엑셀·CSV도 정리할 수 있어요.',
    action: 'deposit',
    placement: 'top',
  },
  {
    step: 8,
    targetId: 'bulk-import-deposit-review',
    title: '받은 마음 후보를 확인해요',
    body: '실제 검토 화면에서 이름·금액·날짜·관계·종류를 확인하고 저장할 항목을 고를 수 있어요.',
    action: 'next',
    actionLabel: '마무리',
    placement: 'top',
  },
  {
    step: 9,
    targetId: 'login-cta',
    title: '내 기록으로 저장해요',
    body: '로그인하면 체험한 흐름 그대로 경조사 기록을 안전하게 저장할 수 있어요.',
    action: 'login',
    actionLabel: '토스로 시작하기',
    placement: 'center',
  },
];

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_TOUR_STEPS.length;

export function getOnboardingTourStep(step: number): OnboardingTourStep {
  return ONBOARDING_TOUR_STEPS.find((item) => item.step === step) ?? ONBOARDING_TOUR_STEPS[0];
}
