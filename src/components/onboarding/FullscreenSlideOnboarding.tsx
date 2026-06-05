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
    } catch (e) {
      console.error('[FullscreenSlideOnboarding] login error:', e);
      toast.error('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLogging(false);
    }
  }, [loadFromSupabase, onComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('heartbook-onboarding-seen', 'true');
    onSkip();
  }, [onSkip]);

  const slide = SLIDES[index] as Slide | undefined;

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-white">
      {/* 영구 크롬: 도트 + 건너뛰기 (슬라이드 전환과 무관하게 고정) */}
      <div className="shrink-0 px-6 pb-3 pt-4">
        <div className="flex items-center justify-between">
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
      </div>

      {/* 슬라이드 전환 영역: 이미지 + 텍스트 + 버튼이 함께 애니메이션 */}
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
                src={slide!.image}
                alt={slide!.imageAlt}
                fill
                className="object-cover object-top"
                priority
              />
            </div>
          )}

          {/* 텍스트 + 버튼 */}
          <div className="shrink-0 px-6 pb-[max(24px,env(safe-area-inset-bottom,24px))] pt-4">
            <h2 className="whitespace-pre-line text-[22px] font-black leading-snug text-gray-950">
              {isCta ? '시작할 준비가\n됐어요' : slide!.title}
            </h2>
            <p className="mt-2 whitespace-pre-line break-keep text-[15px] font-semibold leading-relaxed text-gray-500">
              {isCta ? '로그인하면 기록이 안전하게\n저장돼요' : slide!.body}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
