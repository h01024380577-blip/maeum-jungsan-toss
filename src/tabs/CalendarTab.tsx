import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { useStore } from '../store/useStore';
import { format, isSameDay, parseISO } from 'date-fns';
import { Heart, Flower2, Cake, Star, MapPin, CalendarPlus, CheckCircle2, AlertCircle, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { exportEventToCalendar, exportAllEventsToCalendar } from '../lib/exportToCalendar';
import { isSamsungGalaxyDevice, hasSeenSamsungCalendarHint, markSamsungCalendarHintSeen } from '../lib/platformDetect';
import SamsungCalendarHintDialog from '../components/SamsungCalendarHintDialog';
import { formatAmountMan } from '../utils/amountFormat';

const eventIcon = (t: string, size = 12) => {
  if (t === 'wedding') return <Heart size={size} className="text-pink-500 fill-pink-500" />;
  if (t === 'funeral') return <Flower2 size={size} className="text-gray-400" />;
  if (t === 'birthday') return <Cake size={size} className="text-amber-500 fill-amber-500" />;
  return <Star size={size} className="text-blue-500 fill-blue-500" />;
};

export default function CalendarTab() {
  const { entries } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);

  // Samsung Galaxy 안내 모달 — 첫 캘린더 export 시도 시 1회 노출
  const [samsungHintOpen, setSamsungHintOpen] = useState(false);
  // 모달 confirm/dismiss 후 실제 실행할 export action 보존
  const [pendingExport, setPendingExport] = useState<null | (() => Promise<void>)>(null);

  const errorMessage = (code: string): string => {
    if (code === 'no_events') return '내보낼 일정이 없어요';
    if (code === 'Unauthorized') return '로그인이 필요해요';
    if (code === 'not_found') return '해당 일정을 찾을 수 없어요';
    return '일정 내보내기에 실패했어요';
  };

  const successToast = (message: string, description?: string) =>
    toast.success(message, {
      description,
      icon: <CheckCircle2 size={18} className="text-emerald-600" />,
      duration: description ? 3000 : 1800,
    });
  const errorToast = (code: string) =>
    toast.error(errorMessage(code), {
      icon: <AlertCircle size={18} className="text-rose-600" />,
      duration: 2800,
    });

  /** Samsung Galaxy + 처음이면 안내 모달 띄우고 confirm/dismiss 후 action 실행. 그 외엔 즉시 실행. */
  const runWithSamsungHint = async (action: () => Promise<void>) => {
    // 모달 이미 떠있으면 첫 pendingExport 보존 위해 무시
    if (samsungHintOpen) return;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (isSamsungGalaxyDevice(ua) && !hasSeenSamsungCalendarHint()) {
      setPendingExport(() => action);
      setSamsungHintOpen(true);
      return;
    }
    await action();
  };

  const handleExportOne = (eventId: string) => {
    if (exportingId || exportingAll) return;
    return runWithSamsungHint(async () => {
      setExportingId(eventId);
      try {
        const res = await exportEventToCalendar(eventId);
        const desc = res.via === 'ait-openurl'
          ? '브라우저 안내를 따라 캘린더에 추가하세요'
          : undefined;
        successToast(`'${res.fileName}' 캘린더 파일을 받아요`, desc);
      } catch (err) {
        errorToast(err instanceof Error ? err.message : 'unknown');
      } finally {
        setExportingId(null);
      }
    });
  };

  const handleExportAll = () => {
    if (exportingAll || exportingId) return;
    return runWithSamsungHint(async () => {
      setExportingAll(true);
      try {
        const res = await exportAllEventsToCalendar();
        const desc = res.via === 'ait-openurl'
          ? '브라우저 안내를 따라 캘린더에 추가하세요'
          : undefined;
        successToast(`${res.eventCount}개 일정의 캘린더 파일을 받아요`, desc);
      } catch (err) {
        errorToast(err instanceof Error ? err.message : 'unknown');
      } finally {
        setExportingAll(false);
      }
    });
  };

  const handleSamsungHintConfirm = async () => {
    markSamsungCalendarHintSeen();
    setSamsungHintOpen(false);
    const action = pendingExport;
    setPendingExport(null);
    if (action) await action();
  };

  const handleSamsungHintDismiss = async () => {
    setSamsungHintOpen(false);
    const action = pendingExport;
    setPendingExport(null);
    if (action) await action();
  };

  const getDateEntries = (date: Date) => entries.filter(e => {
    try { return e.date && isSameDay(parseISO(e.date), date); } catch { return false; }
  });

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const dayEvents = getDateEntries(date);
    if (dayEvents.length === 0) return null;
    return (
      <div className="flex justify-center space-x-0.5 mt-0.5">
        {dayEvents.slice(0, 3).map((e, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.type === 'INCOME' ? '#3b82f6' : '#ef4444' }} />
        ))}
      </div>
    );
  };

  const selectedDayEvents = getDateEntries(selectedDate);

  return (
    <div className="pb-4">
      <SamsungCalendarHintDialog
        isOpen={samsungHintOpen}
        onConfirm={handleSamsungHintConfirm}
        onDismiss={handleSamsungHintDismiss}
      />
      <div className="px-5 pt-14 pb-4 bg-white">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h1 className="whitespace-nowrap text-[22px] font-black text-gray-900 tracking-tight">경조사 달력</h1>
            <p className="mt-0.5 truncate whitespace-nowrap text-xs text-gray-400">날짜를 선택해서 일정을 확인하세요</p>
          </div>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={exportingAll || !!exportingId}
            className="mt-1 flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-600 active:bg-blue-100 disabled:opacity-50"
            aria-label="모든 경조사 일정을 캘린더로 내보내기"
          >
            <CalendarPlus size={12} />
            {exportingAll ? '준비 중…' : '캘린더로'}
          </button>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-4">
        <div className="bg-white p-4 rounded-[24px] shadow-sm border border-gray-100">
          <Calendar
            onChange={(v) => setSelectedDate(v as Date)}
            value={selectedDate}
            tileContent={tileContent}
            formatDay={(locale, date) => format(date, 'd')}
            calendarType="gregory"
          />
        </div>

        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            {format(selectedDate, 'M월 d일')} 일정 ({selectedDayEvents.length})
          </h3>
          {selectedDayEvents.length > 0 ? (
            selectedDayEvents.map(e => (
              <div key={e.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex min-w-0 items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${e.type === 'INCOME' ? 'bg-blue-50' : 'bg-red-50'}`}>
                    {eventIcon(e.eventType, 16)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="min-w-0 truncate text-sm font-bold text-gray-900">{e.targetName}</p>
                      {e.memo?.trim() && (
                        <span aria-label="메모 있음" title="메모 있음" className="inline-flex shrink-0 text-blue-400">
                          <StickyNote size={11} />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 mt-0.5">
                      {e.location && <><MapPin size={10} className="text-gray-300" /><p className="text-[10px] text-gray-400">{e.location}</p></>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${e.type === 'INCOME' ? 'text-blue-600' : 'text-red-500'}`}>
                    {e.type === 'INCOME' ? '+' : '-'}{formatAmountMan(e.amount)}
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium">{e.relation}</p>
                  <button
                    type="button"
                    onClick={() => handleExportOne(e.id)}
                    disabled={exportingId === e.id || exportingAll}
                    className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-gray-50 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 active:bg-gray-100 disabled:opacity-50"
                    aria-label={`${e.targetName} 일정을 캘린더로 내보내기`}
                  >
                    <CalendarPlus size={9} />
                    {exportingId === e.id ? '…' : '캘린더'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-200 text-center">
              <p className="text-sm text-gray-300 font-medium">일정이 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
