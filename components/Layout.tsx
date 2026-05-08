"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Home, Calendar as CalendarIcon, ClipboardPaste, User, BookUser } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

type Tab = 'home' | 'calendar' | 'history' | 'stats' | 'contacts';

const tabs: { key: Tab; icon: typeof Home; label: string; path: string }[] = [
  { key: 'home', icon: Home, label: '홈', path: '/' },
  { key: 'calendar', icon: CalendarIcon, label: '달력', path: '/calendar' },
  { key: 'history', icon: ClipboardPaste, label: '내역', path: '/history' },
  { key: 'contacts', icon: BookUser, label: '연락처', path: '/contacts' },
  { key: 'stats', icon: User, label: 'MY', path: '/stats' },
];

function isAppsInToss(): boolean {
  return typeof window !== 'undefined' && window.navigator.userAgent.includes('TossApp');
}

export default function Layout({ children, activeTab }: { children: React.ReactNode; activeTab: Tab }) {
  const router = useRouter();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // 뒤로가기: 다른 탭 → 홈, 홈 → 종료 확인
  useEffect(() => {
    // 항상 pushState를 유지해서 popstate를 잡을 수 있게
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      if (activeTab === 'home') {
        // 홈에서 뒤로가기 → 종료 확인
        window.history.pushState(null, '', window.location.href);
        setShowExitConfirm(true);
      } else {
        // 다른 탭에서 뒤로가기 → 홈으로
        router.replace('/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab, router]);

  const handleExit = useCallback(async () => {
    if (isAppsInToss()) {
      try {
        const { closeView } = await import('@apps-in-toss/web-framework');
        await closeView();
      } catch {
        // closeView 실패 시 fallback
        window.history.go(-(window.history.length - 1));
      }
    } else {
      // 웹 브라우저: 탭 닫기 시도 → 안 되면 히스토리 초기화
      window.close();
      setTimeout(() => {
        window.history.go(-(window.history.length - 1));
      }, 100);
    }
  }, []);

  useEffect(() => {
    if (!isAppsInToss()) return;
    import('@apps-in-toss/web-framework').then((sdk: any) => {
      sdk.setNavigationBar?.({ title: '마음정산', visible: true });
    });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center md:py-6">


      <div className="w-full max-w-[430px] h-screen md:h-[880px] bg-gray-50 md:rounded-[44px] md:border-[7px] md:border-zinc-800 md:shadow-2xl relative overflow-hidden overflow-x-hidden flex flex-col">
        <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>

        {/* Bottom Navigation */}
        <nav className="shrink-0 bg-white border-t border-gray-100 safe-bottom z-50">
          <div className="flex justify-around items-center pt-2.5 pb-2 px-3">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => router.push(tab.path)}
                  className="relative flex flex-col items-center justify-center w-14 py-1 rounded-xl transition-all active:scale-90"
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute -top-2.5 w-5 h-[3px] bg-blue-500 rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2.4 : 1.6}
                    className={isActive ? 'text-blue-500' : 'text-gray-400'}
                  />
                  <span className={`text-[10px] mt-1 font-semibold ${isActive ? 'text-blue-500' : 'text-gray-400'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* 앱 종료 확인 다이얼로그 */}
        <AnimatePresence>
          {showExitConfirm && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowExitConfirm(false)}
                className="absolute inset-0 bg-black/40 z-[200]"
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] max-w-[280px] bg-white rounded-2xl overflow-hidden z-[210] shadow-2xl"
              >
                <div className="px-6 pt-7 pb-5">
                  <p className="text-[17px] font-bold text-gray-900 text-center">마음정산을 종료할까요?</p>
                </div>
                <div className="flex border-t border-gray-100 px-4 py-3 space-x-2">
                  <button
                    onClick={() => setShowExitConfirm(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-[15px] font-semibold active:scale-[0.97] transition-all"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleExit}
                    className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-[15px] font-semibold active:scale-[0.97] transition-all"
                  >
                    종료하기
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
