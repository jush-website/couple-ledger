import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Plus, Heart, CalendarDays, Link2 } from 'lucide-react';
import ModalLayout from './ModalLayout.jsx';
import EventModal from './EventModal.jsx';
import AnniversaryModal from './AnniversaryModal.jsx';
import AnniversaryList from './AnniversaryList.jsx';
import CalendarFeedsModal from './CalendarFeedsModal.jsx';
import { fetchFeedEvents } from '../lib/icalFeed.js';
import { monthGrid, shiftMonth, lunarLabel, holidaysOf, WEEKDAYS, weekdayOf, todayYmd } from '../lib/calendar.js';
import { expandEvents, groupByDate, colorHex } from '../lib/events.js';
import { momentsByDate } from '../lib/anniversaries.js';
import { spendingByDate, compactMoney } from '../lib/dailySpend.js';
import { formatMoney } from '../lib/format.js';
import { CATEGORIES } from '../lib/constants.js';

const FILTER_KEY = 'calendar-filter';
const DEFAULT_FILTER = { owners: ['shared', 'bf', 'gf'], holidays: true, anniversaries: true, spending: true };
const readFilter = () => {
  try { return { ...DEFAULT_FILTER, ...JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') }; } catch { return DEFAULT_FILTER; }
};
const OWNER_LABEL = { shared: '共同', bf: '男友', gf: '女友' };
const MAX_CHIPS = 3;
const NO_FEEDS = []; // 固定的空陣列：預設值每次都 new [] 的話，下面的 effect 會一直重跑

// 格子裡的一個標籤：節日、紀念日、行程共用。格子很窄，最多折成兩行，時間＋名稱才看得到
const Chip = ({ className = '', style, children }) => (
  <div className={`text-[10px] leading-[1.3] font-bold px-1 py-px rounded break-all line-clamp-2 ${className}`} style={style}>{children}</div>
);

// 一天裡要顯示的東西，依序：節日 → 紀念日 → 行程 → 連結的 Google 日曆
const itemsOf = (date, { holidays, moments, events, feeds = {} }) => [
  ...holidays.map((h) => ({ key: `h-${h.name}`, kind: 'holiday', h })),
  ...(moments[date] || []).map((m) => ({ key: `a-${m.id}-${m.label}`, kind: 'moment', m })),
  ...(events[date] || []).map((e) => ({ key: `e-${e.id}`, kind: 'event', e })),
  ...(feeds[date] || []).map((f) => ({ key: `f-${f.feedId}-${f.id}`, kind: 'feed', f })),
];

const ChipFor = ({ item }) => {
  if (item.kind === 'holiday') return <Chip className={item.h.dayOff ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-600'}>{item.h.name}</Chip>;
  if (item.kind === 'moment') return <Chip className="bg-pink-100 text-pink-600">♥{item.m.label || item.m.name}</Chip>;
  const e = item.kind === 'feed' ? item.f : item.e;
  return <Chip className="text-white" style={{ backgroundColor: colorHex(e.color) }}>{e.time ? `${e.time.replace(/^0/, '')} ` : ''}{e.title}</Chip>;
};

// transactions：目前帳本的記帳紀錄（跟總覽、統計同一本），用來顯示每日開銷
// feeds：連結的 Google 日曆（共用，兩人都看得到）{ id, name, url, owner, color }
const CalendarView = ({ events, anniversaries, transactions = [], bookName, role, onSaveEvent, onDeleteEvent, onSkipEventDay, onSaveAnniversary, onDeleteAnniversary, feeds = NO_FEEDS, onSaveFeed, onDeleteFeed }) => {
  const today = todayYmd();
  const [mode, setMode] = useState('calendar'); // calendar | anniversary
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [filter, setFilter] = useState(readFilter);
  const [showFilter, setShowFilter] = useState(false);
  const [dayOpen, setDayOpen] = useState(null);       // 打開明細的那一天
  const [eventModal, setEventModal] = useState(null); // { initial, defaultDate, occurrence }
  const [annModal, setAnnModal] = useState(null);     // { initial }
  const [showFeeds, setShowFeeds] = useState(false);
  const [feedEvents, setFeedEvents] = useState({});   // feedId → [{ id, title, date, time }]
  const [feedErrors, setFeedErrors] = useState({});   // feedId → 錯誤訊息
  const touchX = useRef(null);

  const updateFilter = (patch) => setFilter((f) => {
    const next = { ...f, ...patch };
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* 寫不進去就算了 */ }
    return next;
  });
  const toggleOwner = (o) => updateFilter({ owners: filter.owners.includes(o) ? filter.owners.filter((x) => x !== o) : [...filter.owners, o] });

  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const from = grid[0].date;
  const to = grid[grid.length - 1].date;
  const eventsByDate = useMemo(() => groupByDate(expandEvents(events, from, to, filter.owners)), [events, from, to, filter.owners]);
  const moments = useMemo(() => (filter.anniversaries ? momentsByDate(anniversaries, from, to) : {}), [anniversaries, from, to, filter.anniversaries]);
  // 每日開銷：整個格子範圍（含前後月補的那幾天）一次算好
  const spending = useMemo(() => spendingByDate(transactions, from, to), [transactions, from, to]);
  const monthPrefix = `${ym.y}-${String(ym.m).padStart(2, '0')}`;
  const monthTotal = Object.entries(spending).reduce((sum, [d, v]) => (d.startsWith(monthPrefix) ? sum + v : sum), 0);
  // 連結的 Google 日曆：換月份或日曆清單變了就重抓（有 5 分鐘快取）
  useEffect(() => {
    let cancelled = false;
    for (const feed of feeds) {
      fetchFeedEvents(feed, from, to)
        .then((data) => {
          if (cancelled) return;
          setFeedEvents((m) => ({ ...m, [feed.id]: data.events || [] }));
          setFeedErrors((m) => ({ ...m, [feed.id]: data.stale ? '目前離線，顯示上次的資料' : '' }));
        })
        .catch((e) => { if (!cancelled) setFeedErrors((m) => ({ ...m, [feed.id]: e.message || '讀取失敗' })); });
    }
    return () => { cancelled = true; };
  }, [feeds, from, to]);
  const feedsByDate = useMemo(() => {
    const map = {};
    for (const feed of feeds) {
      if (!filter.owners.includes(feed.owner)) continue;
      for (const ev of feedEvents[feed.id] || []) (map[ev.date] ||= []).push({ ...ev, feedId: feed.id, feedName: feed.name, color: feed.color, owner: feed.owner });
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [feeds, feedEvents, filter.owners]);
  const feedTrouble = feeds.some((f) => feedErrors[f.id] && !feedErrors[f.id].startsWith('目前離線'));
  const holidaysFor = (date) => (filter.holidays ? holidaysOf(date) : []);
  const go = (delta) => setYm((c) => shiftMonth(c.y, c.m, delta));
  const goToday = () => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const filtered = filter.owners.length < 3 || !filter.holidays || !filter.anniversaries;

  const closeEvent = () => setEventModal(null);
  const closeAnn = () => setAnnModal(null);
  const dayExpenses = dayOpen ? transactions.filter((t) => t.date === dayOpen && t.category !== 'repayment') : [];
  const dayItems = dayOpen ? itemsOf(dayOpen, { holidays: holidaysOf(dayOpen), moments: momentsByDate(anniversaries, dayOpen, dayOpen), events: groupByDate(expandEvents(events, dayOpen, dayOpen)), feeds: feedsByDate }) : [];

  return (
    <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex bg-gray-100 rounded-xl p-1 text-sm font-bold">
        <button type="button" onClick={() => setMode('calendar')} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${mode === 'calendar' ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400'}`}><CalendarDays size={16} />日曆</button>
        <button type="button" onClick={() => setMode('anniversary')} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${mode === 'anniversary' ? 'bg-surface text-gray-800 shadow-xs' : 'text-gray-400'}`}><Heart size={16} />紀念日</button>
      </div>

      {mode === 'calendar' ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button type="button" onClick={() => setShowFilter(true)} aria-label="篩選" className={`p-2 rounded-xl ${filtered ? 'bg-gray-800 text-surface' : 'text-gray-500'}`}><Filter size={18} /></button>
              <button type="button" onClick={() => setShowFeeds(true)} aria-label="連結 Google 日曆" className="relative p-2 rounded-xl text-gray-500"><Link2 size={18} />{feedTrouble && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}</button>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => go(-1)} aria-label="上個月" className="p-2 text-gray-500"><ChevronLeft size={20} /></button>
              {/* 透明的月份選擇器疊在標題上：點標題就能直接跳到某年某月 */}
              <label className="relative text-lg font-black text-gray-800 px-1">
                {ym.y}年{ym.m}月
                <input type="month" aria-label="選擇月份" value={`${ym.y}-${String(ym.m).padStart(2, '0')}`} onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); if (y && m) setYm({ y, m }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <button type="button" onClick={() => go(1)} aria-label="下個月" className="p-2 text-gray-500"><ChevronRight size={20} /></button>
            </div>
            <button type="button" onClick={goToday} className="px-3 py-1.5 rounded-xl bg-surface border border-gray-200 text-xs font-bold text-gray-600">今天</button>
          </div>

          {filter.spending && (
            <div className="flex items-center justify-between px-1 text-xs font-bold text-gray-500">
              <span className="truncate">「{bookName || '目前帳本'}」{ym.m}月支出</span>
              <span className="text-gray-800 shrink-0">{formatMoney(monthTotal)}</span>
            </div>
          )}
          <div className="bg-surface rounded-2xl border border-gray-100 shadow-xs overflow-hidden"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => { if (touchX.current === null) return; const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); }}>
            <div className="grid grid-cols-7 text-center text-[11px] font-bold border-b border-gray-100">
              {WEEKDAYS.map((w, i) => <div key={w} className={`py-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>週{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {grid.map(({ date, inMonth }) => {
                const holidays = holidaysFor(date);
                const items = itemsOf(date, { holidays, moments, events: eventsByDate, feeds: feedsByDate });
                const dow = weekdayOf(date);
                const red = dow === 0 || holidays.some((h) => h.dayOff);
                const isToday = date === today;
                return (
                  <button key={date} type="button" onClick={() => setDayOpen(date)} className={`min-h-[88px] border-b border-r border-gray-100 p-0.5 text-left align-top flex flex-col gap-0.5 ${inMonth ? '' : 'opacity-35'} ${isToday ? 'bg-orange-50' : ''}`}>
                    <div className="flex items-baseline gap-0.5 px-0.5">
                      <span className={`text-xs font-black ${isToday ? 'bg-orange-400 text-white rounded-full w-5 h-5 flex items-center justify-center' : red ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-800'}`}>{Number(date.slice(8))}</span>
                      <span className="text-[9px] text-gray-400 truncate">{lunarLabel(date)}</span>
                    </div>
                    {items.slice(0, MAX_CHIPS).map((item) => <ChipFor key={item.key} item={item} />)}
                    {items.length > MAX_CHIPS && <span className="text-[9px] font-bold text-gray-400 px-1">+{items.length - MAX_CHIPS}</span>}
                    {filter.spending && spending[date] > 0 && <span className="mt-auto text-right text-[10px] font-black text-gray-600 px-0.5 truncate">{compactMoney(spending[date])}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 text-center">左右滑動換月份・點日期看當天明細。補假與調整放假請以行政院公告為準。</p>
        </>
      ) : (
        <AnniversaryList anniversaries={anniversaries} today={today} onAdd={() => setAnnModal({ initial: null })} onEdit={(a) => setAnnModal({ initial: a })} />
      )}

      <button type="button" onClick={() => (mode === 'calendar' ? setEventModal({ initial: null, defaultDate: today }) : setAnnModal({ initial: null }))} aria-label={mode === 'calendar' ? '新增行程' : '新增紀念日'} className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-2xl bg-gray-900 text-surface shadow-xl flex items-center justify-center active:scale-90 transition-transform"><Plus size={26} /></button>

      {showFilter && (
        <ModalLayout title="篩選" onClose={() => setShowFilter(false)}>
          <div className="space-y-4 pt-1">
            <div>
              <div className="text-xs font-bold text-gray-400 mb-2">顯示誰的行程</div>
              <div className="flex gap-2">
                {['shared', 'bf', 'gf'].map((o) => (
                  <button key={o} type="button" onClick={() => toggleOwner(o)} className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 ${filter.owners.includes(o) ? 'border-gray-800 bg-gray-800 text-surface' : 'border-gray-200 text-gray-400'}`}>{OWNER_LABEL[o]}</button>
                ))}
              </div>
            </div>
            {[['spending', '顯示每日開銷'], ['holidays', '顯示節日與國定假日'], ['anniversaries', '顯示紀念日']].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm font-bold text-gray-700">
                {label}<input type="checkbox" checked={filter[key]} onChange={(e) => updateFilter({ [key]: e.target.checked })} className="w-5 h-5" />
              </label>
            ))}
            <button type="button" onClick={() => { updateFilter(DEFAULT_FILTER); setShowFilter(false); }} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm">全部顯示</button>
          </div>
        </ModalLayout>
      )}

      {showFeeds && (
        <CalendarFeedsModal feeds={feeds} errors={feedErrors} role={role} onClose={() => setShowFeeds(false)}
          onSave={(data) => onSaveFeed(null, data)} onDelete={(id) => onDeleteFeed(id)} />
      )}

      {dayOpen && !eventModal && (
        <ModalLayout title={`${Number(dayOpen.slice(5, 7))}月${Number(dayOpen.slice(8))}日 週${WEEKDAYS[weekdayOf(dayOpen)]}${lunarLabel(dayOpen) ? `・農曆${lunarLabel(dayOpen)}` : ''}`} onClose={() => setDayOpen(null)}>
          <div className="space-y-2 pt-1">
            {dayItems.length === 0 && dayExpenses.length === 0 && <p className="text-center text-sm text-gray-400 py-6">這天還沒有行程</p>}
            {dayItems.map((item) => {
              if (item.kind === 'holiday') return <div key={item.key} className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 text-sm font-bold"><span className={`w-2 h-2 rounded-full ${item.h.dayOff ? 'bg-red-500' : 'bg-orange-400'}`} />{item.h.name}{item.h.dayOff && <span className="text-[10px] text-red-500">國定假日</span>}</div>;
              if (item.kind === 'moment') return <div key={item.key} className="flex items-center gap-2 p-3 rounded-xl bg-pink-50 text-sm font-bold text-pink-600"><Heart size={14} />{item.m.name}{item.m.label && `・${item.m.label}`}</div>;
              if (item.kind === 'feed') {
                const f = item.f;
                return (
                  <div key={item.key} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <span className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: colorHex(f.color) }} />
                    <span className="text-xs font-bold text-gray-500 w-11 shrink-0">{f.time || '整天'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-gray-800 truncate">{f.title}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{OWNER_LABEL[f.owner]}・{f.feedName}（Google 日曆，唯讀）</span>
                    </span>
                  </div>
                );
              }
              const e = item.e;
              return (
                <button key={item.key} type="button" onClick={() => setEventModal({ initial: e, defaultDate: dayOpen, occurrence: dayOpen })} className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-left active:bg-gray-100">
                  <span className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: colorHex(e.color) }} />
                  <span className="text-xs font-bold text-gray-500 w-11 shrink-0">{e.time || '整天'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-gray-800 truncate">{e.title}</span>
                    <span className="block text-[11px] text-gray-400 truncate">{OWNER_LABEL[e.owner]}{e.repeat !== 'none' && '・重複'}{e.note && `・${e.note}`}</span>
                  </span>
                </button>
              );
            })}
            {dayExpenses.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-gray-400 px-1">
                  <span>當日開銷・{dayExpenses.length} 筆</span>
                  <span className="text-gray-800">{formatMoney(dayExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0))}</span>
                </div>
                {dayExpenses.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORIES.find((c) => c.id === t.category)?.color || '#999' }} />
                      <span className="font-bold text-gray-800 truncate">{t.note || CATEGORIES.find((c) => c.id === t.category)?.name || '未分類'}</span>
                      <span className={`text-[11px] shrink-0 ${t.paidBy === 'bf' ? 'text-blue-500' : 'text-pink-500'}`}>{t.paidBy === 'bf' ? '男友付' : '女友付'}</span>
                    </span>
                    <span className="font-bold text-gray-800 shrink-0">{formatMoney(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setEventModal({ initial: null, defaultDate: dayOpen })} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 flex items-center justify-center gap-1"><Plus size={16} />在這天新增行程</button>
          </div>
        </ModalLayout>
      )}

      {eventModal && (
        <EventModal initialData={eventModal.initial} defaultDate={eventModal.defaultDate} occurrence={eventModal.occurrence} role={role} onClose={closeEvent}
          onSave={(data) => { onSaveEvent(eventModal.initial?.id || null, data); closeEvent(); }}
          onDelete={(id) => onDeleteEvent(id, closeEvent)}
          onSkipDay={(id, date) => onSkipEventDay(id, date, closeEvent)} />
      )}
      {annModal && (
        <AnniversaryModal initialData={annModal.initial} defaultDate={today} onClose={closeAnn}
          onSave={(data) => { onSaveAnniversary(annModal.initial?.id || null, data); closeAnn(); }}
          onDelete={(id) => onDeleteAnniversary(id, closeAnn)} />
      )}
    </div>
  );
};

export default CalendarView;
