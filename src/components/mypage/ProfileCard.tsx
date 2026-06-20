// src/components/mypage/ProfileCard.tsx
'use client';

import { User, Crown } from 'lucide-react';
import { useStore } from '@/src/store/useStore';

export default function ProfileCard() {
  const tossUserName = useStore((s) => s.tossUserName);
  const tossUserId = useStore((s) => s.tossUserId);
  const isPremium = useStore((s) => s.isPremium);

  const initial = (tossUserName ?? '토').slice(0, 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
      <div className="relative w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
        <span className="text-xl font-black text-blue-600">{initial}</span>
        {isPremium && (
          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-white p-0.5 shadow">
            <Crown size={16} className="text-amber-500 fill-amber-400" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-black text-gray-900 truncate">
          {tossUserName ?? '토스 사용자'}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
          {tossUserId ? (
            <>
              <User size={10} className="inline mr-0.5 -mt-0.5" />
              토스 계정 연결됨
            </>
          ) : (
            '비로그인 상태'
          )}
        </p>
      </div>
    </div>
  );
}
