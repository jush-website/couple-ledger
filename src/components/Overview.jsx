import { useMemo } from 'react';
import { Plus, Trash2, RefreshCw, CheckCircle, Camera, Mic } from 'lucide-react';
import { formatMoney, calculateExpense } from '../lib/format.js';
import { CATEGORIES } from '../lib/constants.js';
import { isVoiceSupported } from '../lib/speech.js';
import { monthKeyOf } from '../lib/budget.js';
import BudgetCard from './BudgetCard.jsx';
import ReservationsCard from './ReservationsCard.jsx';

const Overview = ({ transactions, budget, onEditBudget, reservations = [], reservedThisMonth = [], today, onAddReservation, onEditReservation, onPayReservation, onAdd, onEdit, onDelete, onScan, onVoice, onRepay, readOnly }) => {
  const debt = useMemo(() => {
    let bfLent = 0;
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.category === 'repayment') { t.paidBy === 'bf' ? bfLent += amt : bfLent -= amt; } else {
        let gfShare = 0, bfShare = 0;
        if ((t.splitType === 'custom' || t.splitType === 'ratio') && t.splitDetails) { gfShare = Number(t.splitDetails.gf) || 0; bfShare = Number(t.splitDetails.bf) || 0; } else if (t.splitType === 'shared') { gfShare = amt / 2; bfShare = amt / 2; } else if (t.splitType === 'gf_personal') { gfShare = amt; } else if (t.splitType === 'bf_personal') { bfShare = amt; }
        if (t.paidBy === 'bf') bfLent += gfShare; else bfLent -= bfShare;
      }
    });
    return bfLent;
  }, [transactions]);
  
  const grouped = useMemo(() => {
    const groups = {};
    transactions.forEach(t => { if (!t.date) return; if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [transactions]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
      <div className="bg-surface p-6 rounded-3xl shadow-xs border border-gray-100 text-center relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-1 ${Math.abs(debt) < 1 ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`}></div>
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">本帳本結算</h2>
        <div className="flex items-center justify-center gap-2">{Math.abs(debt) < 1 ? <div className="text-2xl font-black text-green-500 flex items-center gap-2"><CheckCircle /> 互不相欠</div> : <><span className={`text-3xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男朋友' : '女朋友'}</span><span className="text-gray-400 text-sm">先墊了</span><span className="text-2xl font-bold text-gray-800">{formatMoney(Math.abs(debt))}</span></>}</div>
        {Math.abs(debt) >= 1 && !readOnly && (<button onClick={() => onRepay(debt)} className="mt-4 px-6 py-2 bg-gray-900 text-surface text-sm font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center gap-2 mx-auto"><RefreshCw size={16} /> 登記還款</button>)}
      </div>
      <BudgetCard transactions={transactions} budget={budget} monthKey={monthKeyOf(new Date())} compact onEdit={readOnly ? undefined : onEditBudget} reserved={reservedThisMonth} />
      <ReservationsCard reservations={reservations} thisMonth={reservedThisMonth} today={today} readOnly={readOnly} onAdd={onAddReservation} onEdit={onEditReservation} onPay={onPayReservation} />
      <div className="space-y-4">
        <div className="flex justify-between items-end px-2"><h3 className="font-bold text-lg text-gray-800">最近紀錄</h3>{!readOnly && (<div className="flex gap-2">{isVoiceSupported() && (<button onClick={onVoice} aria-label="語音記帳" className="bg-purple-100 text-purple-600 p-3 rounded-xl shadow-xs active:scale-90 transition-transform"><Mic size={20} /></button>)}<button onClick={onScan} aria-label="掃描收據" className="bg-purple-100 text-purple-600 p-3 rounded-xl shadow-xs active:scale-90 transition-transform"><Camera size={20} /></button><button onClick={onAdd} className="bg-gray-900 text-surface p-3 rounded-xl shadow-lg shadow-gray-300 active:scale-90 transition-transform"><Plus size={20} /></button></div>)}</div>
        {grouped.length === 0 ? <div className="text-center py-10 text-gray-400">本帳本還沒有紀錄喔</div> : grouped.map(([date, items]) => {
            const daily = items.reduce((acc, t) => { const { bf, gf } = calculateExpense(t); return { bf: acc.bf + bf, gf: acc.gf + gf }; }, { bf: 0, gf: 0 });
            return (
            <div key={date} className="space-y-2">
              <div className="flex items-center justify-between mb-2 mt-4 px-2"><div className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{date}</div><div className="flex gap-3 text-xs font-bold bg-surface px-2 py-1 rounded-full border border-gray-100 shadow-xs"><span className="text-blue-600 flex items-center gap-1">👦 {formatMoney(daily.bf)}</span><span className="text-gray-300">|</span><span className="text-pink-600 flex items-center gap-1">👧 {formatMoney(daily.gf)}</span></div></div>
              {items.map(t => (
                <div key={t.id} onClick={() => onEdit(t)} className={`bg-surface p-4 rounded-2xl shadow-xs border border-gray-50 flex items-center justify-between transition-colors ${readOnly ? '' : 'active:bg-gray-50 cursor-pointer'}`}>
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-surface shadow-xs" style={{ backgroundColor: CATEGORIES.find(c => c.id === t.category)?.color || '#999' }}>{t.category === 'repayment' ? <RefreshCw size={18} /> : (t.category === 'food' ? <span className="text-lg">🍔</span> : <span className="text-lg">🏷️</span>)}</div>
                    <div className="min-w-0 flex-1"><div className="font-bold text-gray-800 truncate">{t.note || (CATEGORIES.find(c => c.id === t.category)?.name || '未知')}</div><div className="text-xs text-gray-400 flex gap-1 truncate"><span className={t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}>{t.paidBy === 'bf' ? '男友付' : '女友付'}</span><span>•</span><span>{t.category === 'repayment' ? '還款結清' : (t.splitType === 'shared' ? '平分' : (t.splitType === 'bf_personal' ? '男友個人' : (t.splitType === 'gf_personal' ? '女友個人' : (t.splitType === 'ratio' ? `比例 (${Math.round((t.splitDetails?.bf / (Number(t.amount)||1))*100)}%)` : '自訂分帳'))))}</span></div></div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0"><span className={`font-bold text-lg ${t.category === 'repayment' ? 'text-green-500' : 'text-gray-800'}`}>{formatMoney(t.amount)}</span>{!readOnly && <button onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} className="text-gray-300 hover:text-red-400 p-1"><Trash2 size={16} /></button>}</div>
                </div>
              ))}
            </div>
          )})}
      </div>
    </div>
  );
};

export default Overview;
