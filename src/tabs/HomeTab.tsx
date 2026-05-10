import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/apiClient';
import AdPromptDialog from '@/src/components/ads/AdPromptDialog';
import { Send, Sparkles, ArrowUpRight, ArrowDownLeft, Link as LinkIcon, Image as ImageIcon, Upload, X as CloseIcon, Heart, Flower2, Cake, Star, Plus, ChevronRight, Wallet, Copy, LogIn, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useStore, EventEntry, EventType } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';



// 계좌번호 문자열에서 은행명과 계좌번호 파싱
// 예: "신한은행 110-123-456789 김진호" → { bank: "신한은행", accountNo: "110-123-456789" }
function parseAccount(account: string): { bank: string; accountNo: string } {
  const parts = account.trim().split(/\s+/);
  const bank = parts[0] || '';
  const accountNo = parts[1] || '';
  return { bank, accountNo };
}

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
  // 앱인토스 환경
  if (isAppsInToss()) {
    const { setClipboardText } = await import('@apps-in-toss/web-framework');
    await (setClipboardText as any)(text);
    return;
  }
  // HTTPS 환경
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // HTTP fallback (execCommand)
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

// 앱인토스 WebView 환경 감지
function isAppsInToss(): boolean {
  return typeof window !== 'undefined' &&
    window.navigator.userAgent.includes('TossApp');
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

export default function HomeTab() {
  const router = useRouter();
  const handleTossLogin = () => {
    router.push('/intro');
  };
  const { entries, addEntry, addFeedback, contacts, loadFromSupabase, tossUserId, refreshCredits } = useStore();
  const [inputText, setInputText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [adPromptOpen, setAdPromptOpen] = useState(false);
  const [parsedData, setParsedData] = useState<Partial<EventEntry> | null>(null);
  const [initialParsedData, setInitialParsedData] = useState<Partial<EventEntry> | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [savedAccount, setSavedAccount] = useState('');
  const [lastClipboardText, setLastClipboardText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);


  React.useEffect(() => {
    const check = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        let text = '';
        if (isAppsInToss()) {
          const { getClipboardText } = await import('@apps-in-toss/web-framework');
          text = await getClipboardText();
        } else {
          text = await navigator.clipboard.readText();
        }
        if (text && text !== lastClipboardText && text.length > 10) {
          if (['결혼', '부고', '장례', '초대', '모십니다', '축하'].some(k => text.includes(k))) {
            setLastClipboardText(text); setInputText(text);
            // 자동 파싱 제거 - 사용자가 직접 분석 버튼을 누르도록 변경
          }
        }
      } catch {}
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [lastClipboardText]);

  const totalGiven = entries.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const totalReceived = entries.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const balance = totalReceived - totalGiven;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { const b64 = reader.result as string; setSelectedImage(b64); handleParse({ type: 'image', data: b64 }); };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = async () => {
    if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
    const { openCamera } = await import('@apps-in-toss/web-framework');
    const r: any = await openCamera();
    if (r?.base64) { const d = `data:image/jpeg;base64,${r.base64}`; setSelectedImage(d); handleParse({ type: 'image', data: d }); }
  };

  const handleAlbumSelect = async () => {
    if (!isAppsInToss()) { fileInputRef.current?.click(); return; }
    const { fetchAlbumPhotos } = await import('@apps-in-toss/web-framework');
    const r: any = await (fetchAlbumPhotos as any)({ maxCount: 1, base64: true });
    if (r?.[0]?.dataUri) { const d = `data:image/jpeg;base64,${r[0].dataUri}`; setSelectedImage(d); handleParse({ type: 'image', data: d }); }
  };

  const handleParse = async (params?: { type: 'text' | 'url' | 'image'; data: string } | string) => {
    let type: 'text' | 'url' | 'image' = 'text';
    let data = '';
    if (typeof params === 'string') { data = params; }
    else if (params) { type = params.type; data = params.data; }
    else { type = inputUrl.trim() ? 'url' : 'text'; data = type === 'url' ? inputUrl : inputText; }
    if (!data?.trim()) return;

    setIsParsing(true);
    try {
      // 모든 분석을 서버 API Route로 위임 (NEXT_PUBLIC 키 노출 제거)
      const res = await apiFetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ type, data }),
      });
      const result = await res.json();

      if (!result.success) {
        if (result.reason === 'rate_limit') {
          toast.error('무료 분석 한도를 모두 이용하셨습니다. 잠시 후 다시 시도해 주세요.', { duration: 4000, icon: <AlertCircle size={16} /> });
        } else if (result.reason === 'temporarily_unavailable') {
          toast.error(result.message || 'AI 서비스가 잠시 혼잡해요. 잠시 후 다시 시도해 주세요.', { duration: 3500, icon: <AlertCircle size={16} /> });
        } else if (result.reason === 'low_confidence') {
          toast.info(result.message || '초대장 정보를 충분히 읽지 못했어요. 직접 입력을 이용해 주세요.', { duration: 4000, icon: <Info size={16} /> });
        } else if (result.reason === 'no_credits') {
          setAdPromptOpen(true);
        } else {
          toast.error('분석 실패. 직접 입력을 이용해 주세요.', { duration: 3500, icon: <AlertCircle size={16} /> });
        }
        setSelectedImage(null); setInputUrl(''); setInputText('');
        setIsParsing(false);
        return;
      }

      const parsed = result.data;

      const { amt, reason } = recommendAmount(parsed, entries);

      const rawDate = parsed.date || format(new Date(), 'yyyy-MM-dd');
      // 날짜를 yyyy-MM-dd 형식으로 정규화
      let normalizedDate = rawDate;
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) normalizedDate = format(d, 'yyyy-MM-dd');
      } catch {}
      // 방어 코드: AI가 targetName에 "김진호, 이나은" 처럼 합쳐서 넣은 경우 자동 분리
      let targetName = parsed.targetName || '';
      let suggestedNames = parsed.suggestedNames || [];
      if (targetName.includes(',') && (!Array.isArray(suggestedNames) || suggestedNames.length === 0)) {
        const names = targetName.split(/[,，]\s*/).map((n: string) => n.trim()).filter(Boolean);
        if (names.length >= 2) {
          const eventType = parsed.eventType || 'other';
          const roles = eventType === 'wedding' ? ['신랑측', '신부측'] : eventType === 'funeral' ? ['고인', '상주'] : ['주인공', '관련인'];
          suggestedNames = names.map((n: string, i: number) => ({ name: n, label: `${roles[i] || '기타'} · ${n}` }));
          targetName = names[0]; // 첫 번째 이름을 기본값으로
        }
      }
      // 방어 코드: account에 콤마로 여러 계좌가 합쳐진 경우
      let account = parsed.account || '';
      let suggestedAccounts = parsed.suggestedAccounts || [];
      if (account.includes(',') && (!Array.isArray(suggestedAccounts) || suggestedAccounts.length === 0)) {
        const accts = account.split(/[,，]\s*/).map((a: string) => a.trim()).filter(Boolean);
        if (accts.length >= 2) {
          suggestedAccounts = accts.map((a: string, i: number) => ({ account: a, label: `계좌 ${i + 1} · ${a.split(' ')[0]}` }));
          account = accts[0];
        }
      }
      const finalData = { ...parsed, targetName, suggestedNames, account, suggestedAccounts, date: normalizedDate, amount: parsed.amount || amt, recommendationReason: reason, type: parsed.type || 'EXPENSE', isIncome: parsed.type === 'INCOME', relation: parsed.relation || '친구' };
      setParsedData(finalData); setInitialParsedData(finalData); setShowBottomSheet(true);
    } catch (err: any) {
      toast.error(`저장 실패: ${err?.message || '알 수 없는 오류'}`, { duration: 3500, icon: <AlertCircle size={16} /> });
      setSelectedImage(null); setInputUrl(''); setInputText('');
    } finally {
      setIsParsing(false);
      // 성공/실패/환불 어떤 경로든 서버 잔고와 UI 배지를 반드시 맞춘다.
      refreshCredits();
    }
  };

  const handleManualEntry = () => {
    const d: any = { targetName: '', date: format(new Date(), 'yyyy-MM-dd'), eventType: 'wedding', location: '', relation: '', amount: 0, type: 'EXPENSE', isIncome: false };
    setInputText(''); setInputUrl(''); setSelectedImage(null);
    setParsedData(d); setInitialParsedData(null); setShowBottomSheet(true);
  };


  const handleSave = async (fd: any) => {
    if (initialParsedData && JSON.stringify(initialParsedData) !== JSON.stringify(fd)) addFeedback(initialParsedData, fd);
    try {
      await addEntry({
        contactId: fd.contactId, eventType: ['wedding', 'funeral', 'birthday', 'other'].includes(fd.eventType) ? fd.eventType : 'other',
        type: fd.isIncome ? 'INCOME' : 'EXPENSE', date: fd.date, location: fd.location || '', targetName: fd.targetName || '',
        amount: Number(fd.amount) || 0, relation: fd.relation || '', isIncome: !!fd.isIncome, memo: fd.memo || '',
        account: fd.account || '', recommendationReason: fd.recommendationReason || '', customEventName: fd.customEventName || '',
      });
      if (isAppsInToss()) {
        const { generateHapticFeedback } = await import('@apps-in-toss/web-framework');
        generateHapticFeedback({ type: 'success' });
      }
      toast.success('저장 완료!', { duration: 1800, icon: <CheckCircle2 size={16} /> });

      // 계좌번호가 있으면 토스페이 송금 모달 표시
      if (fd.account && fd.account.trim() && fd.type !== 'INCOME') {
        setSavedAccount(fd.account);
        setShowTransferModal(true);
      }
      setShowBottomSheet(false); setInputText(''); setInputUrl(''); setSelectedImage(null); setParsedData(null); setInitialParsedData(null);
    } catch (err: any) {
      console.error('Save failed:', err);
      toast.error(`저장 실패: ${err?.message || '알 수 없는 오류'}`, { duration: 3500, icon: <AlertCircle size={16} /> });
    }
  };

  const recentEntries = entries.slice(0, 3);

  return (
    <div className="pb-4">
      {/* Header — 프로필은 MY 탭으로 이관. 비로그인만 로그인 CTA 노출 */}
      <div className="px-5 pt-14 pb-6 bg-white">
        {!tossUserId && (
          <div className="flex items-center mb-8">
            <button
              type="button"
              onClick={handleTossLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500 text-white text-xs font-bold shrink-0 shadow-sm shadow-blue-100 active:scale-[0.97] transition-all"
            >
              <LogIn size={13} />
              <span>토스 로그인</span>
            </button>
          </div>
        )}

        {/* Hero Title */}
        <div className="text-center mb-6">
          <img
            src="/icon.png"
            alt="마음정산"
            width={64}
            height={64}
            className="mx-auto mb-3 rounded-2xl shadow-sm"
          />
          <h2 className="text-[28px] font-black text-gray-900 tracking-tight">마음정산 AI</h2>
          <p className="text-sm text-gray-400 mt-1">링크나 이미지만으로 경조사 정보를 자동 입력하세요</p>
        </div>

        {/* Summary Cards — 내역이 없어도 프레임은 유지하고 0으로 표시 */}
        <div className="grid grid-cols-3 gap-2.5 mb-2">
          <div className="bg-blue-50 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <ArrowDownLeft size={11} className="text-blue-500" />
              <span className="text-[9px] font-bold text-blue-400 uppercase">받은 마음</span>
            </div>
            <p className="text-base font-black text-blue-600">{(totalReceived / 10000).toFixed(0)}<span className="text-[10px] font-bold text-blue-400">만</span></p>
          </div>
          <div className="bg-red-50 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <ArrowUpRight size={11} className="text-red-400" />
              <span className="text-[9px] font-bold text-red-400 uppercase">보낸 마음</span>
            </div>
            <p className="text-base font-black text-red-500">{(totalGiven / 10000).toFixed(0)}<span className="text-[10px] font-bold text-red-400">만</span></p>
          </div>
          <div className="bg-gray-50 rounded-2xl p-3 text-center border border-gray-100">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <Wallet size={11} className="text-gray-400" />
              <span className="text-[9px] font-bold text-gray-400 uppercase">합계</span>
            </div>
            <p className={`text-base font-black ${balance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{balance >= 0 ? '+' : ''}{(balance / 10000).toFixed(0)}<span className="text-[10px] font-bold text-gray-400">만</span></p>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="px-5 pt-4 space-y-3">
        {/* URL Input Card */}
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 space-y-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <LinkIcon size={16} className="text-blue-500" />
            </div>
            <span className="text-sm font-bold text-gray-800">링크 업로드</span>
          </div>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2.5">
            <input
              type="text" value={inputUrl} onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://mcard.kakao.com/..."
              className="min-w-0 flex-1 px-4 py-3 bg-gray-50 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-300 border border-gray-100"
            />
            <button
              onClick={() => handleParse({ type: 'url', data: inputUrl })}
              disabled={isParsing || !inputUrl.trim()}
              className={`shrink-0 px-4 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center space-x-1.5 whitespace-nowrap ${
                isParsing || !inputUrl.trim() ? 'bg-gray-100 text-gray-300 border border-gray-100' : 'bg-blue-500 text-white shadow-md shadow-blue-200'
              }`}
            >
              {isParsing && inputUrl.trim() ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Sparkles size={14} /><span>분석하기</span></>}
            </button>
          </div>
        </div>

        {/* Image Upload Card */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="bg-white rounded-[24px] p-8 shadow-sm border-2 border-dashed border-gray-200 flex flex-col items-center justify-center space-y-4 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer group"
        >
          {selectedImage ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden animate-pulse">
                <img src="/ai-loading-icon.png" alt="AI 분석 중" className="w-full h-full object-cover" />
              </div>
              <p className="text-sm font-bold text-blue-600">이미지 분석 중...</p>
              <p className="text-[11px] text-blue-400">잠시만 기다려 주세요</p>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-50 text-blue-400 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                <ImageIcon size={32} />
              </div>
              <div className="text-center">
                <p className="text-base font-black text-gray-800">이미지 업로드</p>
                <p className="text-xs text-gray-400 mt-1">여기를 클릭하거나 이미지를 드래그하여 업로드</p>
              </div>
              <div className="flex items-center space-x-1.5 text-[9px] font-bold text-gray-400 bg-gray-50 px-3.5 py-1.5 rounded-full tracking-wider">
                <Upload size={10} />
                <span>이미지 업로드</span>
              </div>
            </>
          )}
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        </div>

        {/* Text Input Card */}
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center">
                <Send size={16} className="text-gray-400" />
              </div>
              <span className="text-sm font-bold text-gray-800">텍스트 붙여넣기</span>
            </div>
            {inputText && <button onClick={() => setInputText('')} className="text-gray-300 hover:text-gray-500"><CloseIcon size={14} /></button>}
          </div>
          <textarea
            value={inputText} onChange={(e) => setInputText(e.target.value)}
            placeholder="텍스트를 붙여넣으세요..."
            className="w-full h-20 p-3.5 bg-gray-50 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 resize-none transition-all placeholder:text-gray-300 border border-gray-100"
          />
          {inputText.trim() && (
            <button onClick={() => handleParse({ type: 'text', data: inputText })} disabled={isParsing} className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-bold text-sm active:scale-[0.98] transition-all flex items-center justify-center space-x-2">
              {isParsing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Sparkles size={14} className="text-blue-400" /><span>텍스트 분석하기</span></>}
            </button>
          )}
        </div>

        {/* Manual Entry */}
        <button onClick={handleManualEntry} className="w-full bg-white rounded-[24px] p-4 shadow-sm border border-gray-100 flex items-center justify-between group hover:shadow-md transition-all active:scale-[0.98]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
              <Plus size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800">직접 입력하기</p>
              <p className="text-[11px] text-gray-400">AI 분석 없이 모든 정보를 직접 입력</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
        </button>

        {/* Recent Activity */}
        {recentEntries.length > 0 && (
          <div className="pt-3 space-y-2.5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">최근 내역</h3>
            {recentEntries.map(e => (
              <div key={e.id} className="bg-white px-4 py-3 rounded-2xl border border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'}`}>
                    {eventIcon(e.eventType)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{e.targetName}</p>
                    <p className="text-[10px] text-gray-400">{eventLabel(e.eventType)}</p>
                  </div>
                </div>
                <p className={`text-sm font-black ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                  {e.type === 'INCOME' ? '+' : '-'}{e.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <AnimatePresence>
        {showBottomSheet && parsedData && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBottomSheet(false)} className="fixed inset-0 bg-black/40 z-[60]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }} className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] max-h-[94dvh] bg-white rounded-t-[32px] z-[70] shadow-2xl overflow-hidden flex flex-col">
              <div className="shrink-0 border-b border-gray-100 bg-white px-5 pb-3 pt-2">
                <div className="w-14 h-1 bg-gray-300 rounded-full mx-auto mb-3.5" />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-black text-blue-600">
                      <Sparkles size={12} />
                      <span>{initialParsedData ? 'AI 분석 완료' : '직접 입력'}</span>
                    </div>
                    <h3 className="mt-1.5 text-[20px] leading-tight font-black tracking-tight text-gray-950">
                      {initialParsedData ? '내용을 확인해주세요' : '내용을 입력해주세요'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBottomSheet(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 transition-all"
                    aria-label="닫기"
                  >
                    <CloseIcon size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar bg-white px-3 py-2.5 space-y-2">
                <DirectionToggle
                  value={parsedData.type === 'INCOME' ? 'INCOME' : 'EXPENSE'}
                  onChange={(nextType) => setParsedData({...parsedData, type: nextType, isIncome: nextType === 'INCOME'})}
                />

                <Field
                  label="이름"
                  type="contact"
                  value={parsedData.targetName}
                  ai={!!initialParsedData?.targetName}
                  tone={initialParsedData?.targetName ? 'blue' : 'gray'}
                  onChange={(v: string, cid?: string) => setParsedData({...parsedData, targetName: v, contactId: cid})}
                  contacts={contacts}
                  suggestedNames={(parsedData as any).suggestedNames || []}
                />

                <ReviewDateField
                  label="날짜"
                  value={parsedData.date}
                  ai={!!initialParsedData?.date}
                  onChange={(v: string) => setParsedData({...parsedData, date: v})}
                />

                <EventTypeSelector
                  value={(parsedData.eventType || 'other') as EventType}
                  ai={!!initialParsedData?.eventType}
                  initialValue={initialParsedData?.eventType as EventType | undefined}
                  onChange={(v: EventType) => setParsedData({...parsedData, eventType: v})}
                />

                {parsedData.eventType === 'other' && (
                  <Field
                    label="행사명"
                    placeholder="돌잔치, 개업식 등"
                    value={parsedData.customEventName}
                    ai={!!initialParsedData?.customEventName}
                    tone={initialParsedData?.customEventName ? 'blue' : 'gray'}
                    onChange={(v: string) => setParsedData({...parsedData, customEventName: v})}
                  />
                )}

                <Field
                  label="장소"
                  value={parsedData.location}
                  ai={!!initialParsedData?.location}
                  tone={initialParsedData?.location ? 'blue' : 'gray'}
                  fitToWidth
                  minFitFontSize={12}
                  maxFitFontSize={14}
                  onChange={(v: string) => setParsedData({...parsedData, location: v})}
                />

                <Field
                  label="관계"
                  value={parsedData.relation}
                  onChange={(v: string) => setParsedData({...parsedData, relation: v})}
                />

                <AmountReviewCard
                  amount={parsedData.amount}
                  reason={parsedData.recommendationReason}
                  ai={!!initialParsedData}
                  onChange={(amount: number) => setParsedData({...parsedData, amount})}
                />

                <AccountReviewCard
                  account={parsedData.account || ''}
                  ai={!!initialParsedData?.account}
                  suggestedAccounts={(parsedData as any).suggestedAccounts || []}
                  onChange={(account: string) => setParsedData({...parsedData, account})}
                  onCopy={async (account: string) => {
                    try {
                      await copyToClipboard(account);
                      toast.success('계좌번호가 복사되었습니다', { duration: 1600, icon: <Copy size={16} /> });
                    } catch {
                      toast.error('복사 실패', { duration: 2500, icon: <AlertCircle size={16} /> });
                    }
                  }}
                />
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2.5">
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowBottomSheet(false)}
                    className="h-12 w-20 rounded-xl bg-gray-100 text-[13px] font-black text-gray-600 active:scale-[0.98] transition-all"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(parsedData)}
                    disabled={!parsedData.targetName?.trim()}
                    className={`h-12 flex-1 rounded-xl text-base font-black active:scale-[0.98] transition-all ${!parsedData.targetName?.trim() ? 'bg-gray-100 text-gray-300' : 'bg-blue-600 text-white shadow-lg shadow-blue-200'}`}
                  >
                    저장하기
                  </button>
                </div>
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
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-[360px] bg-white rounded-3xl p-6 z-[90] shadow-2xl">
              <div className="text-center space-y-4">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
                  <Wallet size={28} className="text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900">토스페이로 송금</h3>
                  <p className="text-sm text-gray-400 mt-1">계좌번호가 복사됩니다.<br/>토스 앱에서 붙여넣기로 송금하세요</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">계좌번호</p>
                  <p className="text-sm font-bold text-gray-800">{savedAccount}</p>
                </div>
                <div className="flex space-x-2 pt-2">
                  <button onClick={() => setShowTransferModal(false)} className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all">
                    닫기
                  </button>
                  <button onClick={async () => {
                    try {
                      await copyToClipboard(savedAccount);
                      toast.success('계좌번호가 복사되었습니다', { duration: 1600, icon: <Copy size={16} /> });
                      setShowTransferModal(false);
                      setTimeout(async () => {
                        // 토스 앱 송금 화면으로 이동
                        try {
                          if (isAppsInToss()) {
                            const { openURL } = await import('@apps-in-toss/web-framework');
                            await openURL('supertoss://send');
                          } else {
                            window.location.href = 'supertoss://send';
                          }
                        } catch {
                          // 스킴 열기 실패 시 무시 (계좌번호는 이미 복사됨)
                        }
                      }, 300);
                    } catch {
                      toast.error('토스 앱을 열 수 없습니다.', { duration: 3000, icon: <AlertCircle size={16} /> });
                    }
                  }} className="flex-[2] py-3.5 bg-blue-500 text-white rounded-xl font-bold text-sm active:scale-95 transition-all shadow-lg shadow-blue-200">
                    토스로 송금하기
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AdPromptDialog
        open={adPromptOpen}
        onClose={() => setAdPromptOpen(false)}
        rewardType="AI_CREDIT"
      />
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
          className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-all active:scale-[0.98] ${
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
          className={`flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-black transition-all active:scale-[0.98] ${
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
    <div className={`relative rounded-2xl border px-3.5 py-3 ${ai ? 'border-blue-200 bg-blue-50/80' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex min-h-6 items-center gap-2.5">
        <span className="w-9 shrink-0 text-[11px] font-black text-gray-500">{label}</span>
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
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3">
      <p className="text-[11px] font-black text-gray-500">종류</p>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {eventOptions.map(({ value: optionValue, label, Icon }) => {
          const isSelected = optionValue === value;
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              className={`flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-white text-[11px] font-black transition-all active:scale-[0.98] ${
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

function AmountReviewCard({ amount, reason, ai = false, onChange }: { amount?: number; reason?: string; ai?: boolean; onChange: (amount: number) => void }) {
  const value = Number(amount) || 0;
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/80 px-3.5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-black text-blue-600">금액</p>
        {ai && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white px-2 text-[10px] font-black text-blue-600">
            <Sparkles size={10} />
            추천
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2 overflow-hidden">
        <input
          type="text"
          inputMode="numeric"
          value={value ? value.toLocaleString() : ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            onChange(Number(raw) || 0);
          }}
          placeholder="0"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[30px] leading-none font-black tracking-tight text-gray-950 outline-none placeholder:text-gray-300"
        />
        <span className="mb-0.5 shrink-0 text-[15px] font-black text-gray-500">원</span>
      </div>
      {reason && (
        <p className="mt-2 text-xs leading-snug font-bold text-blue-500">"{reason}"</p>
      )}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map((button) => (
          <button
            key={button.l}
            type="button"
            onClick={() => onChange(Math.max(0, value + button.d))}
            className="h-9 min-w-0 rounded-xl border border-blue-200 bg-white text-xs font-black text-blue-700 transition-all active:scale-[0.98]"
          >
            {button.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountReviewCard({ account, ai = false, suggestedAccounts = [], onChange, onCopy }: { account: string; ai?: boolean; suggestedAccounts?: any[]; onChange: (account: string) => void; onCopy: (account: string) => Promise<void> }) {
  const accounts: { account: string; label: string }[] = suggestedAccounts
    .map((item: any) => typeof item === 'string' ? { account: item, label: item } : { account: item.account, label: item.label || item.account })
    .filter((item: any) => item.account);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3">
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
          className="min-w-0 flex-1 bg-transparent text-[13px] font-black text-gray-950 outline-none placeholder:text-gray-300"
        />
        {account.trim() && (
          <button
            type="button"
            onClick={() => onCopy(account)}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-black text-gray-700 transition-all active:scale-95"
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
                className={`rounded-xl border px-3 py-2 text-xs font-black transition-all active:scale-95 ${
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

function Field({ label, value, onChange, type = 'text', options = [], ai = false, contacts = [], placeholder = '', suggestedNames = [], tone, fitToWidth = false, minFitFontSize = 12, maxFitFontSize = 14 }: any) {
  const [show, setShow] = useState(false);
  // Local state + DOM ref to prevent Korean IME composition leaking across fields
  const [localValue, setLocalValue] = useState(value ?? '');
  const [fitFontSize, setFitFontSize] = useState<number | null>(null);
  const [fitRows, setFitRows] = useState(1);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync from parent (AI suggestions, chip clicks, etc.) — skip during composition
  React.useEffect(() => {
    if (!composingRef.current) {
      setLocalValue(value ?? '');
    }
  }, [value]);

  const handleFocus = useCallback((extra?: () => void) => () => {
    extra?.();
    const clean = value ?? '';
    setLocalValue(clean);
    // Force DOM cleanup after stale IME events settle
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
    if (!composingRef.current) {
      onChange(v);
    }
  }, [onChange]);

  // suggestedNames를 정규화: string | {name, label} 둘 다 지원
  const normalizedSuggestions: { name: string; label: string }[] = suggestedNames
    .map((s: any) => typeof s === 'string' ? { name: s, label: s } : { name: s.name, label: s.label || s.name })
    .filter((s: any) => s.name);
  const contactSuggestions = contacts.filter((c: any) => c.name.toLowerCase().includes((localValue || '').toLowerCase()));
  const isBlue = tone ? tone === 'blue' : ai;
  const fieldClass = isBlue ? 'border-blue-200 bg-blue-50/80' : 'border-gray-200 bg-gray-50';
  const inputClass = 'min-w-0 flex-1 bg-transparent text-sm font-black leading-snug text-gray-950 outline-none placeholder:text-gray-300';
  const shouldAutoFit = fitToWidth && type === 'text';

  React.useLayoutEffect(() => {
    if (!shouldAutoFit) return;
    const element = inputRef.current;
    if (!element || typeof window === 'undefined') return;

    const fit = () => {
      const text = String(element.value || placeholder || '');
      if (!text.trim()) {
        setFitFontSize(null);
        setFitRows(1);
        return;
      }

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
      <div className={`rounded-2xl border px-3.5 py-3 ${fieldClass}`}>
        <div className="flex min-h-6 items-center gap-2.5">
          <label className="w-9 shrink-0 text-[11px] font-black text-gray-500">{label}</label>
      {type === 'select' ? (
            <select value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)} className={`${inputClass} appearance-none`}>
          {options.map((o: string) => <option key={o} value={o}>{eventLabel(o)}</option>)}
        </select>
      ) : type === 'contact' ? (
            <input ref={(node) => { inputRef.current = node; }} type="text" value={localValue} placeholder={placeholder} onFocus={handleFocus(() => setShow(true))} onBlur={() => setTimeout(() => setShow(false), 200)} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={inputClass} />
      ) : type === 'date' ? (
            <input type="date" value={value || ''} placeholder="yyyy-MM-dd" onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} className={`${inputClass} appearance-none`} />
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
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-black transition-all active:scale-95 ${
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
