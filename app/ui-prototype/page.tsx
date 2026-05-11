"use client";

import Image from 'next/image';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownLeft,
  ArrowUp,
  ArrowUpRight,
  Bell,
  BookUser,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardPaste,
  Download,
  Flower2,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  PencilLine,
  Search,
  Settings,
  Sparkles,
  Upload,
  User,
  Wallet,
} from 'lucide-react';

type NavKey = 'home' | 'calendar' | 'history' | 'contacts' | 'my';
type HomeInputMethod = 'link' | 'image' | 'manual';

const screenNotes = [
  '홈은 기능 소개보다 기록 진입점을 먼저 보여줍니다.',
  '분석 결과는 핵심 정보와 금액 확인을 우선합니다.',
  '부고는 회색 톤과 조의 중심 문구로 분리합니다.',
  '재방문 화면은 검색, 필터, 최근 작업을 더 쉽게 스캔하게 합니다.',
];

const recentRecords = [
  { name: '최유진', event: '결혼', date: '오늘', amount: '-10만', tone: 'sent' },
  { name: '박선우', event: '부고', date: '내일', amount: '-5만', tone: 'solemn' },
  { name: '정다은', event: '돌잔치', date: '지난주', amount: '+10만', tone: 'received' },
];

const calendarDays = Array.from({ length: 35 }, (_, index) => index + 1);

