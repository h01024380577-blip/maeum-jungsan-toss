import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/apiClient';
import { trackClick } from '@/src/lib/analytics';
import { useRewardedAd } from '@/src/hooks/useRewardedAd';
import { Sparkles, ArrowUpRight, ArrowDownLeft, Image as ImageIcon, Camera, X as CloseIcon, Heart, Flower2, Cake, Star, Plus, Minus, ChevronRight, Wallet, Copy, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useStore, type EventEntry, type EventType } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useBackHandler } from '../hooks/useBackHandler';
import { formatManInputValue, parseManInputToWon } from '../utils/amountFormat';
import { normalizeImageDataUri } from '../utils/imageDataUri';
import { openExternalUrl } from '../lib/openExternalUrl';

// 금액 추천 로직: 과거 이력·관계·장소를 분석해 상황별 문구 풀에서 매칭되는 구절을 랜덤 선택
function recommendAmount(parsed: any, entries: EventEntry[]): { amt: number; reason: string } {
  const samePast = entries.find(e => e.targetName === parsed.targetName && e.eventType === parsed.eventType);
  const allPast = parsed.targetName ? entries.filter(e => e.targetName === parsed.targetName) : [];
  const theyGaveMe = allPast.filter(e => e.isIncome).length;
  const iGaveThem = allPast.filter(e => !e.isIncome).length;
  const r: string = parsed.relation || '';
  const isHotel = !!(parsed.location && (parsed.location.includes('호텔') || parsed.location.includes('컨벤션')));
  const isClose = r.includes('가족') || r.includes('친척');
  const isBestie = r.includes('절친');
  const isPeer = r.includes('동료') || r.includes('친구');

  let amt = 100000;
  let pool: string[] = [];

  if (samePast) {
    try {
      const d = parseISO(samePast.date);
      if (!isNaN(d.getTime())) {
        const years = Math.max(0, 2026 - d.getFullYear());
        amt = samePast.amount * Math.pow(1.03, years);
        pool = years >= 2
          ? ['예전 금액을 현재 가치로 맞췄어요', '지난번 마음을 시세에 맞게 이어가요']
          : ['지난번과 같은 마음으로 이어가요', '예전과 비슷한 금액으로 추천해요'];
      }
    } catch {}
  } else if (theyGaveMe >= 2) {
    amt = isClose ? 250000 : isBestie ? 200000 : 150000;
    pool = ['나를 많이 챙겨줬던 소중한 분이에요', '오래도록 마음을 주셨던 분이에요', '고마운 인연을 이어가요'];
  } else if (theyGaveMe === 1) {
    amt = isClose ? 200000 : isBestie ? 150000 : isPeer ? 100000 : 70000;
    pool = ['마음을 주셨던 분께 보답하는 뜻으로', '지난 호의를 기억하는 금액이에요'];
  } else if (iGaveThem >= 2) {
    amt = isClose ? 200000 : isBestie ? 150000 : isPeer ? 100000 : 50000;
    pool = ['꾸준히 마음을 건네온 분이에요', '변함없이 이어가는 관계에 맞췄어요'];
  } else if (allPast.length > 0) {
    amt = isClose ? 200000 : isBestie ? 150000 : isPeer ? 100000 : 50000;
    pool = ['오래 인연을 이어온 분이에요', '꾸준히 마음을 나눠온 사이에요'];
  } else {
    if (isClose) { amt = 200000; pool = ['가까운 가족 관계에 맞춘 금액이에요', '가족에게 건네기 좋은 마음이에요']; }
    else if (isBestie) { amt = 150000; pool = ['절친 사이에 어울리는 금액이에요', '각별한 친구에게 맞춘 마음이에요']; }
    else if (r.includes('동료')) { amt = 100000; pool = ['직장 동료에게 건네기 좋은 금액이에요', '동료 사이 평균값을 담았어요']; }
    else if (r.includes('친구')) { amt = 100000; pool = ['친구 사이 평균적인 마음이에요', '친한 사이에 적당한 금액이에요']; }
    else if (r.includes('지인')) { amt = 50000; pool = ['가벼운 인사 정도에 맞는 금액이에요', '예의를 표현하기 좋은 금액이에요']; }
    else { amt = 100000; pool = ['아직 마음을 주고받은 기록이 없어요', '첫 기록이라 평균값으로 추천해요']; }

    if (isHotel) {
      amt += 50000;
      pool = ['호텔 예식장 평균을 반영했어요', '고급 예식장에 맞춘 금액이에요'];
    }
  }

  amt = Math.round(amt / 10000) * 10000;
  const reason = pool[Math.floor(Math.random() * pool.length)] || '관계 기반 추천';
  return { amt, reason };
}

// HTTP 환경에서도 동작하는 클립보드 복사
async function copyToClipboard(text: string): Promise<void> {
  if (isAppsInToss()) {
    const { setClipboardText } = await import('@apps-in-toss/web-framework');
    if (!(await ensureTossPermission(setClipboardText))) {
      throw new Error('clipboard_permission_denied');
    }
    await setClipboardText(text);
    return;
  }
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('copy failed');
}

