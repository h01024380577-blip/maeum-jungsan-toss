import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, ArrowRight, User, CheckCircle, AlertCircle, Star, Check, X, ArrowUp } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import ContactDetail from '../components/ContactDetail';

type FetchedContact = { name: string; phone: string; relation: string };
const makeKey = (c: FetchedContact, i: number) => `${i}|${c.name}|${c.phone}`;

export default function ContactsTab() {
  const { contacts, entries, syncContacts, updateContact } = useStore();
  const [search, setSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'recent'>('name');
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const getBalance = (id: string) => {
    const ce = entries.filter(e => e.contactId === id);
    return ce.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0) - ce.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  };

  const getRecent = (id: string) => {
    const ce = entries.filter(e => e.contactId === id);
    return ce.length === 0 ? 0 : Math.max(...ce.map(e => new Date(e.date).getTime()));
  };

  const getCount = (id: string) => entries.filter(e => e.contactId === id).length;

  const filtered = contacts
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // 즐겨찾기 항상 우선
      const favDiff = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
      if (favDiff !== 0) return favDiff;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'balance') return getBalance(b.id) - getBalance(a.id);
      return getRecent(b.id) - getRecent(a.id);
    });

  const toggleFavorite = (id: string, current: boolean) => {
    updateContact(id, { isFavorite: !current });
  };

  useEffect(() => {
    const scrollParent = rootRef.current?.closest('main') as HTMLElement | null;
    if (!scrollParent) return;

    scrollParentRef.current = scrollParent;
    const handleScroll = () => {
      setShowScrollTop(scrollParent.scrollTop > 360);
    };

    handleScroll();
    scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    scrollParentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<'fetching' | 'uploading' | null>(null);
  const [fetchedCount, setFetchedCount] = useState(0);

  const [showConfirm, setShowConfirm] = useState(false);
  const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; message: string; count?: number; skipped?: number } | null>(null);

  // 선택 단계 상태
  const [fetchedContacts, setFetchedContacts] = useState<FetchedContact[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showSelection, setShowSelection] = useState(false);
  const [selectionSearch, setSelectionSearch] = useState('');

  const filteredFetched = useMemo(() => {
    const s = selectionSearch.toLowerCase().trim();
    return fetchedContacts
      .map((c, i) => ({ c, key: makeKey(c, i) }))
      .filter(({ c }) => !s || c.name.toLowerCase().includes(s) || c.phone.includes(s));
  }, [fetchedContacts, selectionSearch]);

  const allFilteredSelected = filteredFetched.length > 0 && filteredFetched.every(({ key }) => selectedKeys.has(key));

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredFetched.forEach(({ key }) => next.delete(key));
      } else {
        filteredFetched.forEach(({ key }) => next.add(key));
      }
      return next;
    });
  };

  const closeSelection = () => {
    setShowSelection(false);
    setFetchedContacts([]);
    setSelectedKeys(new Set());
    setSelectionSearch('');
  };

  const handleFetch = async () => {
    setIsSyncing(true);
    setSyncPhase('fetching');
    setFetchedCount(0);
    try {
      const { fetchContacts } = await import('@apps-in-toss/web-framework');

      // 권한 확인
      const permission = await fetchContacts.getPermission() as string;
      if (permission === 'denied' || permission === 'osPermissionDenied') {
        const result = await fetchContacts.openPermissionDialog();
        if (result === 'denied') {
          alert('연락처 접근 권한이 필요합니다. 설정에서 허용해 주세요.');
          return;
        }
      } else if (permission === 'notDetermined') {
        const result = await fetchContacts.openPermissionDialog();
        if (result === 'denied') {
          alert('연락처 접근 권한이 필요합니다.');
          return;
        }
      }

      // 연락처 전체 가져오기 (페이지네이션)
      const allContacts: FetchedContact[] = [];
      let offset = 0;
      const size = 50;

      while (true) {
        const res = await fetchContacts({ size, offset });
        const items = res.result ?? [];
        for (const item of items) {
          if (item.name) {
            allContacts.push({
              name: item.name,
              phone: (item as any).phoneNumbers?.[0] ?? '',
              relation: '지인',
            });
          }
        }
        setFetchedCount(allContacts.length);
        if (res.done || res.nextOffset == null) break;
        offset = res.nextOffset;
      }

      if (allContacts.length === 0) {
        setSyncResult({ type: 'error', message: '가져올 연락처가 없습니다' });
        return;
      }

      // 선택 단계로 전환 — 기본 모두 선택
      setFetchedContacts(allContacts);
      setSelectedKeys(new Set(allContacts.map((c, i) => makeKey(c, i))));
      setSelectionSearch('');
      setShowSelection(true);
    } catch (err: any) {
      console.error('연락처 불러오기 실패:', err);
      if (err?.name === 'FetchContactsPermissionError') {
        setSyncResult({ type: 'error', message: '연락처 접근 권한이 필요합니다\n설정에서 허용해 주세요' });
      } else {
        setSyncResult({ type: 'error', message: '연락처를 불러오지 못했습니다' });
      }
    } finally {
      setIsSyncing(false);
      setSyncPhase(null);
    }
  };

  const handleConfirmSelection = async () => {
    const selected = fetchedContacts
      .map((c, i) => ({ c, key: makeKey(c, i) }))
      .filter(({ key }) => selectedKeys.has(key))
      .map(({ c }) => c);

    if (selected.length === 0) return;

    setShowSelection(false);
    setIsSyncing(true);
    setSyncPhase('uploading');
    try {
      const { inserted, skipped } = await syncContacts(selected);
      const message =
        inserted === 0
          ? '이미 모두 등록된 연락처입니다'
          : skipped > 0
          ? `${inserted}명 추가됨 (${skipped}명은 이미 있음)`
          : '연락처를 불러왔습니다';
      setSyncResult({ type: 'success', message, count: inserted, skipped });
    } catch (err) {
      console.error('연락처 저장 실패:', err);
      setSyncResult({ type: 'error', message: '연락처를 저장하지 못했습니다' });
    } finally {
      setIsSyncing(false);
      setSyncPhase(null);
      setFetchedContacts([]);
      setSelectedKeys(new Set());
      setSelectionSearch('');
    }
  };

  if (selectedContactId) {
    return (
      <div className="px-5 pt-14 pb-4">
        <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="pb-4">
      <div className="px-5 pt-14 pb-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-black text-gray-900 tracking-tight">연락처 관리</h1>
            <p className="text-xs text-gray-400 mt-0.5">{contacts.length}명의 연락처</p>
          </div>
          <button onClick={() => setShowConfirm(true)} disabled={isSyncing} className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center hover:bg-blue-100 transition-colors active:scale-95 disabled:opacity-50">
            {isSyncing ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <UserPlus size={18} />}
          </button>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
          <input type="text" placeholder="이름으로 검색..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-blue-100 outline-none text-sm placeholder:text-gray-300" />
        </div>

        <div className="flex space-x-2">
          {([['name', '이름순'], ['recent', '최근순'], ['balance', '마음순']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${sortBy === key ? 'bg-blue-500 text-white' : 'bg-white text-gray-400 border border-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.map((c) => {
            const bal = getBalance(c.id);
            const cnt = getCount(c.id);
            return (
              <motion.div layout key={c.id} onClick={() => setSelectedContactId(c.id)}
                className={`bg-white p-4 rounded-2xl border flex items-center justify-between hover:shadow-md transition-all cursor-pointer group active:scale-[0.98] ${c.isFavorite ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}
              >
                <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(c.id, !!c.isFavorite); }}
                    className="shrink-0 p-1 -ml-2 mr-1 rounded-lg active:scale-90 transition-all"
                    aria-label={c.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                  >
                    <Star
                      size={18}
                      className={c.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-gray-200 hover:text-amber-300'}
                    />
                  </button>
                  <div className="w-11 h-11 shrink-0 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                    <User size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{c.name}</h3>
                    <p className="text-[10px] text-gray-400 font-medium">{c.relation} · {cnt}건</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-black flex items-center justify-end ${bal === 0 ? 'text-gray-400' : bal > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                      {bal >= 0 ? '+' : ''}{bal.toLocaleString()}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-gray-200 group-hover:text-blue-500 transition-colors" />
                </div>
              </motion.div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mx-auto text-gray-300 mb-3"><User size={28} /></div>
              <p className="text-sm text-gray-300 font-medium">연락처가 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 연락처 연동 확인 모달 */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setShowConfirm(false)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-xl"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <UserPlus size={22} className="text-blue-500" />
            </div>
            <h3 className="text-base font-black text-gray-900 text-center">전화번호부 연동</h3>
            <p className="text-xs text-gray-400 text-center mt-2 leading-relaxed">
              기기의 전화번호부에서 연락처를<br/>불러옵니다. 계속하시겠습니까?
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-400 bg-gray-100 active:scale-95 transition-all"
              >
                취소
              </button>
              <button
                onClick={() => { setShowConfirm(false); handleFetch(); }}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-blue-500 active:scale-95 transition-all"
              >
                연동하기
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 연동 진행 중 오버레이 */}
      <AnimatePresence>
        {isSyncing && syncPhase && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl p-6 w-full max-w-[300px] shadow-xl text-center"
            >
              <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-500 rounded-full animate-spin" />
              </div>
              <p className="text-sm font-bold text-gray-900">
                {syncPhase === 'fetching' ? '전화번호부를 읽는 중' : '서버에 저장하는 중'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {syncPhase === 'fetching'
                  ? fetchedCount > 0
                    ? `${fetchedCount}명 확인됨`
                    : '잠시만 기다려 주세요'
                  : '거의 다 됐어요'}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 가져올 연락처 선택 시트 */}
      <AnimatePresence>
        {showSelection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-white z-[100] flex flex-col"
          >
            <div className="px-5 pt-14 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <button onClick={closeSelection} className="p-1 -ml-1 active:scale-90 transition-transform" aria-label="닫기">
                  <X size={22} className="text-gray-700" />
                </button>
                <h2 className="text-sm font-black text-gray-900">가져올 연락처 선택</h2>
                <div className="w-7" />
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                <input
                  type="text"
                  placeholder="이름 또는 번호 검색..."
                  value={selectionSearch}
                  onChange={(e) => setSelectionSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 rounded-xl outline-none text-sm placeholder:text-gray-300"
                />
              </div>

              <div className="flex items-center justify-between mt-3 px-1">
                <button onClick={toggleSelectAll} className="flex items-center gap-2 active:scale-95 transition-transform">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${allFilteredSelected ? 'bg-blue-500' : 'bg-white border-2 border-gray-200'}`}>
                    {allFilteredSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className="text-xs font-bold text-gray-700">
                    {selectionSearch ? '검색 결과 전체' : '전체 선택'}
                  </span>
                </button>
                <p className="text-xs font-bold text-blue-500">
                  {selectedKeys.size}명 선택됨
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredFetched.length === 0 ? (
                <div className="text-center py-16 text-gray-300 text-sm">검색 결과가 없습니다</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredFetched.map(({ c, key }) => {
                    const checked = selectedKeys.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleKey(key)}
                        className="w-full px-5 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-blue-500' : 'bg-white border-2 border-gray-200'}`}>
                          {checked && <Check size={14} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="w-9 h-9 shrink-0 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                          <User size={18} />
                        </div>
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-900 truncate">{c.name}</p>
                          {c.phone && <p className="text-[11px] text-gray-400 truncate">{c.phone}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-white">
              <button
                onClick={handleConfirmSelection}
                disabled={selectedKeys.size === 0}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-blue-500 active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400"
              >
                {selectedKeys.size > 0 ? `${selectedKeys.size}명 추가하기` : '연락처를 선택해 주세요'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 연동 결과 모달 */}
      <AnimatePresence>
        {syncResult && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setSyncResult(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-xl text-center"
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${syncResult.type === 'success' ? 'bg-blue-50' : 'bg-red-50'}`}>
                {syncResult.type === 'success'
                  ? <CheckCircle size={28} className="text-blue-500" />
                  : <AlertCircle size={28} className="text-red-400" />
                }
              </div>
              {syncResult.type === 'success' && syncResult.count && (
                <p className="text-3xl font-black text-gray-900 mb-1">{syncResult.count}<span className="text-base font-bold text-gray-400">명</span></p>
              )}
              <p className="text-sm font-bold text-gray-700 whitespace-pre-line">{syncResult.message}</p>
              <button
                onClick={() => setSyncResult(null)}
                className={`w-full mt-5 py-3 rounded-xl text-sm font-bold text-white active:scale-95 transition-all ${syncResult.type === 'success' ? 'bg-blue-500' : 'bg-red-400'}`}
              >
                확인
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            type="button"
            onClick={scrollToTop}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-200 active:scale-95 md:right-[calc((100vw-430px)/2+24px)]"
            aria-label="연락처 목록 상단으로 이동"
          >
            <ArrowUp size={20} strokeWidth={2.4} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
