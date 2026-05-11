import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';
import { X, Upload, Check, AlertCircle, Table as TableIcon, Sparkles, Database } from 'lucide-react';
import { parseCSVFile, cleanAmount, cleanDate, normalizeEventType, RawCSVData } from '../utils/csvParser';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/apiClient';
import AdPromptDialog from './ads/AdPromptDialog';
import { toast } from 'sonner';
import { formatAmountMan } from '../utils/amountFormat';

interface BackupRow {
  targetName: string;
  amount: number;
  date: string;
  eventType: 'wedding' | 'funeral' | 'birthday' | 'other';
  location: string;
  relation: string;
  type: 'INCOME' | 'EXPENSE';
  isIncome: boolean;
  memo: string;
}

const BACKUP_REQUIRED_HEADERS = ['날짜', '구분', '이름', '금액', '종류'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function BulkImportModal({ isOpen, onClose }: Props) {
  const { bulkAddEntries, refreshCredits } = useStore();
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [csvData, setCsvData] = useState<RawCSVData | null>(null);
  const [transactionType, setTransactionType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [mapping, setMapping] = useState({
    targetName: -1,
    amount: -1,
    date: -1,
    eventType: -1,
    location: -1,
    relation: -1,
  });
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [adPromptOpen, setAdPromptOpen] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'mapping' | 'success' | 'failed'>('idle');
  const [aiReason, setAiReason] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'general' | 'backup'>('general');
  const [backupRows, setBackupRows] = useState<BackupRow[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const parseBackupFile = (file: File): Promise<BackupRow[]> =>
    new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields ?? [];
          const missing = BACKUP_REQUIRED_HEADERS.filter((h) => !headers.includes(h));
          if (missing.length > 0) {
            reject(new Error(`마음정산 백업 파일이 아닌 것 같아요. 누락된 열: ${missing.join(', ')}`));
            return;
          }
          const rows: BackupRow[] = [];
          for (const r of results.data) {
            const name = String(r['이름'] ?? '').trim();
            const amount = cleanAmount(r['금액']);
            if (!name || amount <= 0) continue;
            const division = String(r['구분'] ?? '').trim();
            // 받음/IN/INCOME → INCOME, 그 외 → EXPENSE
            const isIncome = /받|IN|INCOME/i.test(division);
            const type: 'INCOME' | 'EXPENSE' = isIncome ? 'INCOME' : 'EXPENSE';
            rows.push({
              targetName: name,
              amount,
              date: cleanDate(r['날짜']),
              eventType: normalizeEventType(r['종류']),
              location: String(r['장소'] ?? '').trim() || '기타',
              relation: String(r['관계'] ?? '').trim() || '지인',
              type,
              isIncome,
              memo: String(r['메모'] ?? '').trim(),
            });
          }
          resolve(rows);
        },
        error: reject,
      });
    });

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseBackupFile(file);
      if (rows.length === 0) {
        setError('백업 파일에서 가져올 유효한 행이 없어요.');
        return;
      }
      setBackupRows(rows);
      setImportMode('backup');
      setStep('preview');
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '백업 파일을 읽는 중 오류가 발생했습니다.';
      setError(msg);
    }
  };

  const runAiMapping = async (data: RawCSVData) => {
    setAiState('mapping');
    setAiReason(null);
    try {
      const res = await apiFetch('/api/csv-map', {
        method: 'POST',
        body: JSON.stringify({
          headers: data.headers,
          sampleRows: data.rows.slice(0, 5),
        }),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.mapping) {
        setAiState('failed');
        return;
      }
      setMapping({
        targetName: typeof json.mapping.targetName === 'number' ? json.mapping.targetName : -1,
        amount: typeof json.mapping.amount === 'number' ? json.mapping.amount : -1,
        date: typeof json.mapping.date === 'number' ? json.mapping.date : -1,
        eventType: typeof json.mapping.eventType === 'number' ? json.mapping.eventType : -1,
        location: typeof json.mapping.location === 'number' ? json.mapping.location : -1,
        relation: typeof json.mapping.relation === 'number' ? json.mapping.relation : -1,
      });
      // 보냄/받음 은 사용자가 직접 선택하므로 자동 적용하지 않음
      if (typeof json.reason === 'string') setAiReason(json.reason);
      setAiState('success');
    } catch (e) {
      console.warn('[csv-map] failed:', e);
      setAiState('failed');
    }
  };

  // 모달 오픈 시 최신 크레딧 상태 동기화
  useEffect(() => {
    if (isOpen) refreshCredits();
  }, [isOpen, refreshCredits]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseCSVFile(file);
      setCsvData(data);
      setImportMode('general');
      setStep('mapping');
      setError(null);
      runAiMapping(data);
    } catch (err: any) {
      setError(err.message || '파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  const handleMappingChange = (field: keyof typeof mapping, index: number) => {
    setMapping(prev => ({ ...prev, [field]: index }));
  };

  const handleMappingSubmit = () => {
    if (mapping.targetName === -1 || mapping.amount === -1) {
      setError('이름과 금액 열은 필수입니다.');
      return;
    }
    setStep('preview');
    setError(null);
  };

  const processRows = () => {
    if (!csvData) return [];
    
    return csvData.rows.map(row => {
      const name = mapping.targetName !== -1 ? String(row[mapping.targetName] || '').trim() : '';
      const amount = mapping.amount !== -1 ? cleanAmount(row[mapping.amount]) : 0;
      const rawDate = mapping.date !== -1 ? String(row[mapping.date] || '').trim() : '';
      const date = cleanDate(rawDate);
      
      // Basic validation
      if (!name || amount <= 0) return null;

      return {
        targetName: name,
        amount: amount,
        date: date,
        eventType: normalizeEventType(mapping.eventType !== -1 ? row[mapping.eventType] : 'wedding'),
        location: mapping.location !== -1 ? String(row[mapping.location] || '').trim() : '기타',
        relation: mapping.relation !== -1 ? String(row[mapping.relation] || '').trim() : '지인',
        type: transactionType,
        isIncome: transactionType === 'INCOME',
        memo: '',
      };
    }).filter(Boolean);
  };

  const handleImport = async () => {
    const processed = importMode === 'backup' ? (backupRows ?? []) : processRows();
    if (processed.length === 0) {
      setError('가져올 유효한 데이터가 없습니다.');
      return;
    }

    setIsImporting(true);
    try {
      const result = await bulkAddEntries(processed as any);
      if (result.inserted > 0) {
        toast.success(`${result.inserted}건을 가져왔어요`, {
          description: result.skipped > 0 ? `${result.skipped}건은 중복으로 건너뛰었어요.` : undefined,
        });
      } else {
        toast.info('새로 가져올 내역이 없어요', {
          description: result.skipped > 0 ? `${result.skipped}건은 중복으로 건너뛰었어요.` : undefined,
        });
      }
      setError(null);
      onClose();
      reset();
      return result;
    } catch (err: any) {
      if (err?.status === 402 || err?.reason === 'no_credits') {
        setError(null);
        setAdPromptOpen(true);
      } else {
        setError(err?.message || '가져오기에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setCsvData(null);
    setTransactionType('INCOME');
    setMapping({
      targetName: -1,
      amount: -1,
      date: -1,
      eventType: -1,
      location: -1,
      relation: -1,
    });
    setError(null);
    setAiState('idle');
    setAiReason(null);
    setImportMode('general');
    setBackupRows(null);
  };

  const allRows = importMode === 'backup' ? (backupRows ?? []) : processRows();
  const previewRows = allRows.slice(0, 3);
  const totalCount = allRows.length;
  const incomeCount = importMode === 'backup'
    ? (backupRows ?? []).filter((r) => r.type === 'INCOME').length
    : 0;
  const expenseCount = importMode === 'backup' ? totalCount - incomeCount : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isImporting ? undefined : onClose}
            className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[32px] p-6 z-[110] shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">대량 가져오기</h2>
              <button onClick={onClose} disabled={isImporting} className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-30">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-center space-x-2 text-sm">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {step === 'upload' && (
              <div className="space-y-4">
                {/* 1) 백업 파일 불러오기 — 우리 export 포맷 인식, 받음/보냄 자동 */}
                <div
                  onClick={() => backupFileInputRef.current?.click()}
                  className="border-2 border-dashed border-emerald-200 bg-emerald-50/30 rounded-3xl p-6 flex flex-col items-center justify-center space-y-3 hover:border-emerald-400 hover:bg-emerald-50 transition-all cursor-pointer"
                >
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
                    <Database size={26} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-gray-700">백업 파일 불러오기</p>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      마음정산 백업 CSV
                    </p>
                  </div>
                  <input
                    type="file"
                    ref={backupFileInputRef}
                    onChange={handleBackupFileChange}
                    accept=".csv,text/csv,text/plain,text/comma-separated-values,application/csv,application/vnd.ms-excel,application/octet-stream,*/*"
                    className="hidden"
                  />
                </div>

                {/* 2) 일반 CSV 가져오기 — AI 컬럼 매핑 + 사용자 토글 */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-3xl p-6 flex flex-col items-center justify-center space-y-3 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                    <Upload size={26} />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-gray-700">일반 CSV 가져오기</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      일반 CSV 파일
                    </p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,text/csv,text/plain,text/comma-separated-values,application/csv,application/vnd.ms-excel,application/octet-stream,*/*"
                    className="hidden"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl text-xs text-blue-700 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <Sparkles size={13} className="text-blue-500" />
                    안내
                  </p>
                  <p>• 첫 번째 행은 제목(헤더)이어야 해요.</p>
                  <p>• 백업 파일은 내역 탭의 "내보내기" 로 만든 CSV 예요.</p>
                  <p>• 이미 등록된 내역과 파일 안 중복 행은 자동으로 건너뜁니다.</p>
                </div>
              </div>
            )}

            {step === 'mapping' && csvData && (
              <div className="space-y-6">
                {aiState === 'mapping' && (
                  <div className="p-3 bg-blue-50 rounded-xl flex items-center space-x-2 text-xs text-blue-700">
                    <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span>AI 가 열을 분석하고 있어요...</span>
                  </div>
                )}
                {aiState === 'success' && (
                  <div className="p-3 bg-emerald-50 rounded-xl flex items-start space-x-2 text-xs text-emerald-700">
                    <Sparkles size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">AI 자동 매칭 완료</p>
                      <p className="mt-0.5 opacity-80">아래 결과를 확인하고 필요하면 수정해주세요.{aiReason ? ` (${aiReason})` : ''}</p>
                    </div>
                  </div>
                )}
                {aiState === 'failed' && (
                  <div className="p-3 bg-amber-50 rounded-xl flex items-center justify-between text-xs text-amber-700">
                    <div className="flex items-center space-x-2">
                      <AlertCircle size={14} />
                      <span>AI 매칭에 실패했어요. 직접 선택해주세요.</span>
                    </div>
                    <button
                      onClick={() => csvData && runAiMapping(csvData)}
                      className="px-2.5 py-1 bg-amber-100 rounded-lg font-bold hover:bg-amber-200 transition-colors"
                    >
                      다시 시도
                    </button>
                  </div>
                )}
                {/* 보냄/받음 — 사용자가 직접 선택 (AI 가 추론하지 않음) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 ml-1">이 장부는 어떤 내역인가요? (필수)</label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setTransactionType('INCOME')}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                        transactionType === 'INCOME'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${transactionType === 'INCOME' ? 'bg-white' : 'bg-blue-400'}`} />
                      <span>받은 마음 (수입)</span>
                    </button>
                    <button
                      onClick={() => setTransactionType('EXPENSE')}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                        transactionType === 'EXPENSE'
                          ? 'bg-red-500 text-white shadow-md shadow-red-100'
                          : 'bg-gray-50 text-gray-500 border border-gray-100'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${transactionType === 'EXPENSE' ? 'bg-white' : 'bg-red-400'}`} />
                      <span>보낸 마음 (지출)</span>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500">엑셀의 열과 앱의 항목을 연결해주세요.</p>
                <div className="space-y-4">
                  <MappingSelect
                    label="이름 (필수)"
                    value={mapping.targetName}
                    headers={csvData.headers}
                    onChange={(idx) => handleMappingChange('targetName', idx)}
                  />
                  <MappingSelect
                    label="금액 (필수)"
                    value={mapping.amount}
                    headers={csvData.headers}
                    onChange={(idx) => handleMappingChange('amount', idx)}
                  />
                  <MappingSelect
                    label="날짜"
                    value={mapping.date}
                    headers={csvData.headers}
                    onChange={(idx) => handleMappingChange('date', idx)}
                  />
                  <MappingSelect
                    label="경조사 종류 (결혼/부고/생일)"
                    value={mapping.eventType}
                    headers={csvData.headers}
                    onChange={(idx) => handleMappingChange('eventType', idx)}
                  />
                  <MappingSelect
                    label="장소"
                    value={mapping.location}
                    headers={csvData.headers}
                    onChange={(idx) => handleMappingChange('location', idx)}
                  />
                  <MappingSelect
                    label="관계"
                    value={mapping.relation}
                    headers={csvData.headers}
                    onChange={(idx) => handleMappingChange('relation', idx)}
                  />
                </div>
                <button
                  onClick={handleMappingSubmit}
                  disabled={mapping.targetName === -1 || mapping.amount === -1}
                  className={`w-full py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-all ${
                    mapping.targetName === -1 || mapping.amount === -1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  연결 완료
                </button>
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm font-bold text-gray-700">
                    <TableIcon size={18} className="text-blue-500" />
                    <span>데이터 미리보기 (상위 3개)</span>
                  </div>
                  {importMode === 'backup' && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                      백업 복원 모드
                    </span>
                  )}
                </div>

                <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                  <table className="w-full text-sm table-auto">
                    <thead className="bg-gray-100 text-gray-500 text-[10px] uppercase font-bold">
                      <tr>
                        {importMode === 'backup' && <th className="px-2 py-2 text-left">구분</th>}
                        <th className="px-3 py-2 text-left">이름</th>
                        <th className="px-3 py-2 text-right">금액</th>
                        <th className="px-3 py-2 text-left">장소</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.map((row: any, idx) => {
                        const rowType = importMode === 'backup' ? row.type : transactionType;
                        const isIn = rowType === 'INCOME';
                        return (
                          <tr key={idx}>
                            {importMode === 'backup' && (
                              <td className="px-2 py-3">
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isIn ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
                                  {isIn ? 'IN' : 'OUT'}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-3 text-[13px] font-medium whitespace-nowrap">{row.targetName}</td>
                            <td className={`px-3 py-3 text-right text-[13px] font-bold tabular-nums whitespace-nowrap ${isIn ? 'text-blue-600' : 'text-red-500'}`}>
                              {isIn ? '+' : '-'}{formatAmountMan(row.amount)}
                            </td>
                            <td className="px-3 py-3 text-gray-500 text-xs break-words">{row.location}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl flex items-start space-x-3">
                  <Check className="text-blue-600 mt-0.5" size={18} />
                  <p className="text-xs text-blue-700 leading-relaxed">
                    총 <span className="font-bold">{totalCount}건</span>의 데이터를 가져옵니다.
                    {importMode === 'backup' && (
                      <> (받은 마음 <span className="font-bold text-blue-700">{incomeCount}건</span> · 보낸 마음 <span className="font-bold text-red-600">{expenseCount}건</span>)</>
                    )}
                    <br />
                    중복 내역은 저장하지 않고 자동으로 건너뜁니다.
                  </p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep(importMode === 'backup' ? 'upload' : 'mapping')}
                    disabled={isImporting}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold active:scale-95 transition-all disabled:opacity-40"
                  >
                    이전으로
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>등록 중...</span>
                      </>
                    ) : (
                      <span>일괄 등록하기</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
          <AdPromptDialog
            open={adPromptOpen}
            onClose={() => setAdPromptOpen(false)}
            rewardType="CSV_CREDIT"
          />
        </>
      )}
    </AnimatePresence>
  );
}

function MappingSelect({ label, value, headers, onChange }: { label: string, value: number, headers: { name: string, index: number }[], onChange: (idx: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-500 ml-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
      >
        <option value={-1}>열 선택 안함</option>
        {headers.map((header) => (
          <option key={header.index} value={header.index}>{header.name}</option>
        ))}
      </select>
    </div>
  );
}