function isAppsInToss(): boolean {
  return typeof window !== 'undefined' &&
    window.navigator.userAgent.includes('TossApp');
}

type TossPermissionStatus = 'notDetermined' | 'denied' | 'allowed';
type TossPermissionFunction = {
  getPermission?: () => Promise<TossPermissionStatus>;
  openPermissionDialog?: () => Promise<TossPermissionStatus>;
};

async function ensureTossPermission(fn: TossPermissionFunction): Promise<boolean> {
  const current = await fn.getPermission?.().catch(() => null);
  if (!current || current === 'allowed') return true;
  if (current === 'denied') return false;
  const next = await fn.openPermissionDialog?.().catch(() => null);
  return next === 'allowed';
}

const eventIcon = (t: string, size = 14) => {
  if (t === 'wedding') return <Heart size={size} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={size} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={size} className="text-amber-500 fill-amber-500" />;
  return <Star size={size} className="text-blue-500 fill-blue-500" />;
};

const eventLabel = (t: string) => t === 'wedding' ? '결혼' : t === 'funeral' ? '부고' : t === 'birthday' ? '생일' : '기타';

const eventOptions: { value: EventType; label: string; Icon: typeof Heart }[] = [
  { value: 'wedding', label: '결혼', Icon: Heart },
  { value: 'funeral', label: '부고', Icon: Flower2 },
  { value: 'birthday', label: '생일', Icon: Cake },
  { value: 'other', label: '기타', Icon: Star },
];

function formatSheetDate(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) return value;
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(date);
  return `${format(date, 'yyyy.MM.dd')} (${weekday})`;
}

const defaultFormData = (): Partial<EventEntry> => ({
  targetName: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  eventType: 'other' as EventType,
  type: 'EXPENSE',
  isIncome: false,
  location: '',
  relation: '',
  amount: 0,
  account: '',
  memo: '',
  recommendationReason: '',
  customEventName: '',
  contactId: '',
});

