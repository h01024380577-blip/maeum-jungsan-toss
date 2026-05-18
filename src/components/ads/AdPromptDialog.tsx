'use client';

/**
 * 크레딧 소진 시 광고 시청 여부를 묻는 확인 다이얼로그.
 * - 취소 시: onClose
 * - 광고 보기 시: 내부 RewardedAdButton이 사전 로드된 광고를 nonce→show→redeem 순서로 처리,
 *   onCharged 콜백으로 자동 닫힘
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import RewardedAdButton from './RewardedAdButton';
import type { RewardType } from '@prisma/client';

interface Props {
  open: boolean;
  onClose: () => void;
  rewardType: RewardType;
  /** 충전 성공 후 사용자가 바로 재시도할 수 있도록 호출자가 실행할 로직 */
  onChargedAndResume?: () => void;
}

const MESSAGES: Record<RewardType, string> = {
  AI_CREDIT: 'AI 분석 횟수를 다 썼어요.\n광고를 보고 1회 더 받을까요?',
  CSV_CREDIT: '대량 가져오기 횟수를 다 썼어요.\n광고를 보고 1회 더 받을까요?',
};

export default function AdPromptDialog({
  open,
  onClose,
  rewardType,
  onChargedAndResume,
}: Props) {
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
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle size={20} className="text-amber-600" />
              </div>
            </div>
            <p className="text-[14px] font-bold text-gray-800 text-center mb-5 whitespace-pre-line leading-relaxed">
              {MESSAGES[rewardType]}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 active:scale-[0.97] transition-all"
              >
                다음에
              </button>
              <RewardedAdButton
                rewardType={rewardType}
                label="광고 보기"
                onCharged={() => {
                  onClose();
                  onChargedAndResume?.();
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
