// node src/lib/dailySpend.test.mjs
import assert from 'node:assert/strict';
import { spendingByDate, compactMoney } from './dailySpend.js';

const tx = [
  { date: '2026-10-09', amount: 311, category: 'food' },
  { date: '2026-10-09', amount: '120', category: 'transport' },
  { date: '2026-10-09', amount: 3000, category: 'repayment' }, // 還款不算
  { date: '2026-10-02', amount: 5812, category: 'food' },
  { date: '2026-11-01', amount: 99, category: 'food' },         // 範圍外
  { date: '', amount: 50, category: 'food' },
];
assert.deepEqual(spendingByDate(tx, '2026-09-27', '2026-10-31'), { '2026-10-09': 431, '2026-10-02': 5812 });

assert.equal(compactMoney(0), '$0');
assert.equal(compactMoney(431), '$431');
assert.equal(compactMoney(9999.6), '1萬');
assert.equal(compactMoney(5812), '$5,812');
assert.equal(compactMoney(12000), '1.2萬');
assert.equal(compactMoney(30000), '3萬');
assert.equal(compactMoney(1234567), '123萬');

console.log('dailySpend.js OK');
