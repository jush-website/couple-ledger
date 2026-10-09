// 每月預算：存在帳本文件的 budget 欄位 { total, categories: { food: 8000, ... } }。
// 舊帳本沒有這個欄位＝沒設預算，其他欄位完全不變。
// 純函式，不依賴 React 或 Firebase。
import { CATEGORIES } from './constants.js';
import { formatMoney } from './format.js';

// 用到八成就提醒，超過就警告
export const WARN_RATIO = 0.8;

const positive = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

export const normalizeBudget = (raw) => {
  const categories = {};
  for (const c of CATEGORIES) {
    const limit = positive(raw?.categories?.[c.id]);
    if (limit) categories[c.id] = limit;
  }
  return { total: positive(raw?.total), categories };
};

export const hasBudget = (budget) => {
  const b = normalizeBudget(budget);
  return b.total > 0 || Object.keys(b.categories).length > 0;
};

const levelOf = (spent, limit) => (spent > limit ? 'over' : spent >= limit * WARN_RATIO ? 'warn' : 'ok');

// monthKey 是 'YYYY-MM'。直接比日期字串的前綴：交易的 date 本來就是 'YYYY-MM-DD'，
// 不經過 new Date() 就不會有時區換算把月底算到下個月的問題。
// reserved（選填）：算進這個月的預留款 [{ amount, category }]。它們還沒花，但錢已經被圈起來，
// 所以跟已花的加在一起判斷快不快超支；available 就是「還能自由花用」的錢。
export const getBudgetStatus = (transactions, budget, monthKey, reserved = []) => {
  const b = normalizeBudget(budget);
  const spentBy = {};
  let spent = 0;
  for (const t of transactions) {
    if (t.category === 'repayment' || !(t.date || '').startsWith(monthKey)) continue;
    const amt = Number(t.amount) || 0;
    spent += amt;
    spentBy[t.category] = (spentBy[t.category] || 0) + amt;
  }

  const reservedBy = {};
  let reservedTotal = 0;
  for (const r of reserved) {
    reservedTotal += r.amount;
    reservedBy[r.category] = (reservedBy[r.category] || 0) + r.amount;
  }

  const categories = CATEGORIES.filter((c) => b.categories[c.id]).map((c) => {
    const limit = b.categories[c.id];
    const catSpent = spentBy[c.id] || 0;
    const catReserved = reservedBy[c.id] || 0;
    return {
      id: c.id, name: c.name, color: c.color, spent: catSpent, reserved: catReserved, limit,
      ratio: catSpent / limit, reservedRatio: catReserved / limit, level: levelOf(catSpent + catReserved, limit),
    };
  });

  return {
    spent,
    reserved: reservedTotal,
    total: b.total,
    available: b.total - spent - reservedTotal,
    ratio: b.total ? spent / b.total : 0,
    reservedRatio: b.total ? reservedTotal / b.total : 0,
    level: b.total ? levelOf(spent + reservedTotal, b.total) : 'ok',
    categories,
  };
};

// used = 已花＋預留；有預留款時「還剩」改叫「可自由花用」，強調圈起來的錢不能動
export const remainingText = (used, limit, hasReserved) =>
  used > limit ? `超支 ${formatMoney(used - limit)}` : `${hasReserved ? '可自由花用' : '還剩'} ${formatMoney(limit - used)}`;

export const monthKeyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
