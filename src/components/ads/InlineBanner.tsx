'use client';

/**
 * 인라인 배너 광고 슬롯.
 * - 토스앱 5.241.0+ 에서만 렌더 (미지원 환경에선 null)
 * - variant='expanded': 전체 너비, height 96px 고정형
 * - destroy() cleanup으로 언마운트 시 메모리 누수 방지
 * - onNoFill/onAdFailedToRender 시 컴포넌트 자체 숨김 (빈 공간 방지)
 */

import { useEffect, useRef, useState } from 'react';
import { useTossBanner, type TossBannerHandle } from '@/src/lib/bannerAds';

interface Props {
  adGroupId: string;
  variant?: 'card' | 'expanded';
  tone?: 'blackAndWhite' | 'grey';
  theme?: 'auto' | 'light' | 'dark';
  /** 배너 상단에 표시할 작은 레이블 (예: "AD" · "광고") */
  label?: string;
  className?: string;
}

export default function InlineBanner({
  adGroupId,
  variant = 'expanded',
  tone = 'blackAndWhite',
  theme = 'auto',
  label = '광고',
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { isInitialized, unsupported, attachBanner } = useTossBanner();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!adGroupId || !isInitialized || !ref.current) return;
    let handle: TossBannerHandle | null = null;
    let disposed = false;

    attachBanner(adGroupId, ref.current, {
      theme,
      tone,
      variant,
      callbacks: {
        onNoFill: () => {
          if (!disposed) setHidden(true);
        },
        onAdFailedToRender: (payload) => {
          console.warn('[banner] render failed:', payload);
          if (!disposed) setHidden(true);
        },
      },
    }).then((h) => {
      if (disposed) {
        h?.destroy();
        return;
      }
      handle = h;
    });

    return () => {
      disposed = true;
      handle?.destroy();
    };
  }, [isInitialized, adGroupId, variant, tone, theme, attachBanner]);

  // 미지원 환경 or 광고 채울 것 없음 → 공간 차지하지 않음
  if (!adGroupId || unsupported || hidden) return null;

  return (
    <div className={className}>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 px-1">
        {label}
      </span>
      <div
        ref={ref}
        style={{ width: '100%', minHeight: variant === 'expanded' ? 96 : 88 }}
      />
    </div>
  );
}
