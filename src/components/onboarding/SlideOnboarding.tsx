'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

export interface OnboardingSlide {
  image?: string;
  imageAlt?: string;
  title: string;
  body: string;
}

interface SlideOnboardingProps {
  slides: OnboardingSlide[];
  onClose: () => void;
  doneLabel?: string;
}

export default function SlideOnboarding({ slides, onClose, doneLabel = '시작하기' }: SlideOnboardingProps) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  const advance = () => {
    if (isLast) {
      onClose();
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    // 전체 화면 탭 영역 — 어디를 눌러도 다음으로
    <div
      className="fixed inset-0 z-[500] flex items-end bg-black/60"
      onClick={advance}
    >
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={(_, { offset, velocity }) => {
          if (offset.y > 80 || velocity.y > 500) onClose();
        }}
        className="w-full max-w-[430px] mx-auto rounded-t-[32px] bg-white pb-[max(24px,env(safe-area-inset-bottom,24px))] pt-5 px-5"
        style={{ touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="mx-auto mb-4 h-1 w-12 cursor-grab rounded-full bg-gray-300 active:cursor-grabbing" />
        {/* 진행 점 */}
        <div className="flex justify-center gap-1.5 mb-4">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* 이미지 */}
        {slide.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.image}
            alt={slide.imageAlt ?? slide.title}
            className="mb-4 h-[200px] w-full rounded-2xl object-cover object-top"
          />
        )}

        {/* 텍스트 */}
        <h2 className="text-[18px] font-black leading-snug text-gray-950">
          {slide.title}
        </h2>
        <p className="mt-2 break-keep text-[14px] font-semibold leading-relaxed text-gray-500">
          {slide.body}
        </p>

        {/* 버튼 */}
        <button
          type="button"
          onClick={advance}
          className="mt-5 h-14 w-full rounded-2xl bg-blue-500 text-[15px] font-black text-white transition-all active:scale-[0.98]"
        >
          {isLast ? doneLabel : '다음'}
        </button>
      </motion.div>
    </div>
  );
}
