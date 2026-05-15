import React, { useState } from 'react';
import { ArrowLeft, User, Heart, Flower2, Cake, Star, ArrowUpRight, ArrowDownLeft, Calendar, MapPin, Trash2, Pencil, Check, StickyNote } from 'lucide-react';
import { useStore, type EventEntry, type EventType } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import EntryEditSheet from './EntryEditSheet';
import { formatAmountMan, formatSignedAmountMan } from '../utils/amountFormat';
import { useBackHandler } from '../hooks/useBackHandler';

const RELATION_PRESETS = ['가족', '친척', '친구', '동료', '지인', '기타'] as const;

const eventIcon = (t: EventType, size = 14) => {
  if (t === 'wedding') return <Heart size={size} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={size} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={size} className="text-amber-500 fill-amber-500" />;
  return <Star size={size} className="text-blue-500 fill-blue-500" />;
};

const eventLabel = (t: string, custom?: string) => t === 'wedding' ? '결혼' : t === 'funeral' ? '부고' : t === 'birthday' ? '생일' : (custom || '기타');

const safeDate = (d: string) => {
  try { const p = parseISO(d); return isNaN(p.getTime()) ? '–' : format(p, 'yyyy. MM. dd'); } catch { return '–'; }
};

export default function ContactDetail({ contactId, onBack }: { contactId: string; onBack: () => void }) {
  const { contacts, entries, removeContact, updateContact } = useStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRelationEdit, setShowRelationEdit] = useState(false);
  const [relationDraft, setRelationDraft] = useState('');
  const [savingRelation, setSavingRelation] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EventEntry | null>(null);
  const contact = contacts.find(c => c.id === contactId);

  useBackHandler(!!contact, () => {
    if (showDeleteConfirm) {
      setShowDeleteConfirm(false);
      return true;
    }

    if (showRelationEdit) {
      if (!savingRelation) setShowRelationEdit(false);
      return true;
    }

    onBack();
    return true;
  });

  if (!contact) return null;

  const contactName = contact.name.trim();
  const ce = entries.filter(e => e.contactId === contactId || (!!contactName && e.targetName.trim() === contactName));

  const openRelationEdit = () => {
    setRelationDraft(contact.relation || '');
    setShowRelationEdit(true);
  };

  const saveRelation = async () => {
    const next = relationDraft.trim();
    if (!next || next === contact.relation) {
      setShowRelationEdit(false);
      return;
    }
    setSavingRelation(true);
    try {
      await updateContact(contactId, { relation: next });
      setShowRelationEdit(false);
    } finally {
      setSavingRelation(false);
    }
  };

  const given = ce.filter(e => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const received = ce.filter(e => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const balance = received - given;
  const total = given + received || 1;

  return (
    <div className="space-y-5 pb-20">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 transition-colors active:scale-95">
          <ArrowLeft size={18} />
          <span className="text-sm font-bold">뒤로</span>
        </button>
        <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-gray-300 hover:text-red-500 transition-colors active:scale-95">
          <Trash2 size={18} />
        </button>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-[320px] space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h3 className="text-base font-black text-gray-900">연락처 삭제</h3>
              <p className="text-sm text-gray-400">
                <span className="font-bold text-gray-700">{contact.name}</span>님을 삭제하시겠습니까?<br/>
                관련 경조사 내역은 유지됩니다.
              </p>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all">
                취소
              </button>
              <button onClick={async () => {
                await removeContact(contactId);
                setShowDeleteConfirm(false);
                onBack();
              }} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm active:scale-95 transition-all">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile */}
      <div className="bg-white p-7 rounded-[28px] shadow-sm border border-gray-100 flex flex-col items-center space-y-3">
        <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
          <User size={40} />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-gray-900">{contact.name}</h2>
          <button
            onClick={openRelationEdit}
            className="mt-1 inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all"
            aria-label="관계 수정"
          >
            <span className="text-xs font-bold text-blue-500">{contact.relation || '관계 설정'}</span>
            <Pencil size={10} className="text-blue-400" />
          </button>
        </div>
      </div>

      {/* 관계 편집 모달 */}
      <AnimatePresence>
        {showRelationEdit && (
          <div className="fixed inset-0 bg-black/40 z-[100] flex items-end sm:items-center justify-center px-4" onClick={() => !savingRelation && setShowRelationEdit(false)}>
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 w-full max-w-[360px] space-y-4 shadow-xl"
            >
              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-2">
                  <Pencil size={20} className="text-blue-500" />
                </div>
                <h3 className="text-base font-black text-gray-900">관계 수정</h3>
                <p className="text-xs text-gray-400">
                  <span className="font-bold text-gray-600">{contact.name}</span>님과의 관계를 선택하거나 직접 입력하세요
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {RELATION_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => setRelationDraft(preset)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${relationDraft === preset ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={relationDraft}
                onChange={(e) => setRelationDraft(e.target.value)}
                placeholder="직접 입력 (예: 사촌, 선배)"
                className="w-full px-4 py-3 bg-gray-50 rounded-xl text-sm font-medium outline-none border border-gray-100 focus:border-blue-300 focus:bg-white transition-all placeholder:text-gray-300"
                maxLength={20}
              />

              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => setShowRelationEdit(false)}
                  disabled={savingRelation}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={saveRelation}
                  disabled={savingRelation || !relationDraft.trim()}
                  className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
                >
                  {savingRelation ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check size={14} />
                      <span>저장</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Balance */}
      <div className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-100 space-y-5">
        <div className="text-center space-y-1.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{contact.name}님과의 마음 정산</p>
          <motion.h2 key={balance} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`text-4xl font-black tracking-tight ${balance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
            {formatSignedAmountMan(balance)}
          </motion.h2>
          <span className={`inline-block px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${balance >= 0 ? 'bg-blue-50 text-blue-500' : 'bg-red-50 text-red-500'}`}>
            {balance >= 0 ? 'Surplus' : 'Deficit'}
          </span>
        </div>

        {/* Bar */}
        <div className="space-y-3">
          <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(given / total) * 100}%` }} transition={{ duration: 0.6 }} className="h-full bg-red-400 rounded-l-full" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${(received / total) * 100}%` }} transition={{ duration: 0.6, delay: 0.1 }} className="h-full bg-blue-500 rounded-r-full" />
          </div>
          <div className="flex justify-between">
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase">보낸 마음 (OUT)</p>
              <p className="text-sm font-black text-red-500">{formatAmountMan(given)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold text-gray-400 uppercase">받은 마음 (IN)</p>
              <p className="text-sm font-black text-blue-600">{formatAmountMan(received)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">경조사 내역 ({ce.length})</h3>
        {ce.length > 0 ? ce.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSelectedEntry(entry)}
            className="flex w-full items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left transition-all active:scale-[0.98] active:bg-gray-50 max-[360px]:p-3.5"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entry.type === 'EXPENSE' ? 'bg-red-50' : 'bg-blue-50'}`}>
              {entry.type === 'EXPENSE' ? <ArrowUpRight size={16} className="text-red-500" /> : <ArrowDownLeft size={16} className="text-blue-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {eventIcon(entry.eventType)}
                <h4 className="min-w-0 truncate text-sm font-bold text-gray-900">{eventLabel(entry.eventType, entry.customEventName)}</h4>
                {entry.memo?.trim() && (
                  <span aria-label="메모 있음" title="메모 있음" className="inline-flex shrink-0 text-blue-400">
                    <StickyNote size={11} />
                  </span>
                )}
              </div>
              <div className="mt-1.5 space-y-1 text-[10px] font-semibold text-gray-400">
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar size={10} className="shrink-0" />
                  <span>{safeDate(entry.date)}</span>
                </div>
                {entry.location && (
                  <div className="flex min-w-0 items-start gap-1">
                    <MapPin size={10} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 truncate">{entry.location}</span>
                  </div>
                )}
              </div>
            </div>
            <p className={`shrink-0 whitespace-nowrap pt-1 text-right text-sm font-black tabular-nums max-[360px]:text-[13px] ${entry.type === 'EXPENSE' ? 'text-red-500' : 'text-blue-600'}`}>
              {entry.type === 'EXPENSE' ? '-' : '+'}{formatAmountMan(entry.amount)}
            </p>
          </button>
        )) : (
          <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-200 text-center">
            <p className="text-sm text-gray-300">내역이 없습니다</p>
          </div>
        )}
      </div>

      <EntryEditSheet entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
