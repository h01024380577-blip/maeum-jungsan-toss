'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlayCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '@/src/lib/apiClient';
import {
  getAdGroupId,
  getRewardedAdLoadStatus,
  isRewardedAdSupported,
  preloadRewardedAd,
  showRewardedAd,
  type RewardedAdLoadStatus,
} from '@/src/lib/ads';
import type { RewardType } from '@prisma/client';

interface Props {
  rewardType: RewardType;
  className?: string;
  label?: string;
  /** 광고 시청 + 서버 redeem 완료 후 nonce를 전달 */
  onGranted?: (nonce: string) => void;
}

export default function RewardedAdButton({ rewardType, className, label, onGranted }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loadStatus, setLoadStatus] = useState<RewardedAdLoadStatus>('idle');
  const [busy, setBusy] = useState(false);
  const adGroupId = getAdGroupId(rewardType);

  useEffect(() => {
    let cancelled = false;
    async function prepareAd() {
      if (!adGroupId) {
        setSupported(false);
        setLoadStatus('failed');
        return;
      }

      setLoadStatus(getRewardedAdLoadStatus(adGroupId));
      const ok = await isRewardedAdSupported();
      if (cancelled) return;
      setSupported(ok);
      if (!ok) {
        setLoadStatus('unsupported');
        return;
      }

      setLoadStatus(getRewardedAdLoadStatus(adGroupId));
      const loaded = await preloadRewardedAd(adGroupId);
      if (cancelled) return;
      setLoadStatus(loaded ? 'loaded' : getRewardedAdLoadStatus(adGroupId));
    }

    void prepareAd();
    return () => {
      cancelled = true;
    };
  }, [adGroupId]);

  const adReady = supported === true && loadStatus === 'loaded';
  const disabled = busy || !adReady || !adGroupId;

  const refreshNextPreload = () => {
    setLoadStatus(getRewardedAdLoadStatus(adGroupId));
    void preloadRewardedAd(adGroupId).then((loaded) => {
      setLoadStatus(loaded ? 'loaded' : getRewardedAdLoadStatus(adGroupId));
    });
  };

  const handleClick = async () => {
    if (busy) return;
    if (supported === false) {
      toast.message('이 버전에서는 광고가 지원되지 않아요. 토스 앱을 최신 버전으로 업데이트해 주세요.');
      return;
    }
    if (!adGroupId) {
      toast.error('광고 설정이 아직 완료되지 않았어요.');
      return;
    }
    if (loadStatus !== 'loaded') {
      toast.message(
        loadStatus === 'failed'
          ? '광고를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.'
          : '광고를 준비하고 있어요. 잠시 후 다시 시도해 주세요.',
      );
      refreshNextPreload();
      return;
    }
    setBusy(true);
    try {
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
        return;
      }
      const { nonce } = await nonceRes.json();

      // 2) 광고 재생
      const outcome = await showRewardedAd(adGroupId);
      refreshNextPreload();
      if (!outcome.earnedReward) {
        toast.message('광고를 끝까지 시청해야 기능을 사용할 수 있어요.');
        return;
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
        return;
      }

      // 4) nonce를 호출자에게 전달 — 호출자가 기능 API에 포함시킨다
      onGranted?.(nonce);
    } catch {
      toast.error('광고 로드에 실패했어요. 잠시 후 다시 시도해 주세요.');
      refreshNextPreload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={
        className ??
        `inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
          disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-md shadow-blue-100 active:scale-95'
        }`
      }
    >
      {busy ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>광고 재생 중…</span>
        </>
      ) : supported === true && loadStatus !== 'loaded' ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>광고 준비 중…</span>
        </>
      ) : (
        <>
          <PlayCircle size={14} />
          <span>{label ?? '광고 보고 시작하기'}</span>
        </>
      )}
    </button>
  );
}
