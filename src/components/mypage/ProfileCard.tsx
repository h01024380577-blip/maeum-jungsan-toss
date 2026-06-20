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
    <div className={`bg-white rounded-2xl border p-5 flex items-center gap-4 ${isPremium ? 'border-[#4FACE5]' : 'border-gray-100'}`}>
      <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
        <span className="text-xl font-black text-blue-600">{initial}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-black text-gray-900 truncate">
          {tossUserName ?? '토스 사용자'}
        </p>
        {isPremium && (
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-extrabold">
            <Crown size={12} className="text-[#0488DA] fill-[#0488DA]" />
            <span className="bg-gradient-to-r from-[#0488DA] to-[#56DDCC] bg-clip-text text-transparent">
              프리미엄 이용중
            </span>
          </span>
        )}
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
