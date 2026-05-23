'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useStore } from '@/src/store/useStore';
import { apiFetch, setAuthToken } from '@/src/lib/apiClient';
import { tossLogin } from '@/src/lib/tossAuth';
import { useOnboardingTour } from '@/src/components/onboarding/OnboardingTourContext';
import { ONBOARDING_TOTAL_STEPS } from '@/src/components/onboarding/onboardingTour';
import {
  calculateTooltipStyle,
  type TourBounds,
  type TourPlacement,
  type TourRect,
} from '@/src/components/onboarding/tooltipPosition';

interface OnboardingProps {
  onComplete: () => void;
}

function expandRect(rect: TourRect, padding: number): TourRect {
  return {
    top: Math.max(0, rect.top - padding),
    left: Math.max(0, rect.left - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function readTargetRect(targetId?: string): TourRect | null {
  if (!targetId || typeof document === 'undefined') return null;
  const target = document.querySelector<HTMLElement>(`[data-tour-target="${targetId}"]`);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function readTourBounds(): TourBounds {
  if (typeof window === 'undefined') {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  const frame = document.querySelector<HTMLElement>('[data-tour-frame="app"]');
  const frameRect = frame?.getBoundingClientRect();
  if (frameRect && frameRect.width > 0 && frameRect.height > 0) {
    return {
      top: frameRect.top,
      left: frameRect.left,
      right: frameRect.right,
      bottom: frameRect.bottom,
      width: frameRect.width,
      height: frameRect.height,
    };
  }

  return {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function useTourRect(targetId?: string, isActive = false) {
  const [rect, setRect] = useState<TourRect | null>(null);

  const measure = useCallback(() => {
    setRect(readTargetRect(targetId));
  }, [targetId]);

  useEffect(() => {
    if (!isActive) {
      setRect(null);
      return;
    }

    measure();
    const frame = window.requestAnimationFrame(measure);
    const interval = window.setInterval(measure, 450);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isActive, measure]);

  return rect;
}

function SpotlightScrim({ rect }: { rect: TourRect | null }) {
  if (!rect) {
    return <div className="pointer-events-auto absolute inset-0 bg-black/50 backdrop-blur-[1px]" />;
  }

  const hole = expandRect(rect, 8);
  const bottom = hole.top + hole.height;
  const right = hole.left + hole.width;

  return (
    <>
      <div className="pointer-events-auto fixed left-0 top-0 w-full bg-black/50 backdrop-blur-[1px]" style={{ height: hole.top }} />
      <div className="pointer-events-auto fixed left-0 bg-black/50 backdrop-blur-[1px]" style={{ top: hole.top, width: hole.left, height: hole.height }} />
      <div className="pointer-events-auto fixed right-0 bg-black/50 backdrop-blur-[1px]" style={{ top: hole.top, left: right, height: hole.height }} />
      <div className="pointer-events-auto fixed bottom-0 left-0 w-full bg-black/50 backdrop-blur-[1px]" style={{ top: bottom }} />
    </>
  );
}

function PulseRing({ rect }: { rect: TourRect | null }) {
  if (!rect) return null;
  const ring = expandRect(rect, 6);

  return (
    <div
      className="pointer-events-none fixed rounded-[18px] border-2 border-blue-400 shadow-[0_0_0_6px_rgba(49,130,246,0.18)]"
      style={{
        top: ring.top,
        left: ring.left,
        width: ring.width,
        height: ring.height,
      }}
    />
  );
}

function getTooltipStyle(
  rect: TourRect | null,
  placement: TourPlacement = 'bottom',
  measuredHeight = 0,
): CSSProperties {
  if (typeof window === 'undefined') {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return calculateTooltipStyle({
    rect,
    placement,
    measuredHeight,
    bounds: readTourBounds(),
    viewportHeight: window.innerHeight,
  });
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const router = useRouter();
  const { loadFromSupabase } = useStore();
  const tour = useOnboardingTour();
  const [isLogging, setIsLogging] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);

  const targetRect = useTourRect(tour.currentStep.targetId, tour.isActive);
  const pulseRect = useTourRect(tour.currentStep.pulseTargetId || tour.currentStep.targetId, tour.isActive);

  const tooltipStyle = useMemo(
    () => getTooltipStyle(targetRect, tour.currentStep.placement, tooltipHeight),
    [targetRect, tour.currentStep.placement, tooltipHeight],
  );

  useEffect(() => {
    if (!tour.isActive) {
      setTooltipHeight(0);
      return;
    }

    const node = tooltipRef.current;
    if (!node) return;

    const measure = () => {
      const nextHeight = node.getBoundingClientRect().height;
      if (nextHeight > 0) setTooltipHeight(nextHeight);
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [tour.isActive, tour.step]);

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
      tour.finish();
      onComplete();
      router.replace('/');
    } catch (e) {
      console.error('[Onboarding] login error:', e);
      toast.error('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLogging(false);
    }
  }, [loadFromSupabase, onComplete, router, tour]);

  const handleNext = useCallback(() => {
    if (tour.currentStep.action === 'history') {
      tour.next();
      router.push('/history');
      return;
    }

    tour.next();
  }, [router, tour]);

  if (!tour.isActive) return null;

  const isClickTargetStep =
    tour.currentStep.action === 'analyze' ||
    tour.currentStep.action === 'import' ||
    tour.currentStep.action === 'deposit';
  const isLoginStep = tour.currentStep.action === 'login';

  return (
    <div className="pointer-events-none fixed inset-0 z-[500]">
      {!isLoginStep && <SpotlightScrim rect={targetRect} />}
      {isLoginStep && <div className="pointer-events-auto absolute inset-0 bg-black/55 backdrop-blur-[2px]" />}
      {!isLoginStep && <PulseRing rect={pulseRect} />}

      <motion.div
        ref={tooltipRef}
        key={tour.step}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="pointer-events-auto fixed max-w-[316px] rounded-2xl bg-gray-950 px-4 py-3.5 text-white shadow-2xl"
        style={tooltipStyle}
        data-tour-target={isLoginStep ? 'login-cta' : undefined}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500">
            <Sparkles size={15} className="text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="whitespace-nowrap text-[11px] font-black text-blue-200">
                TOUR {tour.step} / {ONBOARDING_TOTAL_STEPS}
              </p>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/75">
                체험용 샘플
              </span>
            </div>
            <h2 className="mt-1.5 text-[15px] font-extrabold leading-snug tracking-normal [font-synthesis-weight:none]">{tour.currentStep.title}</h2>
            <p className="mt-1.5 break-keep text-[13px] font-semibold leading-relaxed text-white/85">
              {tour.currentStep.body}
            </p>

            {!isClickTargetStep && (
              <button
                type="button"
                onClick={isLoginStep ? handleLogin : handleNext}
                disabled={isLogging}
                className="mt-3 h-10 w-full rounded-xl bg-blue-500 text-[13px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {isLoginStep && isLogging ? '로그인 중...' : tour.currentStep.actionLabel || '다음'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
