import React, { useState } from 'react';
import { useStore, EventType } from '../store/useStore';
import { Search, Trash2, Heart, Flower2, Cake, Star, FileSpreadsheet, Pencil, ArrowUpRight, ArrowDownLeft, Upload } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import BulkImportModal from '../components/BulkImportModal';
import ContactDetail from '../components/ContactDetail';
import { exportToCsv } from '../utils/csvExport';

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
  const { entries, removeEntry, updateEntry, contacts } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'given' | 'received'>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
          duration: 7000,
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

  const handleEditSave = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      await updateEntry(editTarget.id, {
        type: editTarget.type,
        amount: Number(editTarget.amount) || 0,
        date: editTarget.date,
        eventType: editTarget.eventType,
        location: editTarget.location,
        relation: editTarget.relation,
        memo: editTarget.memo,
      });
      setEditTarget(null);
    } catch {}
    setIsSaving(false);
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

  return (
    <div className="pb-4">
      <div className="px-5 pt-14 pb-4 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-[22px] font-black text-gray-900 tracking-tight">전체 내역</h1>
            <p className="text-xs text-gray-400 mt-0.5">{entries.length}건의 기록</p>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center space-x-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors active:scale-95 disabled:opacity-60"
            >
              <Upload size={14} />
              <span>{isExporting ? '내보내는 중' : '내보내기'}</span>
            </button>
            <button onClick={() => setImportOpen(true)} className="flex items-center space-x-1 bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors active:scale-95">
              <FileSpreadsheet size={14} />
              <span>가져오기</span>
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

        {/* List */}
        <div className="space-y-2">
          {filtered.length > 0 ? filtered.map(e => (
            <div key={e.id} onClick={() => setEditTarget({ ...e })} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group relative overflow-hidden cursor-pointer active:scale-[0.98] transition-all">
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full ${e.type === 'INCOME' ? 'bg-blue-500' : 'bg-red-400'}`} />
              <div className="flex items-center space-x-3 pl-2 min-w-0 flex-1">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'}`}>
                  {eventIcon(e.eventType)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${e.type === 'INCOME' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                      {e.type === 'INCOME' ? 'IN' : 'OUT'}
                    </span>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); const c = contacts.find(c => c.id === e.contactId || c.name === e.targetName); if (c) setSelectedContactId(c.id); }}
                      className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                    >{e.targetName}</button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-medium truncate">
                    {safeDate(e.date)} · {eventLabel(e.eventType, e.customEventName)} {e.location ? `· ${e.location}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <div className="text-right">
                  <p className={`text-sm font-black ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                    {e.type === 'INCOME' ? '+' : '-'}{e.amount.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-gray-300 font-medium">{e.relation}</p>
                </div>
                <div className="flex items-center space-x-1">
                  <Pencil size={13} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
                  <button onClick={(ev) => { ev.stopPropagation(); setDeleteTarget({ id: e.id, name: e.targetName }); }} className="p-1.5 text-gray-300 active:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
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

      {/* 수정 바텀시트 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center" onClick={() => !isSaving && setEditTarget(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[430px] max-h-[90dvh] flex flex-col p-5 pb-10" onClick={ev => ev.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2 shrink-0" />
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-base font-black text-gray-900">내역 수정</h3>
              <span className="text-xs text-gray-400">{editTarget.targetName}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
            {/* 보냄/받음 토글 */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setEditTarget({...editTarget, type: 'EXPENSE', isIncome: false})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${editTarget.type === 'EXPENSE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>
                <ArrowUpRight size={12} /><span>보낸 마음 (OUT)</span>
              </button>
              <button onClick={() => setEditTarget({...editTarget, type: 'INCOME', isIncome: true})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${editTarget.type === 'INCOME' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                <ArrowDownLeft size={12} /><span>받은 마음 (IN)</span>
              </button>
            </div>

            {/* 금액 (콤마 포맷) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">금액</label>
              <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input type="text" inputMode="numeric" value={editTarget.amount ? Number(editTarget.amount).toLocaleString() : ''} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); setEditTarget({...editTarget, amount: Number(raw) || 0}); }} className="flex-1 bg-transparent text-lg font-black text-gray-900 outline-none" />
                <span className="text-sm font-bold text-gray-400">원</span>
              </div>
              <div className="flex space-x-1.5 mt-1">
                {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map(b => (
                  <button key={b.l} onClick={() => setEditTarget({...editTarget, amount: Math.max(0, (editTarget.amount || 0) + b.d)})} className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-gray-600 transition-colors active:scale-95">{b.l}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* 날짜 */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">날짜</label>
                <input type="date" value={editTarget.date || ''} onChange={(e) => setEditTarget({...editTarget, date: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100 appearance-none min-w-0" />
              </div>
              {/* 종류 */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">종류</label>
                <select value={editTarget.eventType} onChange={(e) => setEditTarget({...editTarget, eventType: e.target.value as EventType})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100">
                  <option value="wedding">결혼</option><option value="funeral">부고</option><option value="birthday">생일</option><option value="other">기타</option>
                </select>
              </div>
            </div>

            {/* 장소 */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">장소</label>
              <input type="text" value={editTarget.location || ''} onChange={(e) => setEditTarget({...editTarget, location: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100" />
            </div>

            {/* 관계 */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">관계</label>
              <input type="text" value={editTarget.relation || ''} onChange={(e) => setEditTarget({...editTarget, relation: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100" />
            </div>

            </div>
            {/* 버튼 */}
            <div className="flex space-x-2 pt-3 shrink-0">
              <button onClick={() => setDeleteTarget({ id: editTarget.id, name: editTarget.targetName })} className="px-4 py-3.5 bg-red-50 text-red-500 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all">
                삭제
              </button>
              <button onClick={handleEditSave} disabled={isSaving} className="flex-1 py-3.5 bg-blue-500 text-white rounded-2xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-blue-200">
                {isSaving ? '저장 중...' : '수정 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

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
