import { Lock, Plus, CheckCircle } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import { daysUntil, sumAmount } from '../lib/reservations.js';

const OWNER_BADGE = {
  shared: { label: '共同', cls: 'bg-purple-100 text-purple-600' },
  bf: { label: '👦 男友', cls: 'bg-blue-100 text-blue-600' },
  gf: { label: '👧 女友', cls: 'bg-pink-100 text-pink-600' },
};

const dueText = (dueDate, today) => {
  const days = daysUntil(dueDate, today);
  if (days === null) return { text: '未定付款日', cls: 'text-gray-400' };
  const md = `${Number(dueDate.slice(5, 7))}/${Number(dueDate.slice(8, 10))}`;
  if (days < 0) return { text: `${md}・已逾期 ${-days} 天`, cls: 'text-red-500' };
  if (days === 0) return { text: `${md}・今天要付`, cls: 'text-orange-500' };
  if (days <= 7) return { text: `${md}・還有 ${days} 天`, cls: 'text-orange-500' };
  return { text: `${md}・還有 ${days} 天`, cls: 'text-gray-400' };
};

// 總覽頁的「預留款」：預購、後付的東西先把錢圈起來，提醒這筆錢不能花掉
const ReservationsCard = ({ reservations, thisMonth, today, readOnly, onAdd, onEdit, onPay }) => {
  if (reservations.length === 0) {
    if (readOnly) return null;
    return (
      <button type="button" onClick={onAdd} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-400 flex items-center justify-center gap-1.5 active:scale-[.98] transition-transform">
        <Lock size={14} /> 預留待付款（預購、後付的東西先把錢圈起來）
      </button>
    );
  }

  const later = sumAmount(reservations) - sumAmount(thisMonth);

  return (
    <div className="bg-surface p-4 rounded-2xl shadow-xs border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Lock size={14} /> 預留款・共 {formatMoney(sumAmount(reservations))}</span>
        {!readOnly && <button type="button" onClick={onAdd} className="text-[11px] font-bold text-gray-500 flex items-center gap-0.5"><Plus size={12} />新增</button>}
      </div>
      <div className="space-y-2">
        {reservations.map((r) => {
          const due = dueText(r.dueDate, today);
          const badge = OWNER_BADGE[r.owner];
          return (
            <div key={r.id} onClick={() => !readOnly && onEdit(r)} className={`flex items-center justify-between gap-2 p-3 rounded-xl bg-gray-50 ${readOnly ? '' : 'cursor-pointer active:bg-gray-100'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-gray-800 truncate">{r.name}</span>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className={`text-[11px] font-bold ${due.cls}`}>{due.text}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black text-gray-800">{formatMoney(r.amount)}</span>
                {!readOnly && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onPay(r); }} className="px-2.5 py-1.5 rounded-lg bg-gray-900 text-surface text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform">
                    <CheckCircle size={12} />付款了
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {later > 0 && <p className="text-[10px] text-gray-400">下個月以後才付的 {formatMoney(later)} 不算進本月預算。</p>}
    </div>
  );
};

export default ReservationsCard;
