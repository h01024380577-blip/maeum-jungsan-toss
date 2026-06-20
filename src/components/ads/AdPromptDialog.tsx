'use client';

/**
 * 기능 사용 전 광고 시청을 안내하는 다이얼로그.
 * - 취소 시: onClose
 * - 광고 완료 시: RewardedAdButton이 nonce를 발급하고 onGranted(nonce)를 호출
 *   → 호출자가 nonce를 기능 API에 포함시켜 기능 실행
 */

import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle } from 'lucide-react';
import RewardedAdButton from './RewardedAdButton';
import type { RewardType } from '@prisma/client';

interface Props {
  open: boolean;
  onClose: () => void;
  rewardType: RewardType;
  /** 광고 시청 완료 후 nonce를 전달 — 호출자가 기능 API에 포함 */
  onGranted: (nonce: string) => void;
}

const MESSAGES: Record<RewardType, { title: string; desc: string }> = {
  AI_CREDIT: {
    title: 'AI 분석을 시작할까요?',
    desc: '짧은 광고를 보고\nAI 분석을 바로 시작해요.',
  },
  CSV_CREDIT: {
    title: '대량 가져오기를 시작할까요?',
    desc: '짧은 광고를 보고\n대량 가져오기를 바로 시작해요.',
  },
};

export default function AdPromptDialog({
  open,
  onClose,
  rewardType,
  onGranted,
}: Props) {
  const msg = MESSAGES[rewardType];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-[600] flex items-center justify-center px-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <PlayCircle size={22} className="text-blue-600" />
              </div>
            </div>
            <p className="text-[15px] font-bold text-gray-800 text-center mb-1">
              {msg.title}
            </p>
            <p className="text-[13px] text-gray-500 text-center mb-5 whitespace-pre-line leading-relaxed">
              {msg.desc}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 active:scale-[0.97] transition-all"
              >
                취소
              </button>
              <RewardedAdButton
                rewardType={rewardType}
                label="광고 보기"
                onGranted={(nonce) => {
                  onClose();
                  onGranted(nonce);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-sm active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
