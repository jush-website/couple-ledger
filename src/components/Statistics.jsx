import { useState, useMemo } from 'react';
import { Calendar, X, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import { CATEGORIES } from '../lib/constants.js';
import SimpleDonutChart from './SimpleDonutChart.jsx';
import BudgetCard from './BudgetCard.jsx';
import { monthKeyOf } from '../lib/budget.js';
import { calculateExpense } from '../lib/format.js';

const Statistics = ({ transactions, budget }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  // 搜尋範圍：本月（跟著上面的月份）或全部月份，例如「今年吃了幾次火鍋」
  const [searchScope, setSearchScope] = useState('month');
  const isSearching = !!searchQuery.trim();
  const searchAll = isSearching && searchScope === 'all';
  
  const monthTransactions = useMemo(() => transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear() && t.category !== 'repayment'; }), [transactions, currentDate]);
  const monthlyTotals = useMemo(() => { return monthTransactions.reduce((acc, t) => { const { bf, gf } = calculateExpense(t); return { bf: acc.bf + bf, gf: acc.gf + gf }; }, { bf: 0, gf: 0 }); }, [monthTransactions]);
  const chartData = useMemo(() => { const map = {}; let total = 0; monthTransactions.forEach(t => { const amt = Number(t.amount) || 0; if (!map[t.category]) map[t.category] = 0; map[t.category] += amt; total += amt; }); return { data: Object.entries(map).map(([id, value]) => ({ id, value, color: CATEGORIES.find(c => c.id === id)?.color || '#999', name: CATEGORIES.find(c => c.id === id)?.name || '未知' })).sort((a, b) => b.value - a.value), total }; }, [monthTransactions]);
  
  const changeMonth = (delta) => { const newDate = new Date(currentDate); newDate.setMonth(newDate.getMonth() + delta); setCurrentDate(newDate); setSearchQuery(''); };

  const allExpenses = useMemo(() => transactions.filter(t => t.category !== 'repayment'), [transactions]);

  const searchedMonthTransactions = useMemo(() => {
      if (!searchQuery.trim()) return monthTransactions;
      const lowerQ = searchQuery.toLowerCase();
      return (searchAll ? allExpenses : monthTransactions).filter(t => {
          const note = t.note || '';
          const catName = CATEGORIES.find(c => c.id === t.category)?.name || '';
          return note.toLowerCase().includes(lowerQ) || catName.toLowerCase().includes(lowerQ);
      });
  }, [monthTransactions, allExpenses, searchAll, searchQuery]);

  const groupedMonthTransactions = useMemo(() => { const groups = {}; searchedMonthTransactions.forEach(t => { if (!t.date) return; if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); }); return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0])); }, [searchedMonthTransactions]);

  const searchTotals = useMemo(() => {
      if (!searchQuery.trim()) return null;
      return searchedMonthTransactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  }, [searchedMonthTransactions, searchQuery]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
      <div className="flex items-center justify-between bg-surface p-4 rounded-2xl shadow-xs"><button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button><span className="font-bold text-lg">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</span><button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button></div>
      <BudgetCard transactions={transactions} budget={budget} monthKey={monthKeyOf(currentDate)} title={`${currentDate.getMonth() + 1}月預算`} />
      <div className="flex gap-3 px-1"><div className="flex-1 bg-surface p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-blue-400"></div><span className="text-xs font-bold text-gray-400 mb-1">👦 男友本月花費</span><span className="text-xl font-black text-blue-600">{formatMoney(monthlyTotals.bf)}</span></div><div className="flex-1 bg-surface p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-pink-400"></div><span className="text-xs font-bold text-gray-400 mb-1">👧 女友本月花費</span><span className="text-xl font-black text-pink-600">{formatMoney(monthlyTotals.gf)}</span></div></div>
      <div className="bg-surface p-6 rounded-3xl shadow-xs border border-gray-100 flex flex-col items-center"><SimpleDonutChart data={chartData.data} total={chartData.total} /><div className="flex flex-wrap gap-2 justify-center mt-4">{chartData.data.map(d => (<div key={d.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-100"><div className="w-2 h-2 rounded-full" style={{ background: d.color }}></div><span>{d.name}</span><span className="font-bold">{chartData.total ? Math.round(d.value / chartData.total * 100) : 0}%</span></div>))}</div></div>
      <div className="bg-surface rounded-3xl shadow-xs border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-gray-400"/>
              <h3 className="font-bold text-gray-700">{searchAll ? '全部月份搜尋結果' : '本月詳細紀錄'}</h3>
            </div>
            {isSearching && (
              <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">{searchedMonthTransactions.length} 筆・{formatMoney(searchTotals)}</span>
            )}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋備註或分類..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-sm font-medium focus:outline-hidden focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          {isSearching && (
            <div className="flex gap-2 text-xs font-bold">
              {[{ id: 'month', label: `${currentDate.getMonth() + 1}月` }, { id: 'all', label: '全部月份' }].map(opt => (
                <button key={opt.id} type="button" onClick={() => setSearchScope(opt.id)} className={`px-3 py-1 rounded-full border transition-all ${searchScope === opt.id ? 'bg-gray-800 text-surface border-gray-800' : 'bg-surface text-gray-500 border-gray-200'}`}>{opt.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="divide-y divide-gray-100">
            {groupedMonthTransactions.length === 0 ? (
               <div className="p-8 text-center text-gray-400 text-sm">{searchQuery ? '找不到符合的紀錄' : '尚無消費紀錄'}</div>
            ) : (
                groupedMonthTransactions.map(([date, items]) => { const daily = items.reduce((acc, t) => { const { bf, gf } = calculateExpense(t); return { bf: acc.bf + bf, gf: acc.gf + gf }; }, { bf: 0, gf: 0 }); return (<div key={date}><div className="bg-gray-50/50 px-4 py-2 flex justify-between items-center border-b border-gray-50"><span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{date.split('-')[1]}/{date.split('-')[2]}</span><div className="flex gap-3 text-xs font-bold"><span className="text-blue-600">👦 {formatMoney(daily.bf)}</span><span className="text-pink-600">👧 {formatMoney(daily.gf)}</span></div></div>{items.map(t => (<div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50"><div className="flex items-center gap-3"><div><div className="font-bold text-sm text-gray-800">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div><div className="text-xs text-gray-400" style={{ color: CATEGORIES.find(c => c.id === t.category)?.color }}>{CATEGORIES.find(c => c.id === t.category)?.name || '其他'}</div></div></div><div className="font-bold text-gray-700">{formatMoney(t.amount)}</div></div>))}</div>); })
            )}
        </div>
      </div>
    </div>
  );
};

export default Statistics;
