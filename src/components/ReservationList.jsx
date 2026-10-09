import { CheckCircle } from 'lucide-react';
import { formatMoney } from '../lib/format.js';
import { dueInfo } from '../lib/reservations.js';
import { DUE_TEXT } from '../lib/tones.js';

const OWNER_BADGE = {
  shared: { label: '共同', cls: 'bg-purple-100 text-purple-600' },
  bf: { label: '👦 男友', cls: 'bg-blue-100 text-blue-600' },
  gf: { label: '👧 女友', cls: 'bg-pink-100 text-pink-600' },
};

// 預留款清單：點一筆編輯，「付款了」帶進記一筆
const ReservationList = ({ reservations, today, readOnly, onEdit, onPay }) => (
  <div className="space-y-2">
    {reservations.map((r) => {
      const due = dueInfo(r.dueDate, today);
      const badge = OWNER_BADGE[r.owner];
      return (
        <div key={r.id} onClick={() => !readOnly && onEdit(r)} className={`flex items-center justify-between gap-2 p-3 rounded-xl bg-gray-50 ${readOnly ? '' : 'cursor-pointer active:bg-gray-100'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-gray-800 truncate">{r.name}</span>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${badge.cls}`}>{badge.label}</span>
            </div>
            <div className={`text-[11px] font-bold ${DUE_TEXT[due.tone]}`}>{due.text}</div>
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
);

export default ReservationList;
