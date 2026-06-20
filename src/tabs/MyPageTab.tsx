// src/tabs/MyPageTab.tsx
'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useStore } from '@/src/store/useStore';

import ProfileCard from '@/src/components/mypage/ProfileCard';
import StatsOverview from '@/src/components/mypage/StatsOverview';
import SettingsSheet from '@/src/components/mypage/SettingsSheet';
import InlineBanner from '@/src/components/ads/InlineBanner';

const STATS_BANNER_AD_GROUP_ID =
  process.env.NEXT_PUBLIC_AD_GROUP_ID_STATS_BANNER?.trim() || 'ait.v2.live.b224cbf2d96249cc';

export default function MyPageTab() {
  const tossUserId = useStore((s) => s.tossUserId);
  const isLoaded = useStore((s) => s.isLoaded);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // MY 탭은 게스트 접근 허용 (통계/설정 열람)
  if (!isLoaded) return null;

  return (
    <div className="pb-8 min-h-screen bg-white">
      {/* 헤더 — 제목 + 우측 톱니바퀴 (설정 시트) */}
      <div className="px-5 pt-14 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="whitespace-nowrap text-[22px] font-black text-gray-900 tracking-tight">MY</h1>
          <p className="mt-0.5 truncate whitespace-nowrap text-xs text-gray-400">
            {tossUserId
              ? '나의 활동과 설정'
              : '비로그인 · 활동은 로그인 후 저장돼요'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="설정 열기"
          className="p-2 -mr-1 text-gray-400 hover:text-gray-600 active:scale-90 transition-all"
        >
          <Settings size={22} />
        </button>
      </div>

      <div className="px-5 pt-4 space-y-6">
        {/* ① 프로필 */}
        <ProfileCard />

        {/* ② 나의 통계 */}
        <section>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            나의 통계
          </p>
          <StatsOverview />
        </section>

        {/* 배너 광고 — 기존 통계 탭 하단 위치 승계 */}
        {STATS_BANNER_AD_GROUP_ID && (
          <InlineBanner
            adGroupId={STATS_BANNER_AD_GROUP_ID}
            className="mt-2"
          />
        )}
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
