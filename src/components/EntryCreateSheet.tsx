import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useStore, type EventType, type TransactionType } from '../store/useStore';
import { formatManInputValue, parseManInputToWon } from '../utils/amountFormat';
import { RELATION_PRESETS } from '../utils/relationPresets';
import { useBackHandler } from '../hooks/useBackHandler';

type EntryCreateSheetProps = {
  open: boolean;
  /** 시트를 열 때 미리 채울 날짜 (달력에서 선택한 날짜) */
  initialDate: Date | null;
  onClose: () => void;
};

type Draft = {
  type: TransactionType;
  targetName: string;
  date: string;
  eventType: EventType;
  customEventName: string;
  amount: number;
  location: string;
  relation: string;
  memo: string;
};

const createDraft = (date: Date | null): Draft => ({
  type: 'EXPENSE',
  targetName: '',
  date: format(date ?? new Date(), 'yyyy-MM-dd'),
  eventType: 'wedding',
  customEventName: '',
  amount: 0,
  location: '',
  relation: '',
  memo: '',
});

/** 경조사 달력에서 일정을 직접 추가하는 바텀시트. EntryEditSheet와 같은 모양을 따른다. */
export default function EntryCreateSheet({ open, initialDate, onClose }: EntryCreateSheetProps) {
  const { addEntry } = useStore();
  const [draft, setDraft] = useState<Draft>(() => createDraft(initialDate));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(createDraft(initialDate));
      setIsSaving(false);
    }
  }, [open, initialDate]);

  useBackHandler(open, () => {
    if (!isSaving) onClose();
    return true;
  });

  if (!open) return null;

  const canSave = draft.targetName.trim().length > 0 && !!draft.date && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await addEntry({
        contactId: '',
        eventType: draft.eventType,
        type: draft.type,
        isIncome: draft.type === 'INCOME',
        date: draft.date,
        location: draft.location.trim(),
        targetName: draft.targetName.trim(),
        amount: Number(draft.amount) || 0,
        relation: draft.relation.trim(),
        memo: draft.memo,
        account: '',
        recommendationReason: '',
        customEventName: draft.eventType === 'other' ? draft.customEventName.trim() : '',
      });
      toast.success('일정을 추가했어요', { duration: 1800 });
      onClose();
    } catch (err: any) {
      toast.error(`저장 실패: ${err?.message || '알 수 없는 오류'}`, { duration: 3500 });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100';
  const labelClass = 'text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-0.5';

  return (
    <div className="fixed inset-0 bg-black/40 z-[200] flex items-end justify-center" onClick={() => !isSaving && onClose()}>
      <div className="bg-white rounded-t-3xl w-full max-w-[430px] max-h-[90dvh] flex flex-col p-5 pb-10" onClick={ev => ev.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2 shrink-0" />
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-base font-black text-gray-900">일정 추가</h3>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button type="button" onClick={() => setDraft({ ...draft, type: 'EXPENSE' })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${draft.type === 'EXPENSE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>
              <ArrowUpRight size={12} /><span>보낸 마음</span>
            </button>
            <button type="button" onClick={() => setDraft({ ...draft, type: 'INCOME' })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${draft.type === 'INCOME' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
              <ArrowDownLeft size={12} /><span>받은 마음</span>
            </button>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>이름</label>
            <input type="text" value={draft.targetName} onChange={(e) => setDraft({ ...draft, targetName: e.target.value })} placeholder="누구의 경조사인가요?" autoComplete="off" className={`${inputClass} placeholder:text-gray-300`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className={labelClass}>날짜</label>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={`${inputClass} appearance-none min-w-0`} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>종류</label>
              <select value={draft.eventType} onChange={(e) => setDraft({ ...draft, eventType: e.target.value as EventType })} className={inputClass}>
                <option value="wedding">결혼</option><option value="funeral">부고</option><option value="birthday">생일</option><option value="other">기타</option>
              </select>
            </div>
          </div>

          {draft.eventType === 'other' && (
            <div className="space-y-1">
              <label className={labelClass}>행사명</label>
              <input type="text" value={draft.customEventName} onChange={(e) => setDraft({ ...draft, customEventName: e.target.value })} placeholder="돌잔치, 개업식 등" className={`${inputClass} placeholder:text-gray-300`} />
            </div>
          )}

          <div className="space-y-1">
            <label className={labelClass}>금액</label>
            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <input type="text" inputMode="decimal" value={formatManInputValue(draft.amount)} onChange={(e) => setDraft({ ...draft, amount: parseManInputToWon(e.target.value) })} placeholder="0" className="min-w-0 flex-1 bg-transparent text-right text-lg font-black text-gray-900 outline-none placeholder:text-gray-300" />
              <span className="text-sm font-bold text-gray-400">만</span>
            </div>
            <div className="flex space-x-1.5 mt-1">
              {[{ l: '-1만', d: -10000 }, { l: '+1만', d: 10000 }, { l: '+5만', d: 50000 }, { l: '+10만', d: 100000 }].map(b => (
                <button key={b.l} type="button" onClick={() => setDraft({ ...draft, amount: Math.max(0, (draft.amount || 0) + b.d) })} className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-gray-600 transition-colors active:scale-95">{b.l}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>장소</label>
            <input type="text" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>관계</label>
            <input type="text" value={draft.relation} onChange={(e) => setDraft({ ...draft, relation: e.target.value })} className={inputClass} />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {RELATION_PRESETS.map((relation) => (
                <button
                  key={relation}
                  type="button"
                  onClick={() => setDraft({ ...draft, relation })}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all active:scale-95 ${draft.relation === relation ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
                >
                  {relation}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>메모</label>
            <textarea
              value={draft.memo}
              onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
              rows={3}
              placeholder="기억해둘 내용을 적어두세요"
              className="w-full resize-none p-3 bg-gray-50 rounded-xl text-sm font-bold outline-none border border-gray-100 placeholder:text-gray-300 leading-relaxed"
            />
          </div>
        </div>

        <div className="flex space-x-2 pt-3 shrink-0">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-5 py-3.5 bg-gray-100 text-gray-600 rounded-2xl text-sm font-bold active:scale-[0.98] transition-all">
            취소
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave} className="flex-1 py-3.5 bg-blue-500 text-white rounded-2xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-blue-200">
            {isSaving ? '저장 중...' : '추가하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
