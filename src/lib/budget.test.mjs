// node src/lib/budget.test.mjs
import assert from 'node:assert/strict';
import { normalizeBudget, hasBudget, getBudgetStatus, monthKeyOf } from './budget.js';

// 正規化：負數、字串、不存在的分類都要處理掉
assert.deepEqual(normalizeBudget({ total: '20000', categories: { food: 8000, bogus: 100, transport: -5, house: '' } }), { total: 20000, categories: { food: 8000 } });
assert.deepEqual(normalizeBudget(undefined), { total: 0, categories: {} });
assert.equal(hasBudget(undefined), false);
assert.equal(hasBudget({ total: 0, categories: { food: 1 } }), true);

const tx = [
  { date: '2026-09-01', amount: 5000, category: 'food' },
  { date: '2026-09-30', amount: 2000, category: 'food' },
  { date: '2026-09-15', amount: 1000, category: 'transport' },
  { date: '2026-09-10', amount: 9999, category: 'repayment' }, // 還款不算支出
  { date: '2026-10-01', amount: 7000, category: 'food' },       // 別的月份
  { date: '2026-08-31', amount: 7000, category: 'food' },
];
const s = getBudgetStatus(tx, { total: 10000, categories: { food: 8000, transport: 900 } }, '2026-09');
assert.equal(s.spent, 8000);
assert.equal(s.level, 'warn'); // 8000 / 10000 = 80%
assert.deepEqual(s.categories.map((c) => [c.id, c.spent, c.level]), [['food', 7000, 'warn'], ['transport', 1000, 'over']]);

// 沒設總預算時 level 固定 ok，只看分類
assert.equal(getBudgetStatus(tx, { categories: { food: 100000 } }, '2026-09').level, 'ok');
assert.equal(getBudgetStatus(tx, { total: 20000 }, '2026-09').level, 'ok');

assert.equal(monthKeyOf(new Date(2026, 0, 5)), '2026-01');
console.log('budget.js OK');
