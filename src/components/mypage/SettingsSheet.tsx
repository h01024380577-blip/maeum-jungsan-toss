'use client';

/**
 * MY 탭 헤더 톱니바퀴에서 열리는 전체화면 설정 시트.
 * 담는 섹션: 앱 설정 / 지원 / 계정 액션
 * 내부 인터랙션(테마·FAQ·피드백·로그아웃)은 기존 중첩 바텀시트/다이얼로그
 * 그대로 활용. z-index는 이 시트(z-[70])보다 위의 기존 시트들(z-[80~600])이
 * 자연스럽게 덮도록 유지.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Palette,
  HelpCircle,
  MessageSquare,
  Info,
  LogOut,
  LogIn,
  X as CloseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/src/store/useStore';
import { useTheme } from '@/src/lib/theme';
import { apiFetch } from '@/src/lib/apiClient';

import SettingsRow from './SettingsRow';
import ThemePickerSheet from './ThemePickerSheet';
import FaqSheet from './FaqSheet';
import FeedbackSheet from './FeedbackSheet';
import LogoutConfirmDialog from './LogoutConfirmDialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ open, onClose }: Props) {
  const router = useRouter();
  const tossUserId = useStore((s) => s.tossUserId);
  const notificationsEnabled = useStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useStore((s) => s.setNotificationsEnabled);
  const clearData = useStore((s) => s.clearData);
  const { mode: themeMode, resolved: resolvedTheme } = useTheme();

  const [themeOpen, setThemeOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  const themeLabel =
    themeMode === 'system'
      ? `시스템 · ${resolvedTheme === 'dark' ? '다크' : '라이트'}`
      : themeMode === 'dark'
      ? '다크'
      : '라이트';

  const handleNotifToggle = async () => {
    if (!tossUserId) return;
    setNotifLoading(true);
    try {
      const next = !notificationsEnabled;
      const res = await apiFetch('/api/notification-consent', {
        method: 'POST',
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error('failed');
      setNotificationsEnabled(next);
      toast.success(next ? '알림을 허용했어요' : '알림을 껐어요');
    } catch {
      toast.error('알림 설정 변경에 실패했어요');
    } finally {
      setNotifLoading(false);
    }
  };

  const handleLogoutConfirm = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 서버 세션 정리가 실패해도 이 기기의 로컬 상태는 반드시 비운다.
    }
    clearData();
    try {
      localStorage.removeItem('heartbook-onboarding-seen');
    } catch {}
    setLogoutOpen(false);
    onClose();
    router.replace('/');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[70]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 220 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-[28px] z-[75] shadow-2xl max-h-[92vh] flex flex-col"
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2 shrink-0" />
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <h3 className="text-lg font-black text-gray-900">설정</h3>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="overflow-y-auto no-scrollbar px-5 pb-8 space-y-6">
              {/* 앱 설정 */}
              <section>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  앱 설정
                </p>
                <div className="rounded-2xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                        <Bell size={16} className="text-gray-500" />
                      </div>
                      <span className="text-sm font-bold text-gray-800 truncate">
                        푸시 알림
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleNotifToggle}
                      disabled={notifLoading || !tossUserId}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 disabled:cursor-not-allowed ${
                        !tossUserId
                          ? 'bg-gray-100 text-gray-400'
                          : notifLoading
                          ? 'bg-gray-100 text-gray-400'
                          : notificationsEnabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                      }`}
                    >
                      {!tossUserId
                        ? '로그인 필요'
                        : notifLoading
                        ? '...'
                        : notificationsEnabled
                        ? '허용됨'
                        : '허용하기'}
                    </button>
                  </div>
                  <SettingsRow
                    Icon={Palette}
                    label="화면 테마"
                    trailing={themeLabel}
                    onClick={() => setThemeOpen(true)}
                  />
                </div>
              </section>

              {/* 지원 */}
              <section>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  지원
                </p>
                <div className="rounded-2xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                  <SettingsRow
                    Icon={HelpCircle}
                    label="자주 묻는 질문"
                    onClick={() => setFaqOpen(true)}
                  />
                  <SettingsRow
                    Icon={MessageSquare}
                    label="개발자에게 의견 보내기"
                    onClick={() => setFeedbackOpen(true)}
                  />
                  <SettingsRow
                    Icon={Info}
                    label="버전 정보"
                    trailing="v1.0.0"
                    hideChevron
                  />
                </div>
              </section>

              {/* 계정 액션 */}
              <section>
                <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
                  {tossUserId ? (
                    <SettingsRow
                      Icon={LogOut}
                      label="로그아웃"
                      danger
                      hideChevron
                      onClick={() => setLogoutOpen(true)}
                    />
                  ) : (
                    <SettingsRow
                      Icon={LogIn}
                      label="토스 로그인"
                      hideChevron
                      onClick={() => {
                        onClose();
                        router.push('/intro');
                      }}
                    />
                  )}
                </div>
              </section>
            </div>
          </motion.div>

          <ThemePickerSheet
            open={themeOpen}
            onClose={() => setThemeOpen(false)}
          />
          <FaqSheet open={faqOpen} onClose={() => setFaqOpen(false)} />
          <FeedbackSheet
            open={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
          />
          <LogoutConfirmDialog
            open={logoutOpen}
            isLoggedIn={!!tossUserId}
            onCancel={() => setLogoutOpen(false)}
            onConfirm={handleLogoutConfirm}
          />
        </>
      )}
    </AnimatePresence>
  );
}
