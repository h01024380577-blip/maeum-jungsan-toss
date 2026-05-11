'use client';

/**
 * MY 탭 내부의 통계 섹션.
 * 기존 StatisticsTab의 차트/요약/상세 리스트를 프레젠테이션 단위로 이관.
 * 헤더/페이지 레이아웃 책임은 상위(MyPageTab)에 둔다.
 */

import { useState } from 'react';
import { useStore } from '@/src/store/useStore';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { formatAmountMan, formatSignedAmountMan } from '@/src/utils/amountFormat';

const INCOME_COLORS = ['#2563eb', '#059669', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c'];
const EXPENSE_COLORS = ['#dc2626', '#f97316', '#7c3aed', '#0d9488', '#2563eb', '#db2777', '#ca8a04'];

const eventLabel = (n: string) =>
  n === 'wedding' ? '결혼' : n === 'funeral' ? '부고' : n === 'birthday' ? '생일' : n === 'other' ? '기타' : n;

export default function StatsOverview() {
  const { entries } = useStore();
  const [tab, setTab] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');

  const filtered = entries.filter((e) => e.type === tab);
  const colors = tab === 'INCOME' ? INCOME_COLORS : EXPENSE_COLORS;

  const totalIncome = entries.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0);
  const totalExpense = entries.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalExpense;

  const byEventType = filtered.reduce((acc: { name: string; value: number }[], e) => {
    const label = eventLabel(e.eventType);
    const f = acc.find((x) => x.name === label);
    if (f) f.value += e.amount;
    else acc.push({ name: label, value: e.amount });
    return acc;
  }, []);

  const byRelation = filtered.reduce((acc: { name: string; value: number }[], e) => {
    const f = acc.find((x) => x.name === e.relation);
    if (f) f.value += e.amount;
    else acc.push({ name: e.relation || '미분류', value: e.amount });
    return acc;
  }, []);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
        <div className="bg-blue-50 rounded-2xl p-3.5 text-center">
          <ArrowDownLeft size={14} className="text-blue-500 mx-auto mb-1" />
          <p className="text-[10px] font-bold text-blue-400">받은 마음</p>
          <p className="text-base font-black text-blue-600">
            {formatAmountMan(totalIncome)}
          </p>
        </div>
        <div className="bg-red-50 rounded-2xl p-3.5 text-center">
          <ArrowUpRight size={14} className="text-red-400 mx-auto mb-1" />
          <p className="text-[10px] font-bold text-red-400">보낸 마음</p>
          <p className="text-base font-black text-red-500">
            {formatAmountMan(totalExpense)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 text-center border border-gray-100">
          <Wallet size={14} className="text-gray-400 mx-auto mb-1" />
          <p className="text-[10px] font-bold text-gray-400">합계</p>
          <p
            className={`text-base font-black ${
              balance >= 0 ? 'text-blue-600' : 'text-red-500'
            }`}
          >
            {formatSignedAmountMan(balance)}
          </p>
        </div>
      </div>

      {/* 탭 토글 */}
      <div className="flex bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setTab('INCOME')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            tab === 'INCOME' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'
          }`}
        >
          받은 마음
        </button>
        <button
          onClick={() => setTab('EXPENSE')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            tab === 'EXPENSE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'
          }`}
        >
          보낸 마음
        </button>
      </div>

      {filtered.length > 0 ? (
        <>
          {/* 원형 차트 */}
          <div className="bg-white p-5 rounded-[24px] border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              행사 종류별 비중
            </h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byEventType}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {byEventType.map((_, i) => (
                      <Cell
                        key={i}
                        fill={colors[i % colors.length]}
                        stroke="#ffffff"
                        strokeWidth={3}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatAmountMan(Number(v))}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center flex-wrap gap-3">
              {byEventType.map((item, i) => (
                <div key={i} className="flex items-center space-x-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: colors[i % colors.length] }}
                  />
                  <span className="text-[11px] font-medium text-gray-500">
                    {eventLabel(item.name)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 막대 차트 */}
          <div className="bg-white p-5 rounded-[24px] border border-gray-100 space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              관계별 금액
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byRelation} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    width={80}
                    tick={{ fontSize: 11, fontWeight: 600, fill: '#9ca3af' }}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    formatter={(v) => [formatAmountMan(Number(v)), '합계']}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={20}>
                    {byRelation.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 상세 리스트 */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
              상세 요약
            </h3>
            {byEventType.map((item, i) => (
              <div
                key={i}
                className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colors[i % colors.length] }}
                  />
                  <p className="text-sm font-bold text-gray-900">
                    {eventLabel(item.name)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-black ${
                      tab === 'INCOME' ? 'text-blue-600' : 'text-red-500'
                    }`}
                  >
                    {formatAmountMan(item.value)}
                  </p>
                  <p className="text-[9px] text-gray-300">
                    {total > 0 ? Math.round((item.value / total) * 100) : 0}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white p-14 rounded-2xl border border-dashed border-gray-200 text-center">
          <p className="text-sm text-gray-300">데이터가 없습니다</p>
        </div>
      )}
    </div>
  );
}
