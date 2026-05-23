'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getOnboardingTourStep,
  ONBOARDING_TOTAL_STEPS,
  type OnboardingTourStep,
} from './onboardingTour';

interface OnboardingTourContextValue {
  isActive: boolean;
  step: number;
  currentStep: OnboardingTourStep;
  next: () => void;
  goTo: (step: number) => void;
  finish: () => void;
  isStep: (...steps: number[]) => boolean;
  handleTargetAction: (action: OnboardingTourStep['action']) => boolean;
}

const inactiveStep = getOnboardingTourStep(1);

const OnboardingTourContext = createContext<OnboardingTourContextValue>({
  isActive: false,
  step: 1,
  currentStep: inactiveStep,
  next: () => {},
  goTo: () => {},
  finish: () => {},
  isStep: () => false,
  handleTargetAction: () => false,
});

export function OnboardingTourProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (enabled) setStep(1);
  }, [enabled]);

  const goTo = useCallback((nextStep: number) => {
    setStep(Math.min(Math.max(nextStep, 1), ONBOARDING_TOTAL_STEPS));
  }, []);

  const next = useCallback(() => {
    setStep((current) => Math.min(current + 1, ONBOARDING_TOTAL_STEPS));
  }, []);

  const finish = useCallback(() => {
    setStep(ONBOARDING_TOTAL_STEPS);
  }, []);

  const currentStep = useMemo(() => getOnboardingTourStep(step), [step]);

  const isStep = useCallback((...steps: number[]) => steps.includes(step), [step]);

  const handleTargetAction = useCallback(
    (action: OnboardingTourStep['action']) => {
      if (!enabled || currentStep.action !== action) return false;
      if (action === 'login') return false;
      next();
      return true;
    },
    [currentStep.action, enabled, next],
  );

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      isActive: enabled,
      step,
      currentStep,
      next,
      goTo,
      finish,
      isStep,
      handleTargetAction,
    }),
    [currentStep, enabled, finish, goTo, handleTargetAction, isStep, next, step],
  );

  return (
    <OnboardingTourContext.Provider value={value}>
      {children}
    </OnboardingTourContext.Provider>
  );
}

export function useOnboardingTour() {
  return useContext(OnboardingTourContext);
}
