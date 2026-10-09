import { useState } from 'react';
import { Heart } from 'lucide-react';
import { summaryOf, nextMoment, upcoming, sortAnniversaries, TYPES } from '../lib/anniversaries.js';
import { WEEKDAYS, weekdayOf } from '../lib/calendar.js';

const SORT_KEY = 'anniversary-sort';
const readSort = () => { try { return localStorage.getItem(SORT_KEY) === 'date' ? 'date' : 'nearest'; } catch { return 'nearest'; } };
const md = (ymd) => `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8))}日`;
const whenText = (daysLeft) => (daysLeft === 0 ? '今天' : daysLeft === 1 ? '明天' : `${daysLeft} 天後`);

// 紀念日清單：上面「即將到來」（30 天內），下面全部；點一筆編輯
const AnniversaryList = ({ anniversaries, today, onAdd, onEdit }) => {
  const [sort, setSort] = useState(readSort);
  const changeSort = (v) => { setSort(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* 寫不進去就算了 */ } };
  const soon = upcoming(anniversaries, today, 30);
  const sorted = sortAnniversaries(anniversaries, today, sort);

  if (anniversaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
        <Heart size={40} className="opacity-30" />
        <p className="text-sm">記下在一起的日子、生日或旅行倒數</p>
        <button type="button" onClick={onAdd} className="px-4 py-2 bg-gray-900 text-surface rounded-xl text-sm font-bold">新增紀念日</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {soon.length > 0 && (
        <div className="bg-surface border border-gray-100 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="text-xs font-bold text-pink-500">即將到來</div>
          {soon.map(({ a, next }) => (
            <button key={a.id} type="button" onClick={() => onEdit(a)} className="w-full flex items-center gap-3 text-left">
              <div className="w-12 h-12 shrink-0 rounded-full border-2 border-pink-100 flex flex-col items-center justify-center leading-none">
                <span className="text-[9px] font-bold text-pink-400">{Number(next.date.slice(5, 7))}月</span>
                <span className="text-base font-black text-gray-800">{Number(next.date.slice(8))}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-800 truncate">{a.name}</div>
                {next.label && <div className="text-xs font-bold text-pink-500">{next.label}</div>}
              </div>
              <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${next.daysLeft === 0 ? 'bg-pink-500 text-surface' : 'bg-pink-50 text-pink-500'}`}>{whenText(next.daysLeft)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-gray-400">全部紀念日・{anniversaries.length}</span>
        <select value={sort} onChange={(e) => changeSort(e.target.value)} className="text-xs font-bold text-gray-500 bg-transparent outline-hidden">
          <option value="nearest">依最近排序</option>
          <option value="date">依日期排序</option>
        </select>
      </div>

      <div className="space-y-2">
        {sorted.map((a) => {
          const sum = summaryOf(a, today);
          const next = nextMoment(a, today);
          const typeLabel = TYPES.find((t) => t.id === a.type)?.label;
          return (
            <button key={a.id} type="button" onClick={() => onEdit(a)} className="w-full bg-surface border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-3 text-left shadow-xs active:bg-gray-50">
              <div className="min-w-0">
                <div className="font-bold text-gray-800 truncate">{a.name}</div>
                <div className="text-xs text-gray-400">{a.type === 'countdown' ? '' : '自 '}{md(a.date)} 週{WEEKDAYS[weekdayOf(a.date)]}・{typeLabel}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-black text-gray-800">{sum.text}</div>
                {next && a.type === 'since' && (
                  <div className="mt-1 inline-block px-2 py-0.5 rounded-full bg-pink-50 text-pink-500 text-[11px] font-bold">{next.label} {whenText(next.daysLeft)}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AnniversaryList;