export default function HomeTab() {
  const router = useRouter();
  const { entries, addEntry, addFeedback, contacts, tossUserId, tossUserName, isPremium } = useStore();

  // AI 분석 시트
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiInputUrl, setAiInputUrl] = useState('');
  const [aiSelectedImage, setAiSelectedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const { watch: watchAiAd } = useRewardedAd('AI_CREDIT');

  // 메인 폼 상태
  const [formData, setFormData] = useState<Partial<EventEntry>>(defaultFormData());
  const [initialFormData, setInitialFormData] = useState<Partial<EventEntry> | null>(null);

  // 토스페이 송금 모달
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [savedAccount, setSavedAccount] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFormData = useCallback((next: Partial<EventEntry>) => {
    setFormData(next);
  }, []);

  useBackHandler(showAiSheet || showTransferModal, () => {
    if (showTransferModal) { setShowTransferModal(false); return true; }
    if (showAiSheet) { setShowAiSheet(false); return true; }
    return false;
  });

  const greetingName = tossUserName?.trim() ? `${tossUserName.trim().replace(/님$/, '')}님` : '손님';

  const handleCameraCapture = async () => {
    if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
    try {
      const { openCamera } = await import('@apps-in-toss/web-framework');
      if (!(await ensureTossPermission(openCamera))) {
        toast.error('카메라 권한이 필요합니다. 권한을 허용한 뒤 다시 시도해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
        return;
      }
      const result = await openCamera({ base64: true, maxWidth: 1024 });
      const imageData = normalizeImageDataUri(result);
      if (!imageData) {
        toast.error('사진을 가져오지 못했어요. 다시 촬영해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
        return;
      }
      setAiSelectedImage(imageData);
      startAiParse({ type: 'image', data: imageData });
    } catch {
      toast.error('카메라를 열 수 없습니다. 다시 시도해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
    }
  };

  const handleAlbumSelect = async () => {
    if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
    try {
      const { fetchAlbumPhotos } = await import('@apps-in-toss/web-framework');
      if (!(await ensureTossPermission(fetchAlbumPhotos))) {
        toast.error('사진 접근 권한이 필요합니다. 권한을 허용한 뒤 다시 시도해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
        return;
      }
      const result = await fetchAlbumPhotos({ maxCount: 1, base64: true, maxWidth: 1024 });
      const imageData = normalizeImageDataUri(result?.[0]);
      if (!imageData) {
        toast.error('사진을 가져오지 못했어요. 다시 선택해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
        return;
      }
      setAiSelectedImage(imageData);
      startAiParse({ type: 'image', data: imageData });
    } catch {
      toast.error('앨범을 열 수 없습니다. 다시 시도해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const imageData = normalizeImageDataUri(reader.result as string | null);
        if (!imageData) {
          toast.error('사진을 가져오지 못했어요. 다시 선택해 주세요.', { duration: 3000, icon: <AlertCircle size={16} /> });
          return;
        }
        setAiSelectedImage(imageData);
        startAiParse({ type: 'image', data: imageData });
      };
      reader.readAsDataURL(file);
    }
  };

  // 확인 다이얼로그 없이 바로 리워드 광고를 재생 → nonce 획득 시 실제 분석 진행
  // 프리미엄 사용자는 광고를 건너뛰고 빈 nonce로 바로 실행
  const startAiParse = async (params: { type: 'url' | 'image'; data: string }) => {
    trackClick('analyze_start', { input_type: params.type, is_premium: isPremium });
    if (isPremium) {
      handleAiParse(params, '');
      return;
    }
    const nonce = await watchAiAd();
    if (nonce) handleAiParse(params, nonce);
  };

  const handleAiParse = async (params: { type: 'url' | 'image'; data: string }, permissionNonce: string) => {
    const { type, data } = params;
    if (!data) return;

    setIsParsing(true);
    try {
      const res = await apiFetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ type, data, permissionNonce }),
      });
      const result = await res.json();

      if (!result.success) {
        if (result.reason === 'rate_limit') {
          toast.error('무료 분석 한도를 모두 이용하셨습니다. 잠시 후 다시 시도해 주세요.', { duration: 4000, icon: <AlertCircle size={16} /> });
        } else if (result.reason === 'temporarily_unavailable') {
          toast.error(result.message || 'AI 서비스가 잠시 혼잡해요. 잠시 후 다시 시도해 주세요.', { duration: 3500, icon: <AlertCircle size={16} /> });
        } else if (result.reason === 'low_confidence') {
          toast.info(result.message || '초대장 정보를 충분히 읽지 못했어요. 직접 입력을 이용해 주세요.', { duration: 4000, icon: <Info size={16} /> });
        } else {
          toast.error('분석 실패. 직접 입력을 이용해 주세요.', { duration: 3500, icon: <AlertCircle size={16} /> });
        }
        setAiSelectedImage(null);
        setAiInputUrl('');
        setIsParsing(false);
        return;
      }

      const parsed = result.data;
      const { amt, reason } = recommendAmount(parsed, entries);

      const rawDate = parsed.date || format(new Date(), 'yyyy-MM-dd');
      let normalizedDate = rawDate;
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) normalizedDate = format(d, 'yyyy-MM-dd');
      } catch {}

      let targetName = parsed.targetName || '';
      let suggestedNames = parsed.suggestedNames || [];
      if (targetName.includes(',') && (!Array.isArray(suggestedNames) || suggestedNames.length === 0)) {
        const names = targetName.split(/[,，]\s*/).map((n: string) => n.trim()).filter(Boolean);
        if (names.length >= 2) {
          const et = parsed.eventType || 'other';
          const roles = et === 'wedding' ? ['신랑측', '신부측'] : et === 'funeral' ? ['고인', '상주'] : ['주인공', '관련인'];
          suggestedNames = names.map((n: string, i: number) => ({ name: n, label: `${roles[i] || '기타'} · ${n}` }));
          targetName = names[0];
        }
      }

      let account = parsed.account || '';
      let suggestedAccounts = parsed.suggestedAccounts || [];
      if (account.includes(',') && (!Array.isArray(suggestedAccounts) || suggestedAccounts.length === 0)) {
        const accts = account.split(/[,，]\s*/).map((a: string) => a.trim()).filter(Boolean);
        if (accts.length >= 2) {
          suggestedAccounts = accts.map((a: string, i: number) => ({ account: a, label: `계좌 ${i + 1} · ${a.split(' ')[0]}` }));
          account = accts[0];
        }
      }

      const finalData: Partial<EventEntry> = {
        ...parsed,
        targetName,
        suggestedNames,
        account,
        suggestedAccounts,
        date: normalizedDate,
        amount: parsed.amount || amt,
        recommendationReason: reason,
        type: parsed.type || 'EXPENSE',
        isIncome: parsed.type === 'INCOME',
        relation: parsed.relation || '친구',
      };

      setFormData(finalData);
      setInitialFormData(finalData);
      setShowAiSheet(false);
      setAiInputUrl('');
      setAiSelectedImage(null);
      trackClick('analyze_success', {
        input_type: type,
        confidence: parsed.confidence ?? result.confidence ?? null,
        event_type: parsed.eventType ?? null,
      });
      toast.success('AI 분석 완료! 내용을 확인해주세요.', { duration: 2000, icon: <Sparkles size={16} /> });
    } catch (err: any) {
      toast.error(`분석 실패: ${err?.message || '알 수 없는 오류'}`, { duration: 3500, icon: <AlertCircle size={16} /> });
      setAiSelectedImage(null);
      setAiInputUrl('');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!formData.targetName?.trim()) {
      toast.error('이름을 입력해주세요.', { duration: 2000, icon: <AlertCircle size={16} /> });
      return;
    }
    if (initialFormData && JSON.stringify(initialFormData) !== JSON.stringify(formData)) {
      addFeedback(initialFormData, formData);
    }
    try {
      await addEntry({
        contactId: formData.contactId || '',
        eventType: ['wedding', 'funeral', 'birthday', 'other'].includes(formData.eventType || '') ? formData.eventType as EventType : 'other',
        type: formData.isIncome ? 'INCOME' : 'EXPENSE',
        date: formData.date || format(new Date(), 'yyyy-MM-dd'),
        location: formData.location || '',
        targetName: formData.targetName || '',
        amount: Number(formData.amount) || 0,
        relation: formData.relation || '',
        isIncome: !!formData.isIncome,
        memo: formData.memo || '',
        account: formData.account || '',
        recommendationReason: formData.recommendationReason || '',
        customEventName: formData.customEventName || '',
      });
      trackClick('entry_save', {
        entry_type: formData.isIncome ? 'INCOME' : 'EXPENSE',
        event_type: formData.eventType ?? 'other',
      });
      if (isAppsInToss()) {
        const { generateHapticFeedback } = await import('@apps-in-toss/web-framework');
        generateHapticFeedback({ type: 'success' });
      }
      toast.success('저장 완료!', { duration: 1800, icon: <CheckCircle2 size={16} /> });
      if (formData.account && formData.account.trim() && formData.type !== 'INCOME') {
        setSavedAccount(formData.account);
        setShowTransferModal(true);
      }
      setFormData(defaultFormData());
      setInitialFormData(null);
    } catch (err: any) {
      toast.error(`저장 실패: ${err?.message || '알 수 없는 오류'}`, { duration: 3500, icon: <AlertCircle size={16} /> });
    }
  };

  const handleTransferClick = async () => {
    try {
      await copyToClipboard(savedAccount);
      toast.success('계좌번호가 복사되었습니다', { duration: 1600, icon: <Copy size={16} /> });
      setShowTransferModal(false);
      setTimeout(async () => {
        try { await openExternalUrl('supertoss://send'); } catch {}
      }, 300);
    } catch {
      toast.error('토스 앱을 열 수 없습니다.', { duration: 3000, icon: <AlertCircle size={16} /> });
    }
  };

  const canAnalyze = !isParsing && (aiInputUrl.trim().length > 0 || !!aiSelectedImage);

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="px-5 pt-8 pb-4 max-[360px]:px-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Image
                src="/icon.png"
                alt="마음정산"
                width={32}
                height={32}
                className="h-8 w-8 rounded-[10px] shadow-sm"
              />
              <span className="text-[17px] font-black text-gray-950">마음정산</span>
            </div>
            <p className="mt-1 text-[13px] font-bold text-blue-500 max-[360px]:text-[12px]">
              안녕하세요, {greetingName}
            </p>
          </div>
          {!tossUserId && (
            <button
              type="button"
              onClick={() => router.push('/intro')}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gray-950 px-3.5 text-[12px] font-bold text-white active:scale-[0.97] transition-all"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>토스로 로그인</span>
            </button>
          )}
        </div>

        {/* AI 분석 배너 버튼 */}
        <button
          type="button"
          onClick={() => setShowAiSheet(true)}
          className="mt-4 w-full rounded-2xl bg-blue-500 px-4 py-3.5 text-left transition-all active:scale-[0.98] shadow-md shadow-blue-200"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="shrink-0 text-blue-100" />
                <span className="text-[14px] font-black text-white">AI로 초대장 분석하기</span>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold text-blue-100">링크·이미지·메시지를 자동으로 입력해요</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-blue-200" />
          </div>
        </button>
      </div>

      {/* 메인 폼 */}
      <div className="space-y-2 px-5 max-[360px]:px-4">
        <DirectionToggle
          value={formData.type === 'INCOME' ? 'INCOME' : 'EXPENSE'}
          onChange={(nextType) => updateFormData({ ...formData, type: nextType, isIncome: nextType === 'INCOME' })}
        />

        {/* 이름~관계 필드 묶음 */}
        <div className="space-y-2">
          {/* [이름] [관계] 나란히 */}
          <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
            <Field
              label="이름"
              type="contact"
              value={formData.targetName}
              ai={!!initialFormData?.targetName}
              tone={initialFormData?.targetName ? 'blue' : 'gray'}
              onChange={(v: string, cid?: string) => updateFormData({ ...formData, targetName: v, contactId: cid })}
              contacts={contacts}
              suggestedNames={(formData as any).suggestedNames || []}
            />
            <Field
              label="관계"
              compact
              value={formData.relation}
              onChange={(v: string) => updateFormData({ ...formData, relation: v })}
            />
          </div>

          <ReviewDateField
            label="날짜"
            value={formData.date}
            ai={!!initialFormData?.date}
            onChange={(v: string) => updateFormData({ ...formData, date: v })}
          />

          <EventTypeSelector
            value={(formData.eventType || 'other') as EventType}
            ai={!!initialFormData?.eventType}
            initialValue={initialFormData?.eventType as EventType | undefined}
            onChange={(v: EventType) => updateFormData({ ...formData, eventType: v })}
          />

          {formData.eventType === 'other' && (
            <Field
              label="행사명"
              placeholder="돌잔치, 개업식 등"
              value={formData.customEventName}
              ai={!!initialFormData?.customEventName}
              tone={initialFormData?.customEventName ? 'blue' : 'gray'}
              onChange={(v: string) => updateFormData({ ...formData, customEventName: v })}
            />
          )}

          <AmountReviewCard
            amount={formData.amount}
            reason={formData.recommendationReason}
            onChange={(amount: number) => updateFormData({ ...formData, amount })}
          />

          <Field
            label="장소"
            value={formData.location}
            ai={!!initialFormData?.location}
            tone={initialFormData?.location ? 'blue' : 'gray'}
            fitToWidth
            minFitFontSize={12}
            maxFitFontSize={14}
            onChange={(v: string) => updateFormData({ ...formData, location: v })}
          />
        </div>

        <AccountReviewCard
          account={formData.account || ''}
          ai={!!initialFormData?.account}
          suggestedAccounts={(formData as any).suggestedAccounts || []}
          onChange={(account: string) => updateFormData({ ...formData, account })}
          onCopy={async (account: string) => {
            try {
              await copyToClipboard(account);
              toast.success('계좌번호가 복사되었습니다', { duration: 1600, icon: <Copy size={16} /> });
            } catch {
              toast.error('복사 실패', { duration: 2500, icon: <AlertCircle size={16} /> });
            }
          }}
        />

        <Field
          label="메모"
          type="textarea"
          placeholder="필요한 내용만 적어두세요"
          value={formData.memo || ''}
          onChange={(v: string) => updateFormData({ ...formData, memo: v })}
        />

        {/* 저장 버튼 */}
        <div className="pt-2 pb-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!formData.targetName?.trim()}
            className={`h-14 w-full rounded-2xl text-[16px] font-black transition-all active:scale-[0.98] ${
              !formData.targetName?.trim()
                ? 'bg-gray-100 text-gray-300'
                : 'bg-blue-600 text-white shadow-lg shadow-blue-200'
            }`}
          >
            저장하기
          </button>
        </div>
      </div>

      {/* AI 분석 바텀시트 */}
      <AnimatePresence>
        {showAiSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isParsing) setShowAiSheet(false); }}
              className="fixed inset-0 bg-black/40 z-[60]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.3 }}
              onDragEnd={(_, { offset, velocity }) => {
                if (offset.y > 80 || velocity.y > 500) setShowAiSheet(false);
              }}
              className="fixed bottom-0 left-1/2 z-[70] w-full max-w-[430px] -translate-x-1/2 overflow-hidden rounded-t-[32px] bg-white shadow-2xl"
              style={{ touchAction: 'none' }}
            >
              <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-2 max-[360px]:px-4">
                <div className="mx-auto mb-4 h-1 w-12 cursor-grab rounded-full bg-gray-300 active:cursor-grabbing" />

                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-blue-600">
                      <Sparkles size={14} />
                      <span className="text-[13px] font-black">AI 분석</span>
                    </div>
                    <h3 className="mt-1 text-[20px] font-black leading-tight text-gray-950 max-[360px]:text-[18px]">
                      초대장을 분석할게요
                    </h3>
                    <p className="mt-1 text-[13px] font-semibold text-gray-400">링크·이미지·메시지로 자동 입력해요</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!isParsing) setShowAiSheet(false); }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 transition-all"
                    aria-label="닫기"
                  >
                    <CloseIcon size={20} />
                  </button>
                </div>

                {/* URL 입력 */}
                {aiSelectedImage ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3.5">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[14px] animate-pulse bg-blue-100 flex items-center justify-center">
                      <Sparkles size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-[13px] font-black text-blue-600">이미지 선택 완료</p>
                      <button
                        type="button"
                        onClick={() => setAiSelectedImage(null)}
                        className="mt-0.5 text-[11px] font-semibold text-gray-400 underline"
                      >
                        다시 선택
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <textarea
                      value={aiInputUrl}
                      onChange={(e) => setAiInputUrl(e.target.value)}
                      placeholder="청첩장 또는 부고장 URL을 붙여넣으세요..."
                      className="h-[72px] w-full resize-none bg-transparent text-sm font-semibold leading-relaxed text-gray-800 outline-none placeholder:text-gray-400 max-[360px]:text-[13px]"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* 이미지 버튼 */}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCameraCapture}
                    disabled={isParsing}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-[12px] font-black text-gray-600 active:scale-95 transition-all disabled:opacity-40"
                  >
                    <Camera size={15} />
                    <span>카메라</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAlbumSelect}
                    disabled={isParsing}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-[12px] font-black text-gray-600 active:scale-95 transition-all disabled:opacity-40"
                  >
                    <ImageIcon size={15} />
                    <span>앨범</span>
                  </button>
                </div>

                {/* 분석 버튼 */}
                <button
                  type="button"
                  onClick={() => startAiParse({ type: 'url', data: aiInputUrl.trim() })}
                  disabled={!canAnalyze}
                  className={`mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black transition-all active:scale-[0.98] ${
                    canAnalyze
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'bg-gray-100 text-gray-300'
                  }`}
                >
                  {isParsing ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>분석 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>분석하기</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 토스페이 송금 모달 */}
      <AnimatePresence>
        {showTransferModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTransferModal(false)} className="fixed inset-0 bg-black/40 z-[80]" />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, { offset, velocity }) => {
                if (Math.abs(offset.y) > 60 || Math.abs(velocity.y) > 400) setShowTransferModal(false);
              }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-[360px] bg-white rounded-3xl p-6 z-[90] shadow-2xl"
              style={{ touchAction: 'none' }}
            >
              <div className="text-center space-y-4">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
                  <Wallet size={28} className="text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">토스페이로 송금</h3>
                  <p className="text-sm text-gray-400 mt-1">계좌번호가 복사됩니다.<br />토스 앱에서 붙여넣기로 송금하세요</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">계좌번호</p>
                  <p className="break-all text-sm font-bold text-gray-800">{savedAccount}</p>
                </div>
                <div className="flex space-x-2 pt-2">
                  <button onClick={() => setShowTransferModal(false)} className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all">
                    닫기
                  </button>
                  <button type="button" onClick={handleTransferClick} className="flex-[2] py-3.5 bg-blue-500 text-white rounded-xl font-bold text-sm active:scale-95 transition-all shadow-lg shadow-blue-200">
                    토스로 송금하기
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
    </div>
  );
}

