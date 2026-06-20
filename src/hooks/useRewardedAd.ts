'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/apiClient';
import {
  getAdGroupId,
  getRewardedAdLoadStatus,
  isRewardedAdSupported,
  preloadRewardedAd,
  showRewardedAd,
} from '@/src/lib/ads';
import type { RewardType } from '@prisma/client';

/**
 * 확인 다이얼로그 없이 리워드 광고를 바로 재생하고 nonce를 반환하는 훅.
 * - 마운트 시 광고를 미리 로드해 둔다(탭 즉시 재생되도록).
 * - watch(): nonce 발급 → 광고 재생 → redeem → nonce 반환. 실패/취소 시 null(사유는 토스트).
 */
export function useRewardedAd(rewardType: RewardType) {
  const adGroupId = getAdGroupId(rewardType);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!adGroupId) return;
      const ok = await isRewardedAdSupported();
      if (cancelled || !ok) return;
      await preloadRewardedAd(adGroupId);
    })();
    return () => {
      cancelled = true;
    };
  }, [adGroupId]);

  const watch = useCallback(async (): Promise<string | null> => {
    if (busyRef.current) return null;
    if (!adGroupId) {
      toast.error('광고 설정이 아직 완료되지 않았어요.');
      return null;
    }
    if (!(await isRewardedAdSupported())) {
      toast.message('이 버전에서는 광고가 지원되지 않아요. 토스 앱을 최신 버전으로 업데이트해 주세요.');
      return null;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      if (getRewardedAdLoadStatus(adGroupId) !== 'loaded') {
        const loaded = await preloadRewardedAd(adGroupId);
        if (!loaded) {
          toast.message('광고를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
          return null;
        }
      }

      // 1) 서버에서 nonce 발급
      const nonceRes = await apiFetch('/api/credits/ad-nonce', {
        method: 'POST',
        body: JSON.stringify({ rewardType, adGroupId }),
      });
      if (!nonceRes.ok) {
        const err = await nonceRes.json().catch(() => ({}));
        if (err.error === 'active_nonce_limit') {
          toast.message('잠시 후 다시 시도해 주세요.');
        } else {
          toast.error('광고 준비에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
        return null;
      }
      const { nonce } = await nonceRes.json();

      // 2) 광고 재생
      const outcome = await showRewardedAd(adGroupId);
      void preloadRewardedAd(adGroupId); // 다음 광고 미리 로드
      if (!outcome.earnedReward) {
        toast.message('광고를 끝까지 시청해야 기능을 사용할 수 있어요.');
        return null;
      }

      // 3) 서버 redeem → REDEEMED nonce 확보
      const redeemRes = await apiFetch('/api/credits/ad-redeem', {
        method: 'POST',
        body: JSON.stringify({
          nonce,
          reward: { unitType: outcome.unitType, unitAmount: outcome.unitAmount },
        }),
      });
      if (!redeemRes.ok) {
        toast.error('보상 확인에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return null;
      }

      return nonce as string;
    } catch {
      toast.error('광고 로드에 실패했어요. 잠시 후 다시 시도해 주세요.');
      void preloadRewardedAd(adGroupId);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [adGroupId, rewardType]);

  return { watch, busy };
}
