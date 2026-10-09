// 行事曆事件：存在 events_{coupleId} 集合，一筆文件一個事件（重複的事件也只存一筆）。
//   { title, date, time, owner, color, repeat, until, exceptions, note, createdAt }
//   repeat：none | weekly | monthly | yearly；until：重複到哪天（含），空字串＝不限
//   exceptions：重複事件裡被單獨刪掉的那幾天
// 畫面要顯示某段期間時，用 expandEvents 展開成一天一筆。純函式。
import { addDays, daysBetween } from './calendar.js';

export const OWNERS = ['shared', 'bf', 'gf'];
export const REPEATS = [
  { id: 'none', label: '不重複' },
  { id: 'weekly', label: '每週' },
  { id: 'monthly', label: '每月' },
  { id: 'yearly', label: '每年' },
];
// 事件顏色是資料色（跟主題無關），跟 CATEGORIES 一樣寫死
export const EVENT_COLORS = [
  { id: 'amber', hex: '#E0A93B' },
  { id: 'red', hex: '#E5484D' },
  { id: 'coral', hex: '#E07A5F' },
  { id: 'purple', hex: '#9B7FD4' },
  { id: 'blue', hex: '#4A90D9' },
  { id: 'green', hex: '#52A86E' },
  { id: 'gray', hex: '#A3A09A' },
];
export const colorHex = (id) => (EVENT_COLORS.find((c) => c.id === id) || EVENT_COLORS[0]).hex;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;

export const normalizeEvent = (raw) => ({
  id: raw.id,
  title: String(raw.title ?? '').trim() || '未命名',
  date: raw.date,
  time: HM.test(raw.time) ? raw.time : '',
  owner: OWNERS.includes(raw.owner) ? raw.owner : 'shared',
  color: EVENT_COLORS.some((c) => c.id === raw.color) ? raw.color : EVENT_COLORS[0].id,
  repeat: REPEATS.some((r) => r.id === raw.repeat) ? raw.repeat : 'none',
  until: YMD.test(raw.until) ? raw.until : '',
  exceptions: Array.isArray(raw.exceptions) ? raw.exceptions.filter((d) => YMD.test(d)) : [],
  note: String(raw.note ?? ''),
});

// 某個事件在 [from, to] 之間發生的日期
const occurrenceDates = (e, from, to) => {
  const end = e.until && e.until < to ? e.until : to;
  if (e.date > end) return [];
  if (e.repeat === 'none') return e.date >= from ? [e.date] : [];

  const out = [];
  if (e.repeat === 'weekly') {
    const skip = e.date < from ? Math.ceil(daysBetween(e.date, from) / 7) * 7 : 0;
    for (let d = addDays(e.date, skip); d <= end; d = addDays(d, 7)) out.push(d);
    return out;
  }
  // 每月／每年：同一個「日」（每年還要同月）。那個月沒有這一天（31 號、2/29）就跳過，不挪到別天
  const [, sm, sd] = e.date.split('-');
  let y = Number(from.slice(0, 4));
  let m = e.repeat === 'yearly' ? Number(sm) : Number(from.slice(5, 7));
  if (e.repeat === 'yearly' && `${y}-${sm}` < from.slice(0, 7)) y += 1;
  for (let guard = 0; guard < 400; guard++) {
    const d = `${y}-${String(m).padStart(2, '0')}-${sd}`;
    if (d > end) break;
    const valid = !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).getUTCDate() === Number(sd);
    if (valid && d >= from && d >= e.date) out.push(d);
    if (e.repeat === 'yearly') y += 1;
    else { m += 1; if (m > 12) { m = 1; y += 1; } }
  }
  return out;
};

// 展開成 [{ ...event, on: 'YYYY-MM-DD' }]，依日期、時間排序（全天的排在有時間的前面）
export const expandEvents = (events, from, to, owners = OWNERS) =>
  events
    .filter((e) => owners.includes(e.owner))
    .flatMap((e) => occurrenceDates(e, from, to).filter((d) => !e.exceptions.includes(d)).map((on) => ({ ...e, on })))
    .sort((a, b) => a.on.localeCompare(b.on) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title));

export const groupByDate = (occurrences) => {
  const map = {};
  for (const o of occurrences) (map[o.on] ||= []).push(o);
  return map;
};