function AiPill({ children = 'AI', className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center justify-center rounded-md bg-blue-600 px-1.5 text-[10px] font-black text-white ${className}`}>
      {children}
    </span>
  );
}

function DirectionToggle({ value, onChange }: { value: 'INCOME' | 'EXPENSE'; onChange: (value: 'INCOME' | 'EXPENSE') => void }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-1">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onChange('EXPENSE')}
          className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-all active:scale-[0.98] max-[360px]:gap-1 max-[360px]:text-[11px] ${
            value === 'EXPENSE'
              ? 'bg-white text-red-500 shadow-sm ring-1 ring-red-100'
              : 'text-gray-500'
          }`}
        >
          <ArrowUpRight size={16} />
          <span>보낸 마음</span>
        </button>
        <button
          type="button"
          onClick={() => onChange('INCOME')}
          className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-all active:scale-[0.98] max-[360px]:gap-1 max-[360px]:text-[11px] ${
            value === 'INCOME'
              ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-100'
              : 'text-gray-500'
          }`}
        >
          <ArrowDownLeft size={16} />
          <span>받은 마음</span>
        </button>
      </div>
    </div>
  );
}

function ReviewDateField({ label, value, ai = false, onChange }: { label: string; value?: string; ai?: boolean; onChange: (value: string) => void }) {
  const displayValue = formatSheetDate(value);
  return (
    <div className={`relative rounded-2xl border px-3.5 py-3 max-[360px]:px-2.5 ${ai ? 'border-blue-200 bg-blue-50/80' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex min-h-6 items-center gap-2.5 max-[360px]:gap-2">
        <span className="w-9 shrink-0 text-[11px] font-black text-gray-500 max-[360px]:w-8">{label}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-black text-gray-950">
          {displayValue || '날짜 선택'}
        </span>
        {ai && <AiPill />}
      </div>
      <input
        aria-label={label}
        type="date"
        value={value || ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function EventTypeSelector({ value, ai = false, initialValue, onChange }: { value: EventType; ai?: boolean; initialValue?: EventType; onChange: (value: EventType) => void }) {
  const inferredLabel = eventLabel(initialValue || value);
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 max-[360px]:px-2.5">
      <p className="text-[11px] font-black text-gray-500">종류</p>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5 max-[360px]:gap-1">
        {eventOptions.map(({ value: optionValue, label, Icon }) => {
          const isSelected = optionValue === value;
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              className={`flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-white text-[11px] font-black transition-all active:scale-[0.98] max-[360px]:h-[52px] ${
                isSelected
                  ? 'border-blue-500 text-blue-600 shadow-sm ring-1 ring-blue-100'
                  : 'border-gray-200 text-gray-500'
              }`}
              aria-pressed={isSelected}
            >
              <Icon size={17} className={isSelected ? 'text-blue-600' : 'text-gray-500'} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {ai && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-black text-blue-600">
          <Sparkles size={11} />
          <span>AI가 "{inferredLabel}"으로 추정</span>
        </p>
      )}
    </div>
  );
}

function AmountReviewCard({ amount, reason, onChange }: { amount?: number; reason?: string; onChange: (amount: number) => void }) {
  const value = Number(amount) || 0;
  const displayValue = formatManInputValue(value) || '0';
  const updateAmount = (delta: number) => onChange(Math.max(0, value + delta));

  return (
    <div className="rounded-[24px] border border-gray-100 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] max-[360px]:rounded-[22px] max-[360px]:px-3">
      <p className="text-[13px] font-black text-gray-500">금액</p>

      <div className="mt-3.5 flex items-center justify-between gap-3 max-[360px]:gap-2">
        <button
          type="button"
          onClick={() => updateAmount(-10000)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition-all active:scale-95 max-[360px]:h-11 max-[360px]:w-11"
          aria-label="1만원 줄이기"
        >
          <Minus size={21} strokeWidth={2.4} />
        </button>

        <div className="flex min-w-0 flex-1 items-end justify-center gap-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={(e) => onChange(parseManInputToWon(e.target.value))}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="금액"
            className="min-w-0 max-w-[6ch] bg-transparent text-center text-[36px] font-black leading-none text-gray-950 outline-none tabular-nums max-[380px]:text-[34px] max-[340px]:text-[31px]"
          />
          <span className="mb-1 shrink-0 text-[16px] font-black leading-none text-gray-500 max-[360px]:text-[15px]">만원</span>
        </div>

        <button
          type="button"
          onClick={() => updateAmount(10000)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700 transition-all active:scale-95 max-[360px]:h-11 max-[360px]:w-11"
          aria-label="1만원 늘리기"
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2 max-[360px]:mt-4 max-[360px]:gap-1.5">
        {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map((button) => (
          <button
            key={button.l}
            type="button"
            onClick={() => updateAmount(button.d)}
            className="h-10 min-w-0 rounded-[13px] border border-gray-200 bg-white text-[12px] font-black text-gray-700 transition-all active:scale-[0.98] max-[360px]:h-9 max-[340px]:text-[11px]"
          >
            {button.l}
          </button>
        ))}
      </div>

      {reason && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-blue-600 max-[360px]:px-3">
          <Sparkles size={18} className="shrink-0 fill-sky-400 text-sky-400" />
          <p className="min-w-0 break-keep text-[13px] font-black leading-snug max-[360px]:text-[12px]">
            {reason}
          </p>
        </div>
      )}
    </div>
  );
}

function AccountReviewCard({ account, ai = false, suggestedAccounts = [], onChange, onCopy }: { account: string; ai?: boolean; suggestedAccounts?: any[]; onChange: (account: string) => void; onCopy: (account: string) => Promise<void> }) {
  const accounts: { account: string; label: string }[] = suggestedAccounts
    .map((item: any) => typeof item === 'string' ? { account: item, label: item } : { account: item.account, label: item.label || item.account })
    .filter((item: any) => item.account);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 max-[360px]:px-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black text-gray-500">계좌번호</p>
        {ai && <AiPill />}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={account}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder="은행 계좌번호 예금주"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-black text-gray-950 outline-none placeholder:text-gray-300 max-[360px]:text-[12px]"
        />
        {account.trim() && (
          <button
            type="button"
            onClick={() => onCopy(account)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-black text-gray-700 transition-all active:scale-95 max-[360px]:gap-1 max-[360px]:px-1.5 max-[360px]:text-[10px]"
          >
            <Copy size={16} />
            <span>복사</span>
          </button>
        )}
      </div>
      {accounts.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {accounts.map((item, index) => {
            const isSelected = item.account === account;
            return (
              <button
                key={`${item.account}-${index}`}
                type="button"
                onClick={() => onChange(item.account)}
                className={`max-w-full break-all rounded-xl border px-3 py-2 text-left text-xs font-black transition-all active:scale-95 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-blue-100 bg-white text-blue-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', options = [], ai = false, contacts = [], placeholder = '', suggestedNames = [], tone, fitToWidth = false, minFitFontSize = 12, maxFitFontSize = 14, compact = false }: any) {
  const [show, setShow] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? '');
  const [fitFontSize, setFitFontSize] = useState<number | null>(null);
  const [fitRows, setFitRows] = useState(1);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(value ?? '');
    }
  }, [value]);

  const handleFocus = useCallback((extra?: () => void) => () => {
    extra?.();
    const clean = value ?? '';
    setLocalValue(clean);
    setTimeout(() => {
      if (inputRef.current && inputRef.current.value !== clean) {
        inputRef.current.value = clean;
        setLocalValue(clean);
      }
    }, 50);
  }, [value]);

  const handleCompositionStart = useCallback(() => { composingRef.current = true; }, []);
  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    composingRef.current = false;
    const v = e.currentTarget.value;
    setLocalValue(v);
    onChange(v);
  }, [onChange]);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocalValue(v);
    if (!composingRef.current) onChange(v);
  }, [onChange]);

  const normalizedSuggestions: { name: string; label: string }[] = suggestedNames
    .map((s: any) => typeof s === 'string' ? { name: s, label: s } : { name: s.name, label: s.label || s.name })
    .filter((s: any) => s.name);
  const contactSuggestions = contacts.filter((c: any) => c.name.toLowerCase().includes((localValue || '').toLowerCase()));
  const isBlue = tone ? tone === 'blue' : ai;
  const fieldClass = isBlue ? 'border-blue-200 bg-blue-50/80' : 'border-gray-200 bg-gray-50';
  const outerPadding = compact ? 'px-2.5 py-3' : 'px-3.5 py-3 max-[360px]:px-2.5';
  const labelWidthClass = compact ? 'w-9 shrink-0' : 'w-9 shrink-0 max-[360px]:w-8';
  const innerGap = compact ? 'gap-2.5' : 'gap-2.5 max-[360px]:gap-2';
  const inputClass = 'min-w-0 flex-1 bg-transparent text-[14px] font-black leading-snug text-gray-950 outline-none placeholder:text-gray-300 max-[360px]:text-[13px]';
  const shouldAutoFit = fitToWidth && type === 'text';

  React.useLayoutEffect(() => {
    if (!shouldAutoFit) return;
    const element = inputRef.current;
    if (!element || typeof window === 'undefined') return;

    const fit = () => {
      const text = String(element.value || placeholder || '');
      if (!text.trim()) { setFitFontSize(null); setFitRows(1); return; }
      const availableWidth = element.clientWidth;
      if (availableWidth <= 0) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const computed = window.getComputedStyle(element);
      ctx.font = `${computed.fontStyle} ${computed.fontVariant} ${computed.fontWeight} ${maxFitFontSize}px ${computed.fontFamily}`;
      const measuredWidth = ctx.measureText(text).width;
      const nextFontSize = measuredWidth > availableWidth
        ? Math.max(minFitFontSize, Math.floor((availableWidth / measuredWidth) * maxFitFontSize * 10) / 10)
        : maxFitFontSize;
      const minWidth = measuredWidth * (minFitFontSize / maxFitFontSize);
      setFitFontSize(nextFontSize);
      setFitRows(nextFontSize <= minFitFontSize + 0.1 && minWidth > availableWidth ? 2 : 1);
    };

    fit();
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [shouldAutoFit, localValue, value, placeholder, minFitFontSize, maxFitFontSize]);

  return (
    <div className="relative">
      <div className={`rounded-2xl border ${outerPadding} ${fieldClass}`}>
        <div className={`flex min-h-6 ${innerGap} ${type === 'textarea' ? 'items-start' : 'items-center'}`}>
          <label className={`${labelWidthClass} text-[11px] font-black text-gray-500 ${type === 'textarea' ? 'pt-0.5' : ''}`}>{label}</label>
          {type === 'select' ? (
            <select value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)} className={`${inputClass} appearance-none`}>
              {options.map((o: string) => <option key={o} value={o}>{eventLabel(o)}</option>)}
            </select>
          ) : type === 'contact' ? (
            <input ref={(node) => { inputRef.current = node; }} type="text" value={localValue} placeholder={placeholder} onFocus={handleFocus(() => setShow(true))} onBlur={() => setTimeout(() => setShow(false), 200)} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={inputClass} />
          ) : type === 'date' ? (
            <input type="date" value={value || ''} placeholder="yyyy-MM-dd" onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} className={`${inputClass} appearance-none`} />
          ) : type === 'textarea' ? (
            <textarea ref={(node) => { inputRef.current = node; }} rows={3} value={localValue} placeholder={placeholder} onFocus={handleFocus()} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={`${inputClass} resize-none leading-relaxed font-bold`} />
          ) : shouldAutoFit ? (
            <textarea ref={(node) => { inputRef.current = node; }} rows={fitRows} value={localValue} placeholder={placeholder} onFocus={handleFocus()} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{ fontSize: `${fitFontSize ?? maxFitFontSize}px` }} className={`${inputClass} resize-none overflow-hidden`} />
          ) : (
            <input ref={(node) => { inputRef.current = node; }} type={type} value={localValue} placeholder={placeholder} onFocus={handleFocus()} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={inputClass} />
          )}
          {ai && <AiPill />}
        </div>

        {type === 'contact' && normalizedSuggestions.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {normalizedSuggestions.map((suggestion: { name: string; label: string }, index: number) => {
              const isSelected = suggestion.name === value;
              return (
                <button
                  key={`${suggestion.name}-${index}`}
                  type="button"
                  onClick={() => onChange(suggestion.name)}
                  className={`max-w-full break-all rounded-lg border px-2 py-1.5 text-left text-[11px] font-black transition-all active:scale-95 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-blue-100 bg-white text-blue-600'
                  }`}
                >
                  {suggestion.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {type === 'contact' && show && contactSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-lg">
          {contactSuggestions.map((contact: any) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onChange(contact.name, contact.id)}
              className="w-full px-5 py-3 text-left text-sm font-bold text-gray-800 hover:bg-gray-50"
            >
              {contact.name}
              <span className="ml-1 text-[11px] font-bold text-gray-400">{contact.relation}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
