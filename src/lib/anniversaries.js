// 紀念日：存在 anniversaries_{coupleId} 集合 { name, date, type, createdAt }。
//   since     紀念日：從這天開始累計（在一起），顯示「已過 N 天」，並提醒 100 天、520 天、週年…
//   yearly    每年：生日這類每年同一天，顯示「還有 N 天」
//   countdown 倒數：單次的未來日子（旅行、演唱會），過了顯示「已過 N 天」
// 天數算法跟一般紀念日 App 一樣用相差天數：6/20 到 10/9 是「已過 111 天」。純函式。
import { daysBetween, addDays } from './calendar.js';

export const TYPES = [
  { id: 'since', label: '紀念日', hint: '從這天開始累計天數（在一起、結婚）' },
  { id: 'yearly', label: '每年', hint: '每年同一天（生日）' },
  { id: 'countdown', label: '倒數', hint: '單次的日子（旅行、演唱會）' },
];

// 除了每 100 天，這些天數也算值得紀念
export const SPECIAL_DAYS = [99, 111, 222, 333, 444, 520, 555, 666, 777, 888, 999, 1314, 2222, 3333, 5200];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const normalizeAnniversary = (raw) => ({
  id: raw.id,
  name: String(raw.name ?? '').trim() || '未命名',
  date: YMD.test(raw.date) ? raw.date : '',
  type: TYPES.some((t) => t.id === raw.type) ? raw.type : 'since',
  createdAt: Number(raw.createdAt) || 0,
});

// 加 n 年；2/29 在平年算 2/28
export const addYears = (ymd, n) => {
  const y = Number(ymd.slice(0, 4)) + n;
  const md = ymd.slice(5);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-${md === '02-29' && !leap ? '02-28' : md}`;
};

// [from, to] 之間的所有紀念時刻 → [{ date, label }]
const momentsIn = (a, from, to) => {
  if (!a.date) return [];
  const out = [];
  if (a.type === 'countdown') {
    if (a.date >= from && a.date <= to) out.push({ date: a.date, label: '就是今天' });
    return out;
  }
  const startYear = Number(a.date.slice(0, 4));
  for (let y = Math.max(Number(from.slice(0, 4)), startYear + 1); y <= Number(to.slice(0, 4)); y++) {
    const d = addYears(a.date, y - startYear);
    if (d >= from && d <= to) out.push({ date: d, label: a.type === 'since' ? `${y - startYear} 週年` : '' });
  }
  if (a.type === 'since') {
    const lo = Math.max(1, daysBetween(a.date, from));
    const hi = daysBetween(a.date, to);
    const counts = new Set(SPECIAL_DAYS.filter((n) => n >= lo && n <= hi));
    for (let n = Math.ceil(lo / 100) * 100; n <= hi; n += 100) counts.add(n);
    for (const n of counts) out.push({ date: addDays(a.date, n), label: `${n} 天` });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
};

// 卡片上顯示的主要數字
export const summaryOf = (a, today) => {
  if (a.type === 'since') {
    const n = daysBetween(a.date, today);
    return n >= 0 ? { text: `已過 ${n} 天`, days: n } : { text: `還有 ${-n} 天開始`, days: n };
  }
  if (a.type === 'countdown') {
    const n = daysBetween(today, a.date);
    return { text: n > 0 ? `還有 ${n} 天` : n === 0 ? '就是今天' : `已過 ${-n} 天`, days: n };
  }
  const next = nextMoment(a, today);
  return { text: next.daysLeft === 0 ? '就是今天' : `還有 ${next.daysLeft} 天`, days: next.daysLeft };
};

// 下一個（含今天）紀念時刻；countdown 過了就沒有下一個
export const nextMoment = (a, today) => {
  if (!a.date) return null;
  if (a.type === 'countdown') return a.date >= today ? { date: a.date, label: '', daysLeft: daysBetween(today, a.date) } : null;
  // since 還沒開始的話，第一個時刻就是開始那天
  if (a.type === 'since' && a.date >= today) return { date: a.date, label: '第一天', daysLeft: daysBetween(today, a.date) };
  const found = momentsIn(a, today, addDays(today, 400))[0];
  return found ? { ...found, daysLeft: daysBetween(today, found.date) } : null;
};

// 「即將到來」：withinDays 天內（含今天）的紀念時刻，近的排前面
export const upcoming = (list, today, withinDays = 30) =>
  list
    .map((a) => ({ a, next: nextMoment(a, today) }))
    .filter(({ next }) => next && next.daysLeft <= withinDays)
    .sort((x, y) => x.next.daysLeft - y.next.daysLeft);

// 日曆格子用：某段期間內每天有哪些紀念時刻
export const momentsByDate = (list, from, to) => {
  const map = {};
  for (const a of list) {
    for (const m of momentsIn(a, from, to)) (map[m.date] ||= []).push({ id: a.id, name: a.name, label: m.label });
  }
  return map;
};

// 排序：nearest 依下一個紀念時刻；date 依原始日期（舊的在前）
export const sortAnniversaries = (list, today, mode) => {
  if (mode === 'date') return [...list].sort((x, y) => x.date.localeCompare(y.date));
  const key = (a) => nextMoment(a, today)?.daysLeft ?? Infinity;
  return [...list].sort((x, y) => key(x) - key(y) || x.date.localeCompare(y.date));
};
