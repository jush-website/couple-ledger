import { Target, AlertTriangle } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import { getBudgetStatus, hasBudget } from '../lib/budget.js';

const BAR = { ok: 'bg-green-500', warn: 'bg-orange-400', over: 'bg-red-500' };
const TEXT = { ok: 'text-green-600', warn: 'text-orange-500', over: 'text-red-500' };

// 預留款畫成同色的斜線段，接在已花的後面：一眼看出「花掉的＋圈起來的」佔了多少
const STRIPES = { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 3px, transparent 3px 6px)' };
const Bar = ({ ratio, reservedRatio = 0, level, thin }) => {
  const spentPct = Math.min(ratio * 100, 100);
  const reservedPct = Math.min(reservedRatio * 100, 100 - spentPct);
  return (
    <div className={`w-full bg-gray-100 rounded-full overflow-hidden flex ${thin ? 'h-1.5' : 'h-2.5'}`}>
      <div className={`h-full transition-all duration-500 ${BAR[level]}`} style={{ width: `${spentPct}%` }} />
      {reservedPct > 0 && <div className={`h-full transition-all duration-500 opacity-60 ${BAR[level]}`} style={{ width: `${reservedPct}%`, ...STRIPES }} />}
    </div>
  );
};

// used = 已花＋預留；有預留款時「還剩」改叫「可自由花用」，強調圈起來的錢不能動
const remainingText = (used, limit, hasReserved) =>
  used > limit ? `超支 ${formatMoney(used - limit)}` : `${hasReserved ? '可自由花用' : '還剩'} ${formatMoney(limit - used)}`;

// compact：總覽頁只列出快用完或超支的分類；統計頁列出全部有設定的分類
// reserved：算進這個月的預留款（只有總覽頁的「本月」會傳）
const BudgetCard = ({ transactions, budget, monthKey, title = '本月預算', compact = false, onEdit, reserved = [] }) => {
  if (!hasBudget(budget)) return null;
  const status = getBudgetStatus(transactions, budget, monthKey, reserved);
  const categories = compact ? status.categories.filter((c) => c.level !== 'ok') : status.categories;
  if (compact && !status.total && categories.length === 0) return null;

  return (
    <div className="bg-surface p-4 rounded-2xl shadow-xs border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Target size={14} /> {title}</span>
        {onEdit && <button type="button" onClick={onEdit} className="text-[10px] font-bold text-gray-400 underline">調整</button>}
      </div>
      {status.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-end justify-between">
            <span className="text-lg font-black text-gray-800">{formatMoney(status.spent)} <span className="text-xs font-bold text-gray-400">/ {formatMoney(status.total)}</span></span>
            <span className={`text-xs font-bold ${TEXT[status.level]}`}>{remainingText(status.spent + status.reserved, status.total, status.reserved > 0)}</span>
          </div>
          <Bar ratio={status.ratio} reservedRatio={status.reservedRatio} level={status.level} />
          {status.reserved > 0 && <div className="text-[10px] font-bold text-gray-400">已花 {formatMoney(status.spent)}・預留 {formatMoney(status.reserved)}（斜線）</div>}
        </div>
      )}
      {categories.length > 0 && (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-gray-600">
                  {c.level !== 'ok' && <AlertTriangle size={12} className={TEXT[c.level]} />}
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />{c.name}
                  <span className="text-gray-400 font-medium">{formatMoney(c.spent)}{c.reserved > 0 && `＋預留${formatMoney(c.reserved)}`} / {formatMoney(c.limit)}</span>
                </span>
                <span className={TEXT[c.level]}>{remainingText(c.spent + c.reserved, c.limit, c.reserved > 0)}</span>
              </div>
              <Bar ratio={c.ratio} reservedRatio={c.reservedRatio} level={c.level} thin />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BudgetCard;
