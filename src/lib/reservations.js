// 預留款：預購、後付的東西先把錢「圈起來」，提醒這筆錢不能花掉。
// 存在帳本文件的 reservations 欄位，是以 id 為 key 的 map：
//   reservations: { [id]: { name, amount, category, owner, dueDate, createdAt } }
// 用 map 而不是陣列，兩個人同時改不同筆時 updateDoc('reservations.<id>') 不會互相覆蓋，離線也能寫。
// 純函式，不依賴 React 或 Firebase。
import { CATEGORIES } from './constants.js';

export const OWNERS = ['shared', 'bf', 'gf'];

export const normalizeReservations = (raw) =>
  Object.entries(raw || {})
    .map(([id, r]) => ({
      id,
      name: String(r?.name ?? '').trim() || '未命名',
      amount: Math.max(0, Math.round(Number(r?.amount) || 0)),
      category: CATEGORIES.some((c) => c.id === r?.category) ? r.category : 'shopping',
      owner: OWNERS.includes(r?.owner) ? r.owner : 'shared',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(r?.dueDate) ? r.dueDate : '',
      createdAt: Number(r?.createdAt) || 0,
    }))
    .filter((r) => r.amount > 0)
    // 有付款日的照日期先後，沒填日期的排最後；同一天照建立順序
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt - b.createdAt);

// 算進某個月預算的預留款：這個月（含之前，也就是逾期還沒付的）到期的，以及沒填付款日的。
// 下個月以後才付的不算進這個月，不然一筆大額預購就會讓每個月的預算都爆掉。
export const reservedForMonth = (reservations, monthKey) =>
  reservations.filter((r) => !r.dueDate || r.dueDate.slice(0, 7) <= monthKey);

export const sumAmount = (list) => list.reduce((acc, r) => acc + r.amount, 0);

// 'YYYY-MM-DD' 之間差幾天，用 UTC 午夜計算，避免日光節約／時區造成差一天
export const daysUntil = (dueDate, today) => {
  if (!dueDate) return null;
  const toUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(dueDate) - toUtc(today)) / 86400000);
};

// 付款時帶進「記一筆」的欄位：共同的照平分、個人的算那個人自己的
export const toTransactionPrefill = (r, currentRole, today) => ({
  amount: r.amount,
  note: r.name,
  category: r.category,
  date: today,
  paidBy: r.owner === 'shared' ? currentRole : r.owner,
  splitType: r.owner === 'shared' ? 'shared' : `${r.owner}_personal`,
});
