// src/components/mypage/ThemePickerSheet.tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Monitor, X as CloseIcon } from 'lucide-react';
import { useTheme, ThemeMode } from '@/src/lib/theme';
import { useBackHandler } from '@/src/hooks/useBackHandler';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ThemePickerSheet({ open, onClose }: Props) {
  const { mode, resolved, setMode } = useTheme();

  useBackHandler(open, () => {
    onClose();
    return true;
  });

  const options = [
    { key: 'light' as ThemeMode, label: '라이트', Icon: Sun },
    { key: 'dark' as ThemeMode, label: '다크', Icon: Moon },
    { key: 'system' as ThemeMode, label: '시스템', Icon: Monitor },
  ];

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
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-[28px] px-5 py-5 z-[90] shadow-2xl"
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900">화면 테마</h3>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              {mode === 'system'
                ? `시스템 설정 따름 · 현재 ${
                    resolved === 'dark' ? '다크' : '라이트'
                  }`
                : mode === 'dark'
                ? '다크 모드'
                : '라이트 모드'}
            </p>
            <div className="flex bg-gray-50 rounded-xl p-1 border border-gray-100">
              {options.map(({ key, label, Icon }) => {
                const active = mode === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setMode(key);
                      onClose();
                    }}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                      active
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
