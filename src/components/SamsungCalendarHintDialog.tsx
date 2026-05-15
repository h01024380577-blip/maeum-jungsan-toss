import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, X } from 'lucide-react';
import { useBackHandler } from '../hooks/useBackHandler';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function SamsungCalendarHintDialog({ isOpen, onConfirm, onDismiss }: Props) {
  useBackHandler(isOpen, () => {
    onDismiss();
    return true;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onDismiss}
            aria-hidden
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="samsung-cal-hint-title"
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-7 max-w-[430px] mx-auto"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Calendar size={18} className="text-blue-600" />
                </div>
                <h2 id="samsung-cal-hint-title" className="text-base font-black text-gray-900">
                  Galaxy 사용자께 안내
                </h2>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                aria-label="닫기"
                className="p-1 -mr-1 text-gray-400 active:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed">
              다운로드가 시작되면 알림창에서 파일을 탭한 뒤,
              <br />
              <strong className="text-gray-900">'Samsung 캘린더'</strong> 를 선택하고
              {' '}
              <strong className="text-gray-900">'항상'</strong> 을 눌러주세요.
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              한 번 설정하면 다음부터는 묻지 않고 바로 Samsung 캘린더에서 열려요.
            </p>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 active:bg-gray-200"
              >
                다음에
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:bg-blue-700"
              >
                이해했어요
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