export default function UiPrototypePage() {
  return (
    <main className="min-h-screen bg-[#08090d] text-white">
      <section className="mx-auto max-w-[1500px] px-5 py-8 md:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-blue-300">마음정산 UI/UX 프로토타입</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal md:text-5xl">
              전체 앱 흐름 스케치 보드
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 md:text-base">
              운영 UI를 바로 바꾸기 전에 홈, 분석 결과, 부고 톤, 달력, 내역, 연락처, MY를 한 화면에서 비교하도록 만든 Figma형 검토 페이지입니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-zinc-300 md:w-[460px]">
            {screenNotes.map((note) => (
              <div key={note} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                {note}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 overflow-x-auto pb-6">
          <div className="grid min-w-[1280px] grid-cols-4 gap-5">
            <MobileFrame title="01 홈" caption="입력 우선 홈">
              <HomeSketch />
            </MobileFrame>

            <MobileFrame title="02 분석" caption="결과 확인 바텀시트">
              <AnalyzeSketch />
            </MobileFrame>

            <MobileFrame title="03 부고" caption="차분한 조의 기록">
              <FuneralSketch />
            </MobileFrame>

            <MobileFrame title="04 달력" caption="다가오는 일정 중심">
              <CalendarSketch />
            </MobileFrame>

            <MobileFrame title="05 내역" caption="검색과 필터 중심">
              <HistorySketch />
            </MobileFrame>

            <MobileFrame title="06 연락처" caption="사람별 재방문">
              <ContactsSketch />
            </MobileFrame>

            <MobileFrame title="07 연락처 상세" caption="마음 흐름 요약">
              <ContactDetailSketch />
            </MobileFrame>

            <MobileFrame title="08 MY" caption="계정·혜택·설정 분리">
              <MySketch />
            </MobileFrame>
          </div>
        </div>
      </section>
    </main>
  );
}

function MobileFrame({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-3 shadow-2xl">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-400">{caption}</p>
        </div>
        <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold text-zinc-300">
          390px
        </span>
      </div>
      <div className="h-[760px] overflow-hidden rounded-[22px] border-[5px] border-zinc-800 bg-slate-50 text-slate-950">
        {children}
      </div>
    </section>
  );
}

function PhoneHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <header className="bg-white px-5 pb-4 pt-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-black tracking-normal text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-400">{subtitle}</p>
        </div>
        {action}
      </div>
    </header>
  );
}

function BottomNav({ active }: { active: NavKey }) {
  const items: { key: NavKey; label: string; icon: LucideIcon }[] = [
    { key: 'home', label: '홈', icon: Heart },
    { key: 'calendar', label: '달력', icon: CalendarDays },
    { key: 'history', label: '내역', icon: ClipboardPaste },
    { key: 'contacts', label: '연락처', icon: BookUser },
    { key: 'my', label: 'MY', icon: User },
  ];
  return (
    <nav className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white px-3 pb-4 pt-2">
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              type="button"
              key={item.key}
              className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-black ${
                isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-400'
              }`}
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HomeSketch() {
  const [method, setMethod] = useState<HomeInputMethod>('link');
  const [resultOpen, setResultOpen] = useState(false);

  const selectMethod = (nextMethod: HomeInputMethod) => {
    setMethod(nextMethod);
    setResultOpen(false);
  };

  return (
    <div className="relative h-full overflow-hidden bg-slate-50">
      <div className="h-full overflow-y-auto pb-24">
        <PhoneHeader
          title="오늘 바로 기록하기"
          subtitle="보낸 마음과 받은 마음을 빠르게 정리해요"
          action={<Image src="/icon.png" alt="마음정산" width={42} height={42} className="rounded-lg" />}
        />

        <div className="space-y-4 px-5 pt-4">
          <Segmented labels={['보낸 마음', '받은 마음']} active={0} />

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-black text-slate-950">보낸 마음 기록</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">입력 방식에 따라 확인 흐름이 바뀝니다</p>
              </div>
              <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
                AI
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ActionTile icon={LinkIcon} label="링크" active={method === 'link'} onClick={() => selectMethod('link')} />
              <ActionTile icon={ImageIcon} label="이미지" active={method === 'image'} onClick={() => selectMethod('image')} />
              <ActionTile icon={PencilLine} label="직접 입력" active={method === 'manual'} onClick={() => selectMethod('manual')} />
            </div>
            <HomeMethodPanel method={method} onAnalyze={() => setResultOpen(true)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric icon={CalendarDays} label="이번 주" value="2건" />
            <Metric icon={Wallet} label="보낸 마음" value="35만" />
            <Metric icon={ArrowDownLeft} label="받은 마음" value="20만" />
          </div>

          <section>
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-900">최근 기록</p>
              <span className="text-xs font-bold text-slate-400">전체</span>
            </div>
            <div className="mt-2 space-y-2">
              {recentRecords.map((item) => (
                <RecordRow key={`${item.name}-${item.event}`} {...item} />
              ))}
            </div>
          </section>
        </div>
      </div>
      <BottomNav active="home" />
      {resultOpen && <HomeResultSheet method={method} onClose={() => setResultOpen(false)} />}
    </div>
  );
}

function AnalyzeSketch() {
  return (
    <div className="relative h-full bg-slate-100">
      <div className="absolute inset-0 px-5 pt-10">
        <div className="rounded-lg bg-white p-4 opacity-60">
          <p className="text-sm font-black">홈 입력 영역</p>
          <div className="mt-3 h-12 rounded-md bg-slate-100" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-20 rounded-md bg-slate-100" />
            <div className="h-20 rounded-md bg-slate-100" />
            <div className="h-20 rounded-md bg-slate-100" />
          </div>
        </div>
      </div>
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-xl bg-white px-5 pb-6 pt-4 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
        <Badge icon={Heart} label="결혼" className="border-rose-100 bg-rose-50 text-rose-600" />
        <h2 className="mt-3 text-xl font-black tracking-normal text-slate-950">분석 결과 확인</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">김민수 · 이서연</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <InfoBlock label="날짜" value="2026.05.18" />
          <InfoBlock label="장소" value="더채플앳청담" />
        </div>
        <AmountBox tone="blue" label="추천 금액" value="10만" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <InfoBlock label="관계" value="친구" />
          <InfoBlock label="계좌" value="신한 110" />
        </div>
        <button type="button" className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-black text-white">
          <Check size={18} />
          기록 저장하기
        </button>
      </div>
    </div>
  );
}

function FuneralSketch() {
  return (
    <div className="relative h-full overflow-y-auto bg-zinc-50 pb-20">
      <PhoneHeader title="조의 기록" subtitle="차분하게 필요한 정보만 확인해요" />
      <div className="space-y-4 px-5 pt-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <Badge icon={Flower2} label="부고" className="border-zinc-200 bg-zinc-100 text-zinc-700" />
          <h2 className="mt-4 text-xl font-black tracking-normal text-zinc-950">故 박영수님</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-500">서울대학교병원 장례식장 5호실</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <InfoBlock label="발인" value="5월 18일 07:00" />
            <InfoBlock label="상주" value="박민재" />
          </div>
          <AmountBox tone="zinc" label="전할 마음" value="5만" />
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-bold text-zinc-400">메모</p>
            <p className="mt-1 text-sm font-semibold text-zinc-700">방문 전 연락, 조의금 계좌 확인</p>
          </div>
          <button type="button" className="mt-4 h-12 w-full rounded-lg bg-zinc-900 text-base font-black text-white">
            조의 기록 저장
          </button>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-black text-zinc-900">부고 화면 원칙</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            빨강/파랑 수지 표현보다 회색 톤, 조의 기록, 빈소, 상주, 메모를 우선합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function CalendarSketch() {
  return (
    <div className="relative h-full overflow-hidden bg-slate-50">
      <div className="h-full overflow-y-auto pb-24">
        <PhoneHeader
          title="경조사 달력"
          subtitle="다가오는 일정과 내보내기를 함께 확인"
          action={<button type="button" className="rounded-md bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">캘린더로</button>}
        />
        <div className="space-y-4 px-5 pt-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <button type="button" className="text-slate-300">‹</button>
              <p className="text-base font-black text-slate-950">2026년 5월</p>
              <button type="button" className="text-slate-300">›</button>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-400">
              {['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((day) => (
                <div
                  key={day}
                  className={`flex h-10 flex-col items-center justify-center rounded-md text-xs font-bold ${
                    [8, 18, 22].includes(day) ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  {day}
                  {[8, 18, 22].includes(day) && <span className="mt-0.5 h-1 w-1 rounded-full bg-white" />}
                </div>
              ))}
            </div>
          </div>
          <section>
            <p className="text-sm font-black text-slate-900">5월 18일 일정</p>
            <div className="mt-2 space-y-2">
              <ScheduleRow icon={Heart} title="김민수 · 이서연" meta="결혼 · 더채플앳청담" amount="-10만" />
              <ScheduleRow icon={Flower2} title="故 박영수님" meta="부고 · 서울대병원" amount="-5만" muted />
            </div>
          </section>
        </div>
      </div>
      <BottomNav active="calendar" />
    </div>
  );
}

