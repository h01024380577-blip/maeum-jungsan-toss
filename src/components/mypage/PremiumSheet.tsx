'use client';

import { useEffect, useState } from 'react';
import { Crown, X } from 'lucide-react';
import { useStore } from '@/src/store/useStore';
import { getPremiumProduct, purchasePremium, isIapSupported } from '@/src/lib/iap';
import { trackClick } from '@/src/lib/analytics';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PremiumSheet({ open, onClose }: Props) {
  const isPremium = useStore((s) => s.isPremium);
  const tossUserId = useStore((s) => s.tossUserId);
  const loadPremiumStatus = useStore((s) => s.loadPremiumStatus);

  const [price, setPrice] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setSupported(await isIapSupported());
      const product = await getPremiumProduct();
      if (alive) setPrice(product?.displayAmount ?? null);
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const handleBuy = async () => {
    if (!tossUserId) {
      toast.info('토스 로그인 후 구매할 수 있어요.');
      return;
    }
    trackClick('premium_buy_click');
    setBuying(true);
    await purchasePremium({
      onSuccess: async () => {
        await loadPremiumStatus();
        setBuying(false);
        trackClick('premium_purchase');
        toast.success('프리미엄이 적용됐어요. 이제 광고 없이 이용하세요!');
        onClose();
      },
      onError: () => {
        setBuying(false);
        toast.error('결제를 완료하지 못했어요.');
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] rounded-t-3xl bg-white p-6 pb-[calc(2rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown size={22} className="text-[#0488DA]" />
            <h2 className="text-lg font-black text-gray-900">평생 광고 제거 프리미엄</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          <li>• AI 분석을 광고 없이 무제한</li>
          <li>• 대량 가져오기를 광고 없이 무제한</li>
          <li>• 한 번 구매하면 평생 유지</li>
        </ul>

        {isPremium ? (
          <div className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-700">
            이미 프리미엄을 이용 중이에요 👑
          </div>
        ) : !supported ? (
          <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
            현재 토스 앱 버전에서는 구매할 수 없어요. 앱을 업데이트해 주세요.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleBuy}
            disabled={buying}
            className="mt-6 w-full rounded-xl bg-blue-600 py-3.5 text-center font-bold text-white active:scale-[0.98] disabled:opacity-60"
          >
            {buying ? '결제 진행 중…' : price ? `${price} · 구매하기` : '구매하기'}
          </button>
        )}
      </div>
    </div>
  );
}
