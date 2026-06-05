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
    image: '/onboarding/maeum-ob-01.png',
    imageAlt: '마음정산 홈 화면',
    title: '경조사 마음, 한눈에 정리해요',
    body: '주고받은 마음을 한곳에 기록하고 언제든 꺼내볼 수 있어요',
  },
  {
    image: '/onboarding/maeum-ob-02.png',
    imageAlt: 'AI 자동 입력 화면',
    title: '초대장 링크 하나로 자동 입력돼요',
    body: 'AI가 초대장 링크를 분석해서 내용을 자동으로 채우고 금액까지 추천해줘요',
  },
  {
    image: '/onboarding/maeum-ob-03.png',
    imageAlt: '입금 내역 분석 화면',
    title: '받은 마음도 자동으로 정리해요',
    body: '입금내역이나 CSV 파일로 받은 마음을 한번에 가져올 수 있어요',
  },
  {
    image: '/onboarding/maeum-ob-04.png',
    imageAlt: '관계별 통계 화면',
    title: '관계별 통계로 흐름을 파악해요',
    body: '누구에게 얼마나 마음을 주고받았는지 한눈에 볼 수 있어요',
  },
];

// SLIDES.length(4) = 기능 슬라이드, index 4 = CTA 슬라이드
const CTA_INDEX = SLIDES.length;

interface FullscreenSlideOnboardingProps {
  onComplete: () => void;
}

export default function FullscreenSlideOnboarding({ onComplete }: FullscreenSlideOnboardingProps) {
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
    setIndex(CTA_INDEX);
  }, []);

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
            /* CTA 슬라이드: 풀스크린 독립 레이아웃 */
            <div className="flex flex-1 flex-col bg-white px-6 pb-[max(28px,env(safe-area-inset-bottom,28px))] pt-6">
              {/* 중앙 콘텐츠 */}
              <div className="flex flex-1 flex-col items-center justify-center">
                <Image
                  src="/icon.png"
                  alt="마음정산"
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-[28px] shadow-lg"
                  unoptimized
                />
                <h2 className="mt-5 text-[28px] font-black text-gray-950">마음정산</h2>
                <p className="mt-1.5 text-center text-[14px] font-medium text-gray-400">
                  경조사 마음을 스마트하게 정리해요
                </p>

                {/* 핵심 기능 3가지 */}
                <div className="mt-8 w-full space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                    </div>
                    <span className="text-[14px] font-semibold text-gray-700">초대장 링크로 내용 자동 입력</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </div>
                    <span className="text-[14px] font-semibold text-gray-700">입금내역·CSV로 받은 마음 가져오기</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"/>
                        <line x1="12" y1="20" x2="12" y2="4"/>
                        <line x1="6" y1="20" x2="6" y2="14"/>
                      </svg>
                    </div>
                    <span className="text-[14px] font-semibold text-gray-700">관계별 통계로 흐름 한눈에 파악</span>
                  </div>
                </div>
              </div>

              {/* CTA 버튼 */}
              <p className="mb-3 text-center text-[12px] font-medium text-gray-400">
                로그인하면 기록이 안전하게 저장돼요
              </p>
              <button
                type="button"
                onClick={handleLogin}
                disabled={isLogging}
                className="h-14 w-full shrink-0 rounded-2xl bg-blue-500 text-[16px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {isLogging ? '로그인 중...' : '토스로 시작하기'}
              </button>
            </div>
          ) : (
            <>
              {/* 기능 슬라이드: 폰 프레임 + 텍스트 + 버튼 */}
              <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-blue-50 via-slate-50 to-slate-100 py-4">
                <div
                  className="relative overflow-hidden rounded-[36px] border-[8px] border-gray-900 shadow-[0_24px_64px_rgba(0,0,0,0.28)]"
                  style={{ width: 'min(228px, 59vw)', aspectRatio: '624/1178' }}
                >
                  <Image
                    src={slide!.image}
                    alt={slide!.imageAlt}
                    fill
                    className="object-cover object-top"
                    priority
                    unoptimized
                  />
                </div>
              </div>
              <div className="shrink-0 px-6 pb-[max(24px,env(safe-area-inset-bottom,24px))] pt-4">
                <h2 className="text-[22px] font-black leading-snug text-gray-950">{slide!.title}</h2>
                <p className="mt-2 break-keep text-[15px] font-semibold leading-relaxed text-gray-500">{slide!.body}</p>
                <button
                  type="button"
                  onClick={() => setIndex((i) => i + 1)}
                  className="mt-5 h-14 w-full rounded-2xl bg-blue-500 text-[16px] font-black text-white transition-all active:scale-[0.98]"
                >
                  다음
                </button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
