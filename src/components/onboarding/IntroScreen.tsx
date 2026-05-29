'use client';

import { useCallback, useState, type ComponentType } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, TrendingUp, Download } from 'lucide-react';
import { useStore } from '@/src/store/useStore';
import { apiFetch, setAuthToken } from '@/src/lib/apiClient';
import { tossLogin } from '@/src/lib/tossAuth';

interface IntroScreenProps {
  onComplete: () => void;
}

export default function IntroScreen({ onComplete }: IntroScreenProps) {
  const router = useRouter();
  const { loadFromSupabase } = useStore();
  const [isLogging, setIsLogging] = useState(false);

  const handleLogin = useCallback(async () => {
    setIsLogging(true);
    try {
      const result = await tossLogin();
      if (!result) {
        toast.error('토스 로그인이 취소되었습니다.');
        return;
      }
      const res = await apiFetch('/api/auth/toss', {
        method: 'POST',
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || err.error || `로그인 실패 (${res.status})`);
        return;
      }
      const data = await res.json();
      if (data.token) setAuthToken(data.token);
      localStorage.setItem('heartbook-onboarding-seen', 'true');
      await loadFromSupabase();
      onComplete();
      router.replace('/');
    } catch (e) {
      console.error('[IntroScreen] login error:', e);
      toast.error('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLogging(false);
    }
  }, [loadFromSupabase, onComplete, router]);

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-white px-6 pb-[max(24px,env(safe-area-inset-bottom,24px))]">
      {/* 스크롤 가능한 콘텐츠 영역 — 화면이 작아도 버튼은 항상 하단에 고정 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-10">
        {/* 브랜딩 */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <Image
            src="/icon.png"
            alt="마음정산"
            width={80}
            height={80}
            className="h-20 w-20 rounded-[24px] shadow-lg"
          />
          <div className="text-center">
            <h1 className="text-[28px] font-black text-gray-950">마음정산</h1>
            <p className="mt-2 break-keep text-[15px] font-semibold leading-relaxed text-gray-500">
              경조사 마음, 스마트하게 정리해요
            </p>
          </div>
        </div>

        {/* 기능 소개 */}
        <div className="mt-8 space-y-2.5">
          <FeatureRow Icon={Sparkles} color="blue" text="AI가 청첩장·부고장 정보를 자동 입력해요" />
          <FeatureRow Icon={TrendingUp} color="emerald" text="AI가 과거 기록을 분석해 금액을 추천해요" />
          <FeatureRow Icon={Download} color="violet" text="받은 마음을 한번에 가져와 기록할 수 있어요" />
        </div>

        {/* 스페이서 — 화면이 충분히 크면 버튼 위 여백 확보 */}
        <div className="min-h-6 flex-1" />
      </div>

      {/* 하단 고정 버튼 */}
      <div className="shrink-0 space-y-3 pt-3">
        <button
          type="button"
          onClick={handleLogin}
          disabled={isLogging}
          className="h-14 w-full rounded-2xl bg-blue-500 text-[16px] font-black text-white transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {isLogging ? '로그인 중...' : '토스로 시작하기'}
        </button>
        <p className="text-center text-[12px] font-semibold text-gray-400">
          로그인하면 데이터가 안전하게 저장돼요
        </p>
      </div>
    </div>
  );
}

const colorMap = {
  blue: 'bg-blue-100 text-blue-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  violet: 'bg-violet-100 text-violet-600',
} as const;

function FeatureRow({
  Icon,
  color,
  text,
}: {
  Icon: ComponentType<{ size?: number; className?: string }>;
  color: keyof typeof colorMap;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorMap[color]}`}>
        <Icon size={18} />
      </span>
      <span className="text-[clamp(12px,3.5vw,14px)] font-semibold text-gray-700">{text}</span>
    </div>
  );
}
