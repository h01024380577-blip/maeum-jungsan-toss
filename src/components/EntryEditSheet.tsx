import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useStore, type EventEntry, type EventType } from '../store/useStore';
import { formatManInputValue, parseManInputToWon } from '../utils/amountFormat';

type EntryEditSheetProps = {
  entry: EventEntry | null;
  onClose: () => void;
};

export default function EntryEditSheet({ entry, onClose }: EntryEditSheetProps) {
  const { removeEntry, updateEntry } = useStore();
  const [draft, setDraft] = useState<EventEntry | null>(entry ? { ...entry } : null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(entry ? { ...entry } : null);
    setDeleteTarget(null);
    setIsDeleting(false);
    setIsSaving(false);
  }, [entry]);

  if (!entry || !draft) return null;

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeEntry(deleteTarget.id);
      setDeleteTarget(null);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSave = async () => {
    setIsSaving(true);
    try {
      await updateEntry(draft.id, {
        type: draft.type,
        isIncome: draft.type === 'INCOME',
        amount: Number(draft.amount) || 0,
        date: draft.date,
        eventType: draft.eventType,
        location: draft.location,
        relation: draft.relation,
        memo: draft.memo,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center" onClick={() => !isSaving && onClose()}>
        <div className="bg-white rounded-t-3xl w-full max-w-[430px] max-h-[90dvh] flex flex-col p-5 pb-10" onClick={ev => ev.stopPropagation()}>
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2 shrink-0" />
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h3 className="text-base font-black text-gray-900">내역 수정</h3>
            <span className="text-xs text-gray-400">{draft.targetName}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setDraft({...draft, type: 'EXPENSE', isIncome: false})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${draft.type === 'EXPENSE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>
                <ArrowUpRight size={12} /><span>보낸 마음 (OUT)</span>
              </button>
              <button onClick={() => setDraft({...draft, type: 'INCOME', isIncome: true})} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${draft.type === 'INCOME' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                <ArrowDownLeft size={12} /><span>받은 마음 (IN)</span>
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">금액</label>
              <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input type="text" inputMode="decimal" value={formatManInputValue(draft.amount)} onChange={(e) => setDraft({...draft, amount: parseManInputToWon(e.target.value)})} className="min-w-0 flex-1 bg-transparent text-right text-lg font-black text-gray-900 outline-none" />
                <span className="text-sm font-bold text-gray-400">만</span>
              </div>
              <div className="flex space-x-1.5 mt-1">
                {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map(b => (
                  <button key={b.l} onClick={() => setDraft({...draft, amount: Math.max(0, (draft.amount || 0) + b.d)})} className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-gray-600 transition-colors active:scale-95">{b.l}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">날짜</label>
                <input type="date" value={draft.date || ''} onChange={(e) => setDraft({...draft, date: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100 appearance-none min-w-0" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">종류</label>
                <select value={draft.eventType} onChange={(e) => setDraft({...draft, eventType: e.target.value as EventType})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100">
                  <option value="wedding">결혼</option><option value="funeral">부고</option><option value="birthday">생일</option><option value="other">기타</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">장소</label>
              <input type="text" value={draft.location || ''} onChange={(e) => setDraft({...draft, location: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">관계</label>
              <input type="text" value={draft.relation || ''} onChange={(e) => setDraft({...draft, relation: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5">메모</label>
              <textarea
                value={draft.memo || ''}
                onChange={(e) => setDraft({...draft, memo: e.target.value})}
                rows={3}
                placeholder="기억해둘 내용을 적어두세요"
                className="w-full resize-none p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100 placeholder:text-gray-300 leading-relaxed"
              />
            </div>
          </div>

          <div className="flex space-x-2 pt-3 shrink-0">
            <button onClick={() => setDeleteTarget({ id: draft.id, name: draft.targetName })} className="px-4 py-3.5 bg-red-50 text-red-500 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all">
              삭제
            </button>
            <button onClick={handleEditSave} disabled={isSaving} className="flex-1 py-3.5 bg-blue-500 text-white rounded-2xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-blue-200">
              {isSaving ? '저장 중...' : '수정 완료'}
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-[220] flex items-end justify-center" onClick={() => !isDeleting && setDeleteTarget(null)}>
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
    </>
  );
}
