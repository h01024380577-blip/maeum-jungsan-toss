// src/components/mypage/FeedbackSheet.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X as CloseIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/apiClient';
import { openExternalUrl } from '@/src/lib/openExternalUrl';
import { useStore } from '@/src/store/useStore';
import { useBackHandler } from '@/src/hooks/useBackHandler';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackSheet({ open, onClose }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const tossUserId = useStore((s) => s.tossUserId);

  useBackHandler(open, () => {
    if (!sending) onClose();
    return true;
  });

  const openMailFallback = async () => {
    const url = `mailto:feedback@maeum-jungsan.com?subject=${encodeURIComponent(
      '마음정산 의견',
    )}&body=${encodeURIComponent(text)}`;
    try {
      await openExternalUrl(url);
      toast.success('메일 앱이 열립니다.');
    } catch {
      toast.error('메일 앱을 열 수 없어요. feedback@maeum-jungsan.com으로 보내주세요.');
    }
  };

  const handleSend = async () => {
    if (!text.trim()) {
      toast.error('내용을 입력해 주세요.');
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          userId: tossUserId || 'anonymous',
        }),
      });
      if (res.ok) {
        toast.success('소중한 의견 감사합니다!');
        setText('');
        onClose();
      } else {
        await openMailFallback();
      }
    } catch {
      await openMailFallback();
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={sending ? undefined : onClose}
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black text-gray-900">
                개발자에게 의견 보내기
              </h3>
              <button
                onClick={onClose}
                disabled={sending}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
              불편한 점이나 개선 아이디어를 알려주세요
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="의견을 자유롭게 입력해 주세요..."
              className="w-full h-28 p-3 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 resize-none border border-gray-100 placeholder:text-gray-300 mb-3"
            />
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                !text.trim()
                  ? 'bg-gray-200 text-gray-400'
                  : 'bg-blue-500 text-white shadow-sm'
              }`}
            >
              {sending ? '전송 중...' : '의견 보내기'}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
