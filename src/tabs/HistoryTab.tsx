import React, { useState } from 'react';
import { useStore, type EventEntry } from '../store/useStore';
import { Search, Trash2, Heart, Flower2, Cake, Star, FileSpreadsheet, Upload, CheckSquare, Square, StickyNote } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import BulkImportModal from '../components/BulkImportModal';
import ContactDetail from '../components/ContactDetail';
import EntryEditSheet from '../components/EntryEditSheet';
import { useBackHandler } from '../hooks/useBackHandler';
import { exportToCsv } from '../utils/csvExport';
import { formatAmountMan } from '../utils/amountFormat';

const eventIcon = (t: string) => {
  if (t === 'wedding') return <Heart size={14} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={14} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={14} className="text-amber-500 fill-amber-500" />;
  return <Star size={14} className="text-blue-500 fill-blue-500" />;
};

const eventLabel = (t: string, custom?: string) => t === 'wedding' ? '결혼' : t === 'funeral' ? '부고' : t === 'birthday' ? '생일' : (custom || '기타');

const safeDate = (d: string) => {
  try { if (!d) return '–'; const p = parseISO(d); return isNaN(p.getTime()) ? '–' : format(p, 'yy.MM.dd'); } catch { return '–'; }
};

export default function HistoryTab() {
  const { entries, removeEntry, contacts } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'given' | 'received'>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<EventEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    if (entries.length === 0 && contacts.length === 0) {
      toast.error('내보낼 데이터가 없어요');
      return;
    }
    setIsExporting(true);
    try {
      const { filename, rowCount, via } = await exportToCsv({ entries });
      if (via === 'ait-openurl') {
        toast.success(`${filename} (${rowCount}행)`, {
          description: '브라우저가 열리면 다운로드 받기를 눌러주세요. 1시간 내 유효',
          duration: 3500,
        });
      } else {
        toast.success(`${filename} 다운로드 시작 (${rowCount}행)`);
      }
    } catch (err) {
      console.error('[export] failed:', err);
      toast.error('내보내기에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    await removeEntry(deleteTarget.id);
    setIsDeleting(false);
    setDeleteTarget(null);
  };

  const handleImportClick = () => setImportOpen(true);

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      clearSelection();
      return;
    }
    setSelectionMode(true);
  };

  const toggleEntrySelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = entries.filter(e => {
    const s = search.toLowerCase().trim();
    const eventLabelText = eventLabel(e.eventType, e.customEventName);
    // 부고는 '장례'로도 검색되도록 동의어 처리
    const eventAliases =
      e.eventType === 'funeral' ? `${eventLabelText} 장례` : eventLabelText;
    const haystack = [
      e.targetName,
      e.location,
      e.relation,
      eventAliases,
      e.eventType,
      e.customEventName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchSearch = !s || haystack.includes(s);
    const matchFilter = filter === 'all' || (filter === 'given' ? e.type === 'EXPENSE' : e.type === 'INCOME');
    return matchSearch && matchFilter;
  });
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));

  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(e => next.delete(e.id));
      else filtered.forEach(e => next.add(e.id));
      return next;
    });
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsDeleting(true);
    try {
      await Promise.all(ids.map(id => removeEntry(id)));
      toast.success(`${ids.length}건을 삭제했어요`);
      setBulkDeleteOpen(false);
      clearSelection();
    } catch {
      toast.error('삭제에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsDeleting(false);
    }
  };

  useBackHandler(!!deleteTarget || bulkDeleteOpen || selectionMode, () => {
    if (deleteTarget) {
      if (!isDeleting) setDeleteTarget(null);
      return true;
    }

    if (bulkDeleteOpen) {
      if (!isDeleting) setBulkDeleteOpen(false);
      return true;
    }

    if (selectionMode) {
      clearSelection();
      return true;
    }

    return false;
  });

  return (
    <div className="pb-4">
      <div className="px-5 pt-14 pb-4 bg-white max-[360px]:px-4">
        <div className="flex items-center justify-between gap-2 max-[360px]:gap-1.5">
          <div className="min-w-0">
            <h1 className="whitespace-nowrap text-[22px] font-black text-gray-900 tracking-tight max-[360px]:text-[20px]">전체 내역</h1>
            <p className="mt-0.5 truncate whitespace-nowrap text-xs text-gray-400 max-[360px]:text-[11px]">{entries.length}건의 기록</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 max-[420px]:gap-1">
            <button
              type="button"
              onClick={toggleSelectionMode}
              disabled={entries.length === 0 || isDeleting}
              aria-label={selectionMode ? '선택 취소' : '내역 선택'}
              className={`inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2.5 text-[11px] font-bold whitespace-nowrap break-keep transition-colors active:scale-95 disabled:opacity-50 max-[420px]:h-9 max-[420px]:w-9 max-[420px]:px-0 ${
                selectionMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {selectionMode ? <CheckSquare size={14} /> : <Square size={14} />}
              <span className="whitespace-nowrap break-keep leading-none max-[420px]:sr-only">{selectionMode ? '취소' : '선택'}</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || selectionMode}
              aria-label={isExporting ? '내보내는 중' : '내보내기'}
              className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-gray-100 px-2.5 text-[11px] font-bold whitespace-nowrap break-keep text-gray-700 transition-colors hover:bg-gray-200 active:scale-95 disabled:opacity-60 max-[420px]:h-9 max-[420px]:px-2 max-[420px]:text-[10px]"
            >
              <Upload size={14} />
              <span className="whitespace-nowrap break-keep leading-none">{isExporting ? '내보내는 중' : '내보내기'}</span>
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              disabled={selectionMode}
              aria-label="가져오기"
              className="inline-flex h-10 items-center justify-center gap-1 rounded-xl px-2.5 text-[11px] font-bold whitespace-nowrap break-keep transition-all active:scale-95 disabled:opacity-50 max-[420px]:h-9 max-[420px]:px-2 max-[420px]:text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100"
            >
              <FileSpreadsheet size={14} />
              <span className="whitespace-nowrap break-keep leading-none">가져오기</span>
            </button>
          </div>
        </div>
      </div>

      <BulkImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />

      <div className="px-5 pt-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
          <input type="text" placeholder="이름, 결혼·부고·생일, 장소, 관계 검색..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white rounded-2xl border border-gray-100 shadow-sm focus:ring-2 focus:ring-blue-100 outline-none text-sm placeholder:text-gray-300" />
        </div>

        {/* Filter */}
        <div className="flex space-x-2">
          {([['all', '전체'], ['given', '보낸 마음'], ['received', '받은 마음']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${filter === key ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-gray-400 border border-gray-100'}`}>
              {label}
            </button>
          ))}
        </div>

        {selectionMode && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-bold text-gray-600 active:scale-95 transition-all"
            >
              {allFilteredSelected ? <CheckSquare size={16} className="text-blue-500" /> : <Square size={16} className="text-gray-300" />}
              <span>{allFilteredSelected ? '전체 해제' : '전체 선택'}</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-blue-600">{selectedIds.size}건 선택</span>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={selectedIds.size === 0 || isDeleting}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-red-500 px-3 text-xs font-black text-white active:scale-95 transition-all disabled:bg-gray-200 disabled:text-gray-400"
              >
                <Trash2 size={14} />
                <span>삭제</span>
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="space-y-2">
          {filtered.length > 0 ? filtered.map(e => (
            <div
              key={e.id}
              onClick={() => selectionMode ? toggleEntrySelection(e.id) : setEditTarget({ ...e })}
              className={`grid items-center gap-3 bg-white p-4 rounded-2xl border group relative overflow-hidden cursor-pointer active:scale-[0.98] transition-all max-[360px]:gap-2 max-[360px]:p-3.5 ${
                selectionMode ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-[auto_minmax(0,1fr)_auto_auto]'
              } ${
                selectedIds.has(e.id) ? 'border-blue-300 ring-2 ring-blue-50' : 'border-gray-100'
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full ${e.type === 'INCOME' ? 'bg-blue-500' : 'bg-red-400'}`} />
              <div className={`ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl max-[360px]:ml-1 ${
                selectionMode ? 'bg-gray-50' : e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'
              }`}>
                {selectionMode
                  ? selectedIds.has(e.id)
                    ? <CheckSquare size={18} className="text-blue-500" />
                    : <Square size={18} className="text-gray-300" />
                  : eventIcon(e.eventType)
                }
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${e.type === 'INCOME' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                    {e.type === 'INCOME' ? 'IN' : 'OUT'}
                  </span>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (selectionMode) {
                        toggleEntrySelection(e.id);
                        return;
                      }
                      const c = contacts.find(c => c.id === e.contactId || c.name === e.targetName);
                      if (c) setSelectedContactId(c.id);
                    }}
                    className="min-w-0 truncate text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                  >{e.targetName}</button>
                  {e.memo?.trim() && (
                    <span aria-label="메모 있음" title="메모 있음" className="inline-flex shrink-0 text-blue-400">
                      <StickyNote size={11} />
                    </span>
                  )}
                  {selectionMode && (
                    <span className={`ml-auto shrink-0 whitespace-nowrap text-[13px] font-black leading-none max-[360px]:text-[12px] ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                      {e.type === 'INCOME' ? '+' : '-'}{formatAmountMan(e.amount)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[10px] font-medium text-gray-400">
                  {safeDate(e.date)} · {eventLabel(e.eventType, e.customEventName)} {e.location ? `· ${e.location}` : ''}
                </p>
              </div>
              {!selectionMode && (
                <>
                  <div className="w-[58px] text-right max-[360px]:w-[52px]">
                    <p className={`whitespace-nowrap text-[13px] font-black leading-tight max-[360px]:text-[12px] ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                      {e.type === 'INCOME' ? '+' : '-'}{formatAmountMan(e.amount)}
                    </p>
                    <p className="mt-0.5 truncate text-[9px] font-medium leading-tight text-gray-300">{e.relation}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); setDeleteTarget({ id: e.id, name: e.targetName }); }}
                    className="shrink-0 p-1.5 text-gray-300 active:text-red-500 transition-colors"
                    aria-label="내역 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          )) : (
            <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center">
              <p className="text-sm text-gray-300">검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center" onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
            <div className="text-center space-y-1">
              <p className="text-base font-bold text-gray-900">내역을 삭제할까요?</p>
              <p className="text-sm text-gray-400"><span className="text-gray-700 font-semibold">{deleteTarget.name}</span> 내역이 영구적으로 삭제됩니다.</p>
            </div>
            <div className="flex space-x-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all">
                취소
              </button>
              <button onClick={handleDeleteConfirm} disabled={isDeleting} className="flex-1 py-3.5 bg-red-500 text-white rounded-2xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60">
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center" onClick={() => !isDeleting && setBulkDeleteOpen(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
            <div className="text-center space-y-1">
              <p className="text-base font-bold text-gray-900">선택한 내역을 삭제할까요?</p>
              <p className="text-sm text-gray-400"><span className="text-gray-700 font-semibold">{selectedIds.size}건</span>의 내역이 영구적으로 삭제됩니다.</p>
            </div>
            <div className="flex space-x-2 pt-1">
              <button onClick={() => setBulkDeleteOpen(false)} disabled={isDeleting} className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all">
                취소
              </button>
              <button onClick={handleBulkDeleteConfirm} disabled={isDeleting || selectedIds.size === 0} className="flex-1 py-3.5 bg-red-500 text-white rounded-2xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60">
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      <EntryEditSheet entry={editTarget} onClose={() => setEditTarget(null)} />

      {selectedContactId && (
        <div className="fixed inset-0 bg-white z-[100] overflow-y-auto">
          <div className="max-w-[430px] mx-auto p-5">
            <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
          </div>
        </div>
      )}

    </div>
  );
}