function HistorySketch() {
  return (
    <div className="relative h-full overflow-hidden bg-slate-50">
      <div className="h-full overflow-y-auto pb-24">
        <PhoneHeader title="전체 내역" subtitle="검색과 필터를 먼저 배치" />
        <div className="space-y-3 px-5 pt-4">
          <SearchBox placeholder="이름, 행사, 장소, 관계 검색" />
          <Segmented labels={['전체', '보낸 마음', '받은 마음']} active={1} />
          <div className="space-y-2">
            <HistoryRow title="최유진" meta="오늘 · 결혼 · 라움" amount="-10만" />
            <HistoryRow title="박선우" meta="내일 · 부고 · 서울대병원" amount="-5만" muted />
            <HistoryRow title="정다은" meta="지난주 · 돌잔치 · 가족" amount="+10만" received />
            <HistoryRow title="한지우" meta="5.22 · 생일 · 친구" amount="-3만" />
          </div>
        </div>
      </div>
      <BottomNav active="history" />
    </div>
  );
}

function ContactsSketch() {
  return (
    <div className="relative h-full overflow-hidden bg-slate-50">
      <div className="h-full overflow-y-auto pb-24">
        <PhoneHeader
          title="연락처"
          subtitle="사람별 마음 흐름을 확인"
          action={<button type="button" className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Upload size={17} /></button>}
        />
        <div className="space-y-3 px-5 pt-4">
          <SearchBox placeholder="이름으로 검색" />
          <div className="flex gap-2">
            {['이름순', '최근순', '마음순'].map((label, index) => (
              <button
                type="button"
                key={label}
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  index === 1 ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ContactRow name="최유진" relation="친구 · 3건" amount="-12만" favorite />
          <ContactRow name="정다은" relation="동료 · 2건" amount="+10만" />
          <ContactRow name="박선우" relation="지인 · 1건" amount="-5만" muted />
          <ContactRow name="한지우" relation="가족 · 4건" amount="+3만" />
        </div>
      </div>
      <button
        type="button"
        className="absolute bottom-24 right-5 flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200"
        aria-label="상단으로 이동"
      >
        <ArrowUp size={20} />
      </button>
      <BottomNav active="contacts" />
    </div>
  );
}

function ContactDetailSketch() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 pb-8">
      <PhoneHeader title="최유진" subtitle="친구 · 최근 기록 3건" />
      <div className="space-y-4 px-5 pt-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <User size={30} />
          </div>
          <p className="mt-3 text-xl font-black text-slate-950">최유진</p>
          <p className="mt-1 text-xs font-bold text-blue-600">친구</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-black text-slate-400">마음 흐름</p>
          <p className="mt-2 text-3xl font-black text-blue-700">-12만</p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[68%] rounded-full bg-blue-600" />
          </div>
          <div className="mt-3 flex justify-between text-xs font-bold text-slate-400">
            <span>보낸 마음 20만</span>
            <span>받은 마음 8만</span>
          </div>
        </div>
        <HistoryRow title="결혼" meta="2026.05.18 · 라움" amount="-10만" />
        <HistoryRow title="생일" meta="2026.03.02 · 메모 있음" amount="-2만" />
      </div>
    </div>
  );
}

function MySketch() {
  return (
    <div className="relative h-full overflow-hidden bg-white">
      <div className="h-full overflow-y-auto pb-24">
        <PhoneHeader
          title="MY"
          subtitle="계정, 이용 가능 횟수, 설정을 분리"
          action={<Settings size={22} className="text-slate-400" />}
        />
        <div className="space-y-5 px-5 pt-4">
          <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-black text-blue-700">
              토
            </div>
            <div>
              <p className="text-base font-black text-slate-950">토스 사용자</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">토스 계정 연결됨</p>
            </div>
          </div>
          <section>
            <p className="mb-2 text-xs font-black text-slate-400">이용 가능 횟수</p>
            <div className="grid grid-cols-2 gap-2">
              <CreditCard icon={Sparkles} title="AI 분석" value="3회" />
              <CreditCard icon={Download} title="대량 가져오기" value="1회" />
            </div>
          </section>
          <section>
            <p className="mb-2 text-xs font-black text-slate-400">나의 요약</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric icon={ArrowDownLeft} label="받은 마음" value="120만" />
              <Metric icon={ArrowUpRight} label="보낸 마음" value="85만" />
              <Metric icon={Wallet} label="합계" value="+35만" />
            </div>
          </section>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <Bell size={18} className="text-blue-600" />
              <div>
                <p className="text-sm font-black text-slate-950">리마인더 설정</p>
                <p className="text-xs font-semibold text-slate-400">행사 전날 알림을 받아요</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomNav active="my" />
    </div>
  );
}

function Segmented({ labels, active }: { labels: string[]; active: number }) {
  return (
    <div className="grid gap-1 rounded-lg bg-slate-200 p-1" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((label, index) => (
        <button
          type="button"
          key={label}
          className={`h-10 rounded-md text-xs font-black ${active === index ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function HomeMethodPanel({ method, onAnalyze }: { method: HomeInputMethod; onAnalyze: () => void }) {
  if (method === 'image') {
    return (
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-blue-600">
            <ImageIcon size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">이미지 업로드</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">청첩장·부고장 이미지를 읽어옵니다</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="h-10 rounded-md bg-white text-xs font-black text-blue-700">
            앨범에서 선택
          </button>
          <button type="button" className="h-10 rounded-md bg-white text-xs font-black text-blue-700">
            카메라로 촬영
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-md bg-white p-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-400">
            <ImageIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-slate-800">청첩장 이미지 1장</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">선명도 확인 완료</p>
          </div>
          <button type="button" onClick={onAnalyze} className="h-9 rounded-md bg-blue-600 px-3 text-xs font-black text-white">
            이미지 분석
          </button>
        </div>
        <StepFlow steps={['이미지 확인', 'OCR 읽기', '행사 정보 추출']} />
      </div>
    );
  }

  if (method === 'manual') {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-600">
            <PencilLine size={19} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-950">직접 입력</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">알고 있는 정보만 먼저 기록합니다</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniField label="이름" value="김민수 · 이서연" />
          <MiniField label="행사" value="결혼" />
          <MiniField label="날짜" value="5월 18일" />
          <MiniField label="금액" value="10만" />
        </div>
        <button type="button" onClick={onAnalyze} className="mt-3 h-10 w-full rounded-md bg-slate-900 text-xs font-black text-white">
          입력 내용 확인
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-blue-600">
          <LinkIcon size={19} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">링크 붙여넣기</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">초대장 페이지에서 핵심 정보를 찾습니다</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-md bg-white px-3 text-xs font-bold text-slate-500">
          <span className="truncate">https://mcard.kakao.com/invite/0526</span>
        </div>
        <button type="button" onClick={onAnalyze} className="h-11 rounded-md bg-blue-600 px-3 text-xs font-black text-white">
          링크 분석
        </button>
      </div>
      <StepFlow steps={['링크 확인', '페이지 읽기', '이름·날짜·계좌 추출']} />
    </div>
  );
}

function HomeResultSheet({ method, onClose }: { method: HomeInputMethod; onClose: () => void }) {
  const title = method === 'image' ? '이미지 분석 결과' : method === 'manual' ? '입력 내용 확인' : '링크 분석 결과';
  const source = method === 'image' ? '청첩장 이미지' : method === 'manual' ? '직접 입력' : '모바일 초대장 링크';

  return (
    <div className="absolute inset-0 z-30 bg-slate-950/35">
      <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label="결과 닫기" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-xl bg-white px-5 pb-6 pt-4 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge icon={Heart} label="결혼" className="border-rose-100 bg-rose-50 text-rose-600" />
            <h2 className="mt-3 text-xl font-black tracking-normal text-slate-950">{title}</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">{source}에서 추출</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">
            닫기
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <InfoBlock label="이름" value="김민수 · 이서연" />
          <InfoBlock label="날짜" value="2026.05.18" />
          <InfoBlock label="장소" value="더채플앳청담" />
          <InfoBlock label="계좌" value="신한 110" />
        </div>
        <AmountBox tone="blue" label="추천 금액" value="10만" />
        <button type="button" onClick={onClose} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-black text-white">
          <Check size={18} />
          기록 저장하기
        </button>
      </div>
    </div>
  );
}

function StepFlow({ steps }: { steps: string[] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {steps.map((step, index) => (
        <div key={step} className="rounded-md bg-white px-2 py-2 text-center">
          <div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-black text-blue-700">
            {index + 1}
          </div>
          <p className="mt-1 truncate text-[10px] font-black text-slate-500">{step}</p>
        </div>
      ))}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-slate-800">{value}</p>
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-2 rounded-md border text-slate-700 ${
        active ? 'border-blue-200 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <Icon size={20} className={active ? 'text-blue-600' : 'text-slate-500'} />
      <span className="text-xs font-black">{label}</span>
    </button>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <Icon size={16} className="text-slate-400" />
      <p className="mt-2 text-[11px] font-bold text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function RecordRow({ name, event, date, amount, tone }: { name: string; event: string; date: string; amount: string; tone: string }) {
  const isSolemn = tone === 'solemn';
  const isReceived = tone === 'received';
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${isSolemn ? 'bg-zinc-100 text-zinc-500' : isReceived ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
          {isSolemn ? <Flower2 size={17} /> : isReceived ? <ArrowDownLeft size={17} /> : <Heart size={17} />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{name}</p>
          <p className="text-xs font-semibold text-slate-400">{date} · {event}</p>
        </div>
      </div>
      <p className={`text-sm font-black ${isReceived ? 'text-emerald-600' : isSolemn ? 'text-zinc-700' : 'text-blue-600'}`}>
        {amount}
      </p>
    </div>
  );
}

function Badge({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-black ${className}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function AmountBox({ tone, label, value }: { tone: 'blue' | 'zinc'; label: string; value: string }) {
  const isBlue = tone === 'blue';
  return (
    <div className={`mt-3 rounded-lg border p-4 ${isBlue ? 'border-blue-100 bg-blue-50' : 'border-zinc-200 bg-zinc-50'}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-black ${isBlue ? 'text-blue-600' : 'text-zinc-500'}`}>{label}</p>
        <Sparkles size={15} className={isBlue ? 'text-blue-500' : 'text-zinc-400'} />
      </div>
      <div className="mt-2 flex items-end gap-1">
        <p className={`text-3xl font-black ${isBlue ? 'text-blue-700' : 'text-zinc-900'}`}>{value}</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {['-1만', '+1만', '+5만', '+10만'].map((item) => (
          <button type="button" key={item} className="h-8 rounded-md border border-white bg-white text-xs font-black text-slate-600">
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
      <Search size={16} className="text-slate-300" />
      <span className="text-sm font-semibold text-slate-300">{placeholder}</span>
    </div>
  );
}

function ScheduleRow({ icon: Icon, title, meta, amount, muted = false }: { icon: LucideIcon; title: string; meta: string; amount: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${muted ? 'bg-zinc-100 text-zinc-500' : 'bg-blue-50 text-blue-600'}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm font-black text-slate-950">{title}</p>
          <p className="text-xs font-semibold text-slate-400">{meta}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-black ${muted ? 'text-zinc-700' : 'text-blue-600'}`}>{amount}</p>
        <p className="text-[11px] font-bold text-slate-300">내보내기</p>
      </div>
    </div>
  );
}

function HistoryRow({ title, meta, amount, muted = false, received = false }: { title: string; meta: string; amount: string; muted?: boolean; received?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-950">{title}</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{meta}</p>
      </div>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-black ${received ? 'text-emerald-600' : muted ? 'text-zinc-700' : 'text-blue-600'}`}>{amount}</p>
        <ChevronRight size={15} className="text-slate-300" />
      </div>
    </div>
  );
}

function ContactRow({ name, relation, amount, favorite = false, muted = false }: { name: string; relation: string; amount: string; favorite?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-md ${favorite ? 'bg-amber-50 text-amber-600' : muted ? 'bg-zinc-100 text-zinc-500' : 'bg-blue-50 text-blue-600'}`}>
          {muted ? <Flower2 size={20} /> : <User size={20} />}
        </div>
        <div>
          <p className="text-sm font-black text-slate-950">{name}</p>
          <p className="text-xs font-semibold text-slate-400">{relation}</p>
        </div>
      </div>
      <p className={`text-sm font-black ${amount.startsWith('+') ? 'text-emerald-600' : muted ? 'text-zinc-700' : 'text-blue-600'}`}>{amount}</p>
    </div>
  );
}

function CreditCard({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <Icon size={17} className="text-blue-600" />
      <p className="mt-2 text-xs font-black text-blue-700">{title}</p>
      <p className="mt-1 text-2xl font-black text-blue-800">{value}</p>
      <button type="button" className="mt-3 h-8 w-full rounded-md bg-blue-600 text-xs font-black text-white">
        광고 보고 +1회
      </button>
    </div>
  );
}
