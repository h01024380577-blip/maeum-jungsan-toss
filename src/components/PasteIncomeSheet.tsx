import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clipboard, Sparkles, Check, AlertCircle, Trash2, Users, Heart, Flower2, Cake, Star } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/src/lib/apiClient';
import { useStore, type Contact, type EventType, type TransactionSource } from '@/src/store/useStore';
import { formatManInputValue, parseManInputToWon } from '@/src/utils/amountFormat';

const EVENT_OPTIONS: Array<{ value: EventType; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { value: 'wedding', label: '결혼', Icon: Heart },
  { value: 'funeral', label: '부고', Icon: Flower2 },
  { value: 'birthday', label: '생일', Icon: Cake },
  { value: 'other', label: '기타', Icon: Star },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'input' | 'reviewing';
type Confidence = 'high' | 'medium' | 'low';

interface ParsedIncome {
  senderName: string;
  amount: number;
  bank: string | null;
  date: string | null;
  confidence: Confidence;
}

interface EditableRow extends ParsedIncome {
  _key: string;
  _selected: boolean;
  /** 사용자가 명시 선택한 contactId. null=새로 생성, ''=자동 매칭 대기 */
  _contactId: string | null | '';
  _eventType: EventType;
}

function isAppsInToss(): boolean {
  return typeof window !== 'undefined' && window.navigator.userAgent.includes('TossApp');
}

async function readClipboard(): Promise<string> {
  if (isAppsInToss()) {
    const { getClipboardText } = await import('@apps-in-toss/web-framework');
    const currentPermission = await getClipboardText.getPermission().catch(() => null);
    if (currentPermission === 'denied') {
      throw new Error('clipboard_permission_denied');
    }
    if (currentPermission === 'notDetermined') {
      const nextPermission = await getClipboardText.openPermissionDialog().catch(() => null);
      if (nextPermission !== 'allowed') {
        throw new Error('clipboard_permission_denied');
      }
    }
    return await getClipboardText();
  }
  if (!navigator.clipboard || !window.isSecureContext) {
    throw new Error('clipboard_unavailable');
  }
  const permission = await navigator.permissions
    ?.query({ name: 'clipboard-read' as PermissionName })
    .catch(() => null);
  if (permission?.state === 'denied') {
    throw new Error('clipboard_permission_denied');
  }
  return await navigator.clipboard.readText();
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const styles: Record<Confidence, string> = {
    high: 'bg-blue-50 text-blue-600',
    medium: 'bg-gray-100 text-gray-500',
    low: 'bg-amber-50 text-amber-600',
  };
  const labels: Record<Confidence, string> = { high: '확실', medium: '보통', low: '불확실' };
  return (
    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

export default function PasteIncomeSheet({ isOpen, onClose }: Props) {
  const addEntry = useStore((s) => s.addEntry);
  const contacts = useStore((s) => s.contacts);

  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('input');
    setText('');
    setRows([]);
    setError(null);
    setIsParsing(false);
    setIsSaving(false);
  };

  const handleClose = () => {
    if (isSaving || isParsing) return;
    reset();
    onClose();
  };

  const handlePaste = async () => {
    setError(null);
    try {
      const clip = await readClipboard();
      if (!clip || clip.trim().length < 5) {
        toast.error('클립보드가 비어있어요');
        return;
      }
      setText(clip);
    } catch {
      toast.error('클립보드 접근이 거부되었습니다. 직접 붙여넣어 주세요.');
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setError(null);
    setIsParsing(true);
    try {
      const res = await apiFetch('/api/parse-income-text', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const reason = json?.reason;
        if (reason === 'rate_limit') {
          setError(json.message || '잠시 후 다시 시도해주세요.');
        } else if (reason === 'unauthorized') {
          setError('로그인이 필요해요.');
        } else {
          setError(json?.message || 'AI 분석에 실패했습니다.');
        }
        return;
      }
      const parsed: ParsedIncome[] = Array.isArray(json.data) ? json.data : [];
      if (parsed.length === 0) {
        setError('인식된 송금 내역이 없어요. 다른 텍스트로 시도해보세요.');
        return;
      }
      setRows(
        parsed.map((p, i) => {
          const matches = contacts.filter((c) => c.name === p.senderName);
          return {
            ...p,
            _key: `${i}-${Date.now()}`,
            _selected: true,
            // 동명이인 2명+ → 첫 번째 기본 선택 (명시적), 그 외 → 서버 위임
            _contactId: matches.length >= 2 ? matches[0].id : '',
            _eventType: 'other' as EventType,
          };
        }),
      );
      setStep('reviewing');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsParsing(false);
    }
  };

  const toggleRow = (key: string) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, _selected: !r._selected } : r)));
  };

  const updateField = (key: string, field: 'senderName' | 'amount', value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        if (field === 'amount') {
          return { ...r, amount: parseManInputToWon(value) };
        }
        // senderName 변경 시 동명이인 매칭 재계산
        const matches = contacts.filter((c) => c.name === value);
        return {
          ...r,
          senderName: value,
          _contactId: matches.length >= 2 ? matches[0].id : '',
        };
      }),
    );
  };

  const updateContactId = (key: string, contactId: string) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, _contactId: contactId } : r)));
  };

  const updateEventType = (key: string, eventType: EventType) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, _eventType: eventType } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r._key !== key));
  };

  const selectedCount = rows.filter((r) => r._selected).length;

  const handleSave = async () => {
    const toSave = rows.filter((r) => r._selected && r.senderName.trim() && r.amount > 0);
    if (toSave.length === 0) {
      toast.error('저장할 항목이 없어요');
      return;
    }
    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const source: TransactionSource = 'SMS_PASTE';
      for (const row of toSave) {
        await addEntry({
          contactId: row._contactId || '',
          eventType: row._eventType,
          type: 'INCOME',
          date: row.date || today,
          location: '',
          targetName: row.senderName.trim(),
          account: row.bank || '',
          amount: row.amount,
          relation: '지인',
          memo: '',
          isIncome: true,
          source,
        });
      }
      toast.success(`${toSave.length}건 저장되었어요`);
      reset();
      onClose();
    } catch {
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[32px] z-[110] shadow-2xl max-h-[90dvh] flex flex-col"
          >
            <div className="flex justify-between items-center px-6 pt-6 pb-4 shrink-0">
              <div>
                <h2 className="text-xl font-bold">받은 내역 붙여넣기</h2>
                <p className="text-xs text-gray-400 mt-1">
                  {step === 'input' ? '송금 알림 문자를 붙여넣어 주세요' : `총 ${rows.length}건 인식`}
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={isSaving || isParsing}
                className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mx-6 mb-3 p-3 bg-red-50 text-red-600 rounded-xl flex items-center space-x-2 text-sm shrink-0">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {step === 'input' && (
                <div className="space-y-4">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'예) [KB] 04/14 김진호님이 5만원 입금\n[카카오페이] 이나은님으로부터 10만원 받음'}
                    rows={8}
                    className="w-full p-4 bg-gray-50 rounded-2xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-300 leading-relaxed"
                    disabled={isParsing}
                  />
                  <button
                    onClick={handlePaste}
                    disabled={isParsing}
                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-all disabled:opacity-40"
                  >
                    <Clipboard size={16} />
                    <span>클립보드에서 붙여넣기</span>
                  </button>
                  <div className="bg-blue-50 p-4 rounded-2xl text-xs text-blue-700 leading-relaxed">
                    <p className="font-bold mb-1">💡 지원 형식</p>
                    <p>카카오페이, 토스, 국내 주요 은행(KB/신한/우리/하나/NH/IBK), 삼성페이 송금·입금 알림</p>
                  </div>
                </div>
              )}

              {step === 'reviewing' && (
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8">
                      모든 항목이 제거되었어요
                    </div>
                  ) : (
                    rows.map((row) => {
                      const matches = contacts.filter((c) => c.name === row.senderName);
                      const hasDuplicate = matches.length >= 2;
                      return (
                      <div
                        key={row._key}
                        className={`p-3 rounded-2xl border transition-all ${
                          row._selected ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-100 opacity-60'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <button
                            onClick={() => toggleRow(row._key)}
                            className={`mt-1 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                              row._selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                            }`}
                            aria-label={row._selected ? '선택 해제' : '선택'}
                          >
                            {row._selected && <Check size={12} className="text-white" />}
                          </button>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center space-x-2">
                              <input
                                value={row.senderName}
                                onChange={(e) => updateField(row._key, 'senderName', e.target.value)}
                                className="flex-1 bg-transparent font-bold text-sm outline-none border-b border-transparent focus:border-blue-300"
                                disabled={!row._selected}
                              />
                              <ConfidenceBadge level={row.confidence} />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-1">
                                <input
                                  value={formatManInputValue(row.amount)}
                                  onChange={(e) => updateField(row._key, 'amount', e.target.value)}
                                  inputMode="decimal"
                                  className="w-24 bg-transparent font-bold text-blue-600 text-sm outline-none border-b border-transparent focus:border-blue-300 text-right"
                                  disabled={!row._selected}
                                />
                                <span className="text-xs text-blue-600 font-bold">만</span>
                              </div>
                              <div className="flex items-center space-x-2 text-[11px] text-gray-400">
                                {row.bank && <span>{row.bank}</span>}
                                {row.date && <span>· {row.date}</span>}
                                <button
                                  onClick={() => removeRow(row._key)}
                                  className="p-1 hover:bg-gray-100 rounded"
                                  aria-label="삭제"
                                >
                                  <Trash2 size={12} className="text-gray-400" />
                                </button>
                              </div>
                            </div>
                            {row._selected && (
                              <div className="flex items-center space-x-1 pt-1">
                                {EVENT_OPTIONS.map(({ value, label, Icon }) => {
                                  const active = row._eventType === value;
                                  return (
                                    <button
                                      key={value}
                                      onClick={() => updateEventType(row._key, value)}
                                      className={`flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                        active
                                          ? 'bg-blue-600 text-white shadow-sm'
                                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                                      }`}
                                    >
                                      <Icon size={11} className={active ? 'text-white' : 'text-gray-400'} />
                                      <span>{label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {hasDuplicate && row._selected && (
                              <div className="mt-1 p-2 bg-amber-50 rounded-lg space-y-1">
                                <div className="flex items-center space-x-1 text-[11px] font-bold text-amber-700">
                                  <Users size={11} />
                                  <span>동명이인 {matches.length}명 — 연결할 연락처 선택</span>
                                </div>
                                <select
                                  value={row._contactId || ''}
                                  onChange={(e) => updateContactId(row._key, e.target.value)}
                                  className="w-full text-[11px] p-1.5 bg-white rounded border border-amber-200 outline-none focus:border-amber-400"
                                >
                                  {matches.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} {c.relation ? `· ${c.relation}` : ''}{c.phone ? ` · ${c.phone.slice(-4)}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="px-6 pt-2 shrink-0 border-t border-gray-50 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
              {step === 'input' ? (
                <button
                  onClick={handleAnalyze}
                  disabled={!text.trim() || isParsing}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isParsing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>분석 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>분석하기</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={() => setStep('input')}
                    disabled={isSaving}
                    className="px-5 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold text-sm active:scale-95 transition-all disabled:opacity-40"
                  >
                    다시
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || selectedCount === 0}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>저장 중...</span>
                      </>
                    ) : (
                      <span>선택 저장 ({selectedCount}건)</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
