"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { ThemeProvider as TdsThemeProvider } from "@toss/tds-mobile";
import { useStore } from "@/src/store/useStore";
import Onboarding from "@/src/components/Onboarding";
import { ThemeProvider, useTheme } from "@/src/lib/theme";

const SKIP_ONBOARDING_PATHS = ['/terms', '/intro'];

function InnerProviders({ children }: { children: React.ReactNode }) {
  const { loadFromSupabase, isLoaded, tossUserId } = useStore();
  const pathname = usePathname();
  const { resolved } = useTheme();

  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('heartbook-onboarding-seen') === 'true'
  );

  useEffect(() => {
    loadFromSupabase();
  }, [loadFromSupabase]);

  // 비로그인 상태면 온보딩 상태 초기화 (로그아웃 후 온보딩 재표시)
  useEffect(() => {
    if (isLoaded && !tossUserId) {
      localStorage.removeItem('heartbook-onboarding-seen');
      setHasSeenOnboarding(false);
    }
  }, [isLoaded, tossUserId]);

  const handleOnboardingComplete = useCallback(() => {
    setHasSeenOnboarding(true);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 font-medium">마음정산 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 비로그인이면 무조건 온보딩 표시 (로그인 강제)
  const showOnboarding = !tossUserId && !SKIP_ONBOARDING_PATHS.includes(pathname);

  return (
    <>
      {children}
      {showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
      <Toaster
        position="top-center"
        theme={resolved}
        richColors={false}
        closeButton={false}
        duration={2200}
        offset={56}
        style={{
          fontFamily:
            '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Inter", ui-sans-serif, system-ui, sans-serif',
        }}
        toastOptions={{
          style: {
            fontFamily:
              '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Inter", ui-sans-serif, system-ui, sans-serif',
          },
          classNames: {
            toast:
              '!rounded-2xl !border !border-black/5 dark:!border-white/10 !shadow-lg !backdrop-blur-sm !px-4 !py-3 !text-[13px] !font-semibold',
            success:
              '!bg-emerald-50 !text-emerald-700 dark:!bg-emerald-950/70 dark:!text-emerald-200',
            error:
              '!bg-rose-50 !text-rose-700 dark:!bg-rose-950/70 dark:!text-rose-200',
            info:
              '!bg-blue-50 !text-blue-700 dark:!bg-blue-950/70 dark:!text-blue-200',
            icon: '!mr-2',
          },
        }}
      />
    </>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TdsThemeProvider>
        <InnerProviders>{children}</InnerProviders>
      </TdsThemeProvider>
    </ThemeProvider>
  );
}
