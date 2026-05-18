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
import { useStore } from '@/src/store/useStore';
import type { RewardType } from '@prisma/client';
import CreditGrantedDialog from './CreditGrantedDialog';

interface Props {
  rewardType: RewardType;
  className?: string;
  /** 기본 라벨 대신 표시할 텍스트 (헤더 등 좁은 공간용) */
  label?: string;
  /** 성공 콜백 (크레딧 충전 완료 후) */
  onCharged?: (newBalance: number) => void;
}

const LABELS: Record<RewardType, { idle: string }> = {
  AI_CREDIT: {
    idle: '광고 보고 AI 분석 +1회',
  },
  CSV_CREDIT: {
    idle: '광고 보고 대량 가져오기 +1회',
  },
};

export default function RewardedAdButton({ rewardType, className, label, onCharged }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loadStatus, setLoadStatus] = useState<RewardedAdLoadStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [grantedBalance, setGrantedBalance] = useState<number | null>(null);
  const credits = useStore((s) => s.credits);
  const refreshCredits = useStore((s) => s.refreshCredits);
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

  const slot = rewardType === 'AI_CREDIT' ? credits.ai : credits.csv;
  // 활성 조건은 "잔고가 cap 미만" + "환경 미지원이 확정되지 않음".
  // 오늘 광고 시청 상한(daily_ad_limit)도 클릭 시점에 서버에서 검사하므로
  // 여기서는 로컬 watchesRemaining만으로 선차단하지 않음.
  const capReached = slot.balance >= slot.cap;
  const adReady = supported === true && loadStatus === 'loaded';
  const disabled = busy || !adReady || capReached || !adGroupId;

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
    if (slot.balance >= slot.cap) {
      toast.message(`크레딧이 가득 찼어요 (최대 ${slot.cap}회).`);
      return;
    }
    setBusy(true);
    try {
      // 1) 서버에서 nonce 발급
      const nonceRes = await apiFetch('/api/credits/ad-nonce', {
        method: 'POST',
        body: JSON.stringify({
          rewardType,
          adGroupId,
        }),
      });
      if (!nonceRes.ok) {
        const err = await nonceRes.json().catch(() => ({}));
        if (err.error === 'daily_ad_limit') {
          toast.message('오늘 광고 시청을 모두 사용했어요. 내일 다시 받을 수 있어요.');
        } else if (err.error === 'cap_reached_ai' || err.error === 'cap_reached_csv') {
          toast.message(`최대 ${slot.cap}회까지 보관할 수 있어요. 사용 후 다시 충전해 주세요.`);
        } else {
          toast.error('광고 준비에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
        await refreshCredits();
        return;
      }
      const { nonce } = await nonceRes.json();

      // 2) 사전에 로드된 광고 show
      const outcome = await showRewardedAd(adGroupId);
      refreshNextPreload();
      if (!outcome.earnedReward) {
        toast.message('광고를 끝까지 시청해야 보상을 받을 수 있어요.');
        return;
      }

      // 3) 서버 redeem
      const redeemRes = await apiFetch('/api/credits/ad-redeem', {
        method: 'POST',
        body: JSON.stringify({
          nonce,
          reward: { unitType: outcome.unitType, unitAmount: outcome.unitAmount },
        }),
      });
      if (!redeemRes.ok) {
        toast.error('보상 지급에 실패했어요. 잠시 후 다시 시도해 주세요.');
        await refreshCredits();
        return;
      }
      const result = await redeemRes.json();
      await refreshCredits();
      setGrantedBalance(result.balance);
    } catch {
      toast.error('광고 로드에 실패했어요. 잠시 후 다시 시도해 주세요.');
      refreshNextPreload();
    } finally {
      setBusy(false);
    }
  };

  const handleGrantedConfirm = () => {
    const balance = grantedBalance;
    setGrantedBalance(null);
    if (balance !== null) onCharged?.(balance);
  };

  return (
    <>
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
        ) : supported === true && loadStatus !== 'loaded' && !capReached ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>광고 준비 중…</span>
          </>
        ) : (
          <>
            <PlayCircle size={14} />
            <span>{label ?? LABELS[rewardType].idle}</span>
          </>
        )}
      </button>
      <CreditGrantedDialog
        open={grantedBalance !== null}
        rewardType={rewardType}
        onConfirm={handleGrantedConfirm}
      />
    </>
  );
}
