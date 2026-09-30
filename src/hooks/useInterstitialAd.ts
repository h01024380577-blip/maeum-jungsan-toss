'use client';

import { useCallback, useEffect } from 'react';
import {
  getRewardedAdLoadStatus,
  getSaveAdGroupId,
  isRewardedAdSupported,
  preloadRewardedAd,
  showRewardedAd,
} from '@/src/lib/ads';

/**
 * 기능을 막지 않는 전면 광고 훅(일반 저장용).
 * - enabled=false(프리미엄 등)면 로드도, 재생도 하지 않는다.
 * - show(): 미리 로드된 광고가 있을 때만 재생하고 닫힐 때까지 기다린다.
 *   준비되지 않았거나 실패하면 조용히 넘어간다 — 저장 흐름을 지연시키지 않기 위해.
 */
export function useInterstitialAd(enabled: boolean) {
  const adGroupId = getSaveAdGroupId();

  useEffect(() => {
    if (!enabled || !adGroupId) return;
    let cancelled = false;
    void (async () => {
      const ok = await isRewardedAdSupported();
      if (cancelled || !ok) return;
      await preloadRewardedAd(adGroupId);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, adGroupId]);

  const show = useCallback(async (): Promise<void> => {
    if (!enabled || !adGroupId) return;
    if (getRewardedAdLoadStatus(adGroupId) !== 'loaded') {
      void preloadRewardedAd(adGroupId);
      return;
    }
    try {
      await showRewardedAd(adGroupId);
    } catch {
      // 광고 실패는 저장과 무관
    }
    void preloadRewardedAd(adGroupId);
  }, [enabled, adGroupId]);

  return { show };
}
