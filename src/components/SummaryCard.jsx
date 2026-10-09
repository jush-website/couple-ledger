import { useState } from 'react';
import { CheckCircle, RefreshCw, Target, Lock, Plus, ChevronDown, AlertTriangle } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import { getBudgetStatus, hasBudget, remainingText } from '../lib/budget.js';
import { dueInfo, sumAmount } from '../lib/reservations.js';
import { LEVEL_TEXT, DUE_TEXT } from '../lib/tones.js';
import { BudgetBar, BudgetTotal, BudgetCategories } from './BudgetCard.jsx';
import ReservationList from './ReservationList.jsx';

// 收合狀態跟著裝置走（存 localStorage），預設收合
const STORAGE_KEY = 'overview-summary-expanded';
const readExpanded = () => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; } };
const writeExpanded = (v) => { try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch { /* 無痕模式寫不進去就算了 */ } };

const LEVEL_WORD = { warn: '快用完', over: '超支' };

// 總覽頁最上方的摘要：結算＋本月預算＋預留款合成一張卡。
// 收合時每項只剩一行，但「快超支」「快到期」的顏色照樣顯示，不會因為收起來就看不到警示；
// 展開才列出分類預算明細、預留款清單與新增按鈕。
const SummaryCard = ({
  debt, readOnly, onRepay,
  transactions, budget, monthKey, onEditBudget,
  reservations, reservedThisMonth, today, onAddReservation, onEditReservation, onPayReservation,
}) => {
  const [expanded, setExpanded] = useState(readExpanded);
  const toggle = () => setExpanded((v) => { writeExpanded(!v); return !v; });

  const settled = Math.abs(debt) < 1;
  const showBudget = hasBudget(budget);
  const status = showBudget ? getBudgetStatus(transactions, budget, monthKey, reservedThisMonth) : null;
  const alertCats = status ? status.categories.filter((c) => c.level !== 'ok') : [];
  const hasReservations = reservations.length > 0;
  const nearest = hasReservations ? reservations[0] : null; // 已照付款日排序
  const nearestDue = nearest ? dueInfo(nearest.dueDate, today) : null;
  const laterAmount = sumAmount(reservations) - sumAmount(reservedThisMonth);
  // 唯讀（封存帳本）又沒有預算和預留時，展開也沒東西可看
  const canExpand = !readOnly || showBudget || hasReservations;

  return (
    <div className="bg-surface rounded-3xl shadow-xs border border-gray-100 relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-1 ${settled ? 'bg-green-400' : (debt > 0 ? 'bg-blue-400' : 'bg-pink-400')}`} />

      {/* 結算 */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-gray-400 mb-0.5">本帳本結算</div>
          {settled
            ? <div className="text-xl font-black text-green-500 flex items-center gap-1.5"><CheckCircle size={20} /> 互不相欠</div>
            : <div className="flex items-baseline gap-1.5 flex-wrap"><span className={`text-xl font-black ${debt > 0 ? 'text-blue-500' : 'text-pink-500'}`}>{debt > 0 ? '男朋友' : '女朋友'}</span><span className="text-gray-400 text-xs">先墊了</span><span className="text-xl font-black text-gray-800">{formatMoney(Math.abs(debt))}</span></div>}
        </div>
        {!settled && !readOnly && (
          <button type="button" onClick={() => onRepay(debt)} className="shrink-0 px-3 py-2 bg-gray-900 text-surface text-xs font-bold rounded-xl shadow-md active:scale-95 transition-transform flex items-center gap-1.5"><RefreshCw size={14} /> 登記還款</button>
        )}
      </div>

      {/* 本月預算 */}
      {showBudget && (
        <div className="px-5 py-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1"><Target size={13} /> 本月預算</span>
            {expanded && !readOnly && <button type="button" onClick={onEditBudget} className="text-[10px] font-bold text-gray-400 underline">調整</button>}
          </div>
          {status.total > 0 && (expanded
            ? <BudgetTotal status={status} />
            : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-800">{formatMoney(status.spent)} <span className="text-gray-400 font-medium">/ {formatMoney(status.total)}</span></span>
                  <span className={LEVEL_TEXT[status.level]}>{remainingText(status.spent + status.reserved, status.total, status.reserved > 0)}</span>
                </div>
                <BudgetBar ratio={status.ratio} reservedRatio={status.reservedRatio} level={status.level} thin />
              </div>
            ))}
          {expanded
            ? status.categories.length > 0 && <BudgetCategories categories={status.categories} />
            : alertCats.length > 0 && (
              <div className="text-[11px] font-bold flex flex-wrap gap-x-2 gap-y-0.5">
                {alertCats.map((c) => <span key={c.id} className={`flex items-center gap-0.5 ${LEVEL_TEXT[c.level]}`}><AlertTriangle size={11} />{c.name}{LEVEL_WORD[c.level]}</span>)}
              </div>
            )}
        </div>
      )}

      {/* 預留款 */}
      {(hasReservations || (expanded && !readOnly)) && (
        <div className="px-5 py-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1 shrink-0"><Lock size={13} /> 預留款{hasReservations && `・${reservations.length} 筆 ${formatMoney(sumAmount(reservations))}`}</span>
            {expanded
              ? !readOnly && <button type="button" onClick={onAddReservation} className="text-[11px] font-bold text-gray-500 flex items-center gap-0.5"><Plus size={12} />新增</button>
              : nearest && <span className={`text-[11px] font-bold truncate ${DUE_TEXT[nearestDue.tone]}`}>{nearest.name} {nearestDue.text}</span>}
          </div>
          {expanded && (hasReservations
            ? <>
                <ReservationList reservations={reservations} today={today} readOnly={readOnly} onEdit={onEditReservation} onPay={onPayReservation} />
                {laterAmount > 0 && <p className="text-[10px] text-gray-400">下個月以後才付的 {formatMoney(laterAmount)} 不算進本月預算。</p>}
              </>
            : <button type="button" onClick={onAddReservation} className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-400">預購、後付的東西先把錢圈起來</button>)}
        </div>
      )}

      {/* 沒設預算時，展開後給一個入口 */}
      {expanded && !showBudget && !readOnly && (
        <div className="px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onEditBudget} className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-400 flex items-center justify-center gap-1.5"><Target size={14} /> 設定每月預算</button>
        </div>
      )}

      {canExpand && (
        <button type="button" onClick={toggle} aria-expanded={expanded} className="w-full py-2 border-t border-gray-100 text-[11px] font-bold text-gray-400 flex items-center justify-center gap-1 active:bg-gray-50">
          {expanded ? '收合' : '展開明細'}<ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};

export default SummaryCard;
