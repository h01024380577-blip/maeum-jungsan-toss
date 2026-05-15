// src/components/mypage/FaqSheet.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X as CloseIcon } from 'lucide-react';
import { useBackHandler } from '@/src/hooks/useBackHandler';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FAQS = [
  {
    q: 'AI 분석이 정확하지 않아요',
    a: 'AI가 텍스트나 이미지에서 정보를 추출하지만 오류가 있을 수 있습니다. 분석 결과 화면에서 직접 수정 후 저장하세요.',
  },
  {
    q: '데이터가 사라졌어요',
    a: '토스 로그인 후 데이터가 서버에 저장됩니다. 로그인 상태를 확인해 주세요.',
  },
  {
    q: '토스페이 송금이 안 돼요',
    a: '토스 앱이 설치된 환경에서만 동작합니다. 계좌번호를 복사 후 토스 앱에서 직접 송금하세요.',
  },
  {
    q: '연락처 불러오기가 안 돼요',
    a: '앱인토스 환경에서만 연락처 접근이 가능합니다. 토스 앱 내에서 실행해 주세요.',
  },
];

export default function FaqSheet({ open, onClose }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useBackHandler(open, () => {
    onClose();
    return true;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[80]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-[28px] px-5 py-5 z-[90] shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar"
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900">자주 묻는 질문</h3>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="space-y-2 pb-2">
              {FAQS.map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                  >
                    <span className="text-xs font-bold text-gray-700">
                      {item.q}
                    </span>
                    <ChevronRight
                      size={14}
                      className={`text-gray-300 transition-transform ${
                        openIdx === i ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                  {openIdx === i && (
                    <div className="px-4 pb-3.5">
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
