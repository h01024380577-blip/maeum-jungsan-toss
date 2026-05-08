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
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }} className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] max-h-[90dvh] bg-white rounded-t-[28px] px-4 py-5 sm:p-6 z-[70] shadow-2xl overflow-x-hidden flex flex-col">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 shrink-0" />
              <div className="flex items-center justify-between mb-5 shrink-0">
                <h3 className="text-lg font-black text-gray-900">{initialParsedData ? '분석 결과 확인' : '직접 입력'}</h3>
                <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center">{eventIcon(parsedData.eventType || 'other')}</div>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto pb-2 no-scrollbar">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button onClick={() => setParsedData({...parsedData, type: 'EXPENSE', isIncome: false})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${parsedData.type === 'EXPENSE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>
                    <ArrowUpRight size={12} /><span>보낸 마음 (OUT)</span>
                  </button>
                  <button onClick={() => setParsedData({...parsedData, type: 'INCOME', isIncome: true})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${parsedData.type === 'INCOME' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                    <ArrowDownLeft size={12} /><span>받은 마음 (IN)</span>
                  </button>
                </div>

                <Field label="이름" type="contact" value={parsedData.targetName} ai={!!initialParsedData?.targetName} onChange={(v: string, cid?: string) => setParsedData({...parsedData, targetName: v, contactId: cid})} contacts={contacts} suggestedNames={(parsedData as any).suggestedNames || []} />
                <div className="grid grid-cols-2 gap-2 min-w-0">
                  <Field label="날짜" type="date" value={parsedData.date} ai={!!initialParsedData?.date} onChange={(v: string) => setParsedData({...parsedData, date: v})} />
                  <Field label="종류" type="select" value={parsedData.eventType} ai={!!initialParsedData?.eventType} options={['wedding', 'funeral', 'birthday', 'other']} onChange={(v: string) => setParsedData({...parsedData, eventType: v as EventType})} />
                </div>
                {parsedData.eventType === 'other' && <Field label="행사명" placeholder="돌잔치, 개업식 등" value={parsedData.customEventName} onChange={(v: string) => setParsedData({...parsedData, customEventName: v})} />}
                <Field label="장소" value={parsedData.location} ai={!!initialParsedData?.location} onChange={(v: string) => setParsedData({...parsedData, location: v})} />
                <Field label="관계" value={parsedData.relation} onChange={(v: string) => setParsedData({...parsedData, relation: v})} />

                {/* Amount */}
                <div className={`p-4 rounded-2xl border ${initialParsedData ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex justify-between items-center mb-2">
                    {initialParsedData ? (
                      <>
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{parsedData.recommendationReason}</span>
                        <span className="text-[8px] font-black text-white bg-blue-500 px-2 py-0.5 rounded-full">AI 추천</span>
                      </>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">금액</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <input type="text" inputMode="numeric" value={parsedData.amount ? Number(parsedData.amount).toLocaleString() : ''} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setParsedData({...parsedData, amount: Number(raw) || 0}); }} placeholder="0" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={`flex-1 min-w-0 bg-transparent text-2xl font-black outline-none ${initialParsedData ? 'text-blue-700' : 'text-gray-900'}`} />
                    <span className={`text-base font-bold shrink-0 ${initialParsedData ? 'text-blue-500' : 'text-gray-500'}`}>원</span>
                  </div>
                  <div className="flex space-x-1.5 sm:space-x-2 mt-3">
                    {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map(b => (
                      <button key={b.l} onClick={() => setParsedData({...parsedData, amount: Math.max(0, (parsedData.amount || 0) + b.d)})} className={`flex-1 py-2 bg-white/70 hover:bg-white rounded-lg text-[10px] font-bold transition-colors active:scale-95 min-w-0 border ${initialParsedData ? 'text-blue-600 border-blue-100' : 'text-gray-600 border-gray-200'}`}>{b.l}</button>
                    ))}
                  </div>
                </div>
                {/* 계좌번호 + 복사 버튼 */}
                <div className="space-y-1 relative">
                  <div className="flex items-center justify-between ml-0.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">계좌번호</label>
                    {initialParsedData?.account && <span className="text-[8px] font-bold text-blue-500 flex items-center"><Sparkles size={7} className="mr-0.5" /> AI</span>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="text" value={parsedData.account || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParsedData({...parsedData, account: e.target.value})} className={`flex-1 p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${initialParsedData?.account ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
                    {parsedData.account && parsedData.account.trim() && (
                      <button onClick={async () => {
                        try {
                          await copyToClipboard(parsedData.account || '');
                          toast.success('계좌번호가 복사되었습니다', { duration: 1600, icon: <Copy size={16} /> });
                        } catch { toast.error('복사 실패', { duration: 2500, icon: <AlertCircle size={16} /> }); }
                      }} className="px-3 py-3 bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1 active:scale-95 transition-all shrink-0">
                        <Copy size={12} /><span>복사</span>
                      </button>
                    )}
                  </div>
                  {/* 복수 계좌 선택 칩 */}
                  {(() => {
                    const accts: { account: string; label: string }[] = ((parsedData as any).suggestedAccounts || [])
                      .map((a: any) => typeof a === 'string' ? { account: a, label: a } : { account: a.account, label: a.label || a.account })
                      .filter((a: any) => a.account);
                    if (accts.length <= 1) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {accts.map((a: { account: string; label: string }, i: number) => {
                          const isSelected = a.account === parsedData.account;
                          return (
                            <button key={i} onClick={() => setParsedData({...parsedData, account: a.account})} className={`px-3 py-1.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${isSelected ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}>
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <button onClick={() => handleSave(parsedData)} disabled={!parsedData.targetName?.trim()} className={`w-full py-4 rounded-2xl font-bold text-base mt-4 active:scale-[0.98] transition-all ${!parsedData.targetName?.trim() ? 'bg-gray-100 text-gray-300' : 'bg-blue-500 text-white shadow-lg shadow-blue-200'}`}>
                저장하기
              </button>
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

function Field({ label, value, onChange, type = 'text', options = [], ai = false, contacts = [], placeholder = '', suggestedNames = [] }: any) {
  const [show, setShow] = useState(false);
  // Local state + DOM ref to prevent Korean IME composition leaking across fields
  const [localValue, setLocalValue] = useState(value ?? '');
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    const v = e.currentTarget.value;
    setLocalValue(v);
    onChange(v);
  }, [onChange]);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

  return (
    <div className="space-y-1 relative">
      <div className="flex items-center justify-between ml-0.5">
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
        {ai && <span className="text-[8px] font-bold text-blue-500 flex items-center"><Sparkles size={7} className="mr-0.5" /> AI</span>}
      </div>
      {type === 'select' ? (
        <select value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`}>
          {options.map((o: string) => <option key={o} value={o}>{eventLabel(o)}</option>)}
        </select>
      ) : type === 'contact' ? (
        <div className="relative">
          <input ref={inputRef} type="text" value={localValue} placeholder={placeholder} onFocus={handleFocus(() => setShow(true))} onBlur={() => setTimeout(() => setShow(false), 200)} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
          {/* AI 제안 이름 칩 — 모두 표시, 선택된 항목 하이라이트 */}
          {normalizedSuggestions.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {normalizedSuggestions.map((s: { name: string; label: string }, i: number) => {
                const isSelected = s.name === value;
                return (
                  <button key={i} onClick={() => onChange(s.name)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${isSelected ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          {show && contactSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
              {contactSuggestions.map((c: any) => (
                <button key={c.id} onClick={() => onChange(c.name, c.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 font-medium">{c.name} <span className="text-[10px] text-gray-400 ml-1">{c.relation}</span></button>
              ))}
            </div>
          )}
        </div>
      ) : type === 'date' ? (
        <input type="date" value={value || ''} placeholder="yyyy-MM-dd" onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 appearance-none min-w-0 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
      ) : (
        <input ref={inputRef} type={type} value={localValue} placeholder={placeholder} onFocus={handleFocus()} onChange={handleInputChange} onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className={`w-full p-3 rounded-xl text-sm font-bold outline-none border border-gray-100 ${ai ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-900'}`} />
      )}
    </div>
  );
}
