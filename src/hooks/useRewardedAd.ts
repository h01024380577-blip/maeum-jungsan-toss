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
 * 확인 다이얼로그 없이 리워드 광고를 재생하면서 동시에 기능을 실행하는 훅.
 * - 마운트 시 광고를 미리 로드해 둔다(탭 즉시 재생되도록).
 * - run(task): nonce 발급 → task(nonce) 즉시 시작 + 광고 재생 → 광고를 끝까지 봤으면
 *   redeem 후 task 결과를 반환. 광고를 끝까지 보지 않았거나 실패하면 null(사유는 토스트).
 *   서버는 ISSUED 상태 nonce도 소비를 허가하므로 광고가 끝날 때쯤이면 결과가 준비돼 있다.
 */
export function useRewardedAd(rewardType: RewardType) {
  const adGroupId = getAdGroupId();
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

  const run = useCallback(async <T,>(task: (nonce: string) => Promise<T>): Promise<{ result: T } | null> => {
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
      }).catch(() => null);
      if (!nonceRes) {
        toast.error('네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
        return null;
      }
      if (!nonceRes.ok) {
        const err = await nonceRes.json().catch(() => ({}));
        if (err.error === 'active_nonce_limit') {
          toast.message('잠시 후 다시 시도해 주세요.');
        } else {
          toast.error('광고 준비에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
        return null;
      }
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2) 기능 실행을 바로 시작하고, 광고는 그 위에 재생
      const taskPromise = task(nonce);
      taskPromise.catch(() => {}); // 광고 도중 실패해도 unhandled rejection 방지 — 아래에서 다시 await

      let outcome: Awaited<ReturnType<typeof showRewardedAd>>;
      try {
        outcome = await showRewardedAd(adGroupId);
      } catch {
        toast.error('광고 로드에 실패했어요. 잠시 후 다시 시도해 주세요.');
        void preloadRewardedAd(adGroupId);
        return null;
      }
      void preloadRewardedAd(adGroupId); // 다음 광고 미리 로드
      if (!outcome.earnedReward) {
        toast.message('광고를 끝까지 시청해야 기능을 사용할 수 있어요.');
        return null;
      }

      // 3) 시청 기록 redeem — 기능이 먼저 nonce를 소비했어도 서버가 성공 처리한다
      void apiFetch('/api/credits/ad-redeem', {
        method: 'POST',
        body: JSON.stringify({
          nonce,
          reward: { unitType: outcome.unitType, unitAmount: outcome.unitAmount },
        }),
      }).catch(() => {});

      return { result: await taskPromise };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [adGroupId, rewardType]);

  return { run, busy };
}
