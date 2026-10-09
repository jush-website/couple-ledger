// node src/lib/reservations.test.mjs
import assert from 'node:assert/strict';
import { normalizeReservations, reservedForMonth, sumAmount, daysUntil, dueInfo, toTransactionPrefill } from './reservations.js';

const list = normalizeReservations({
  c: { name: '演唱會門票', amount: 6800, category: 'entertainment', owner: 'shared', dueDate: '2026-11-20', createdAt: 3 },
  a: { name: '手機預購', amount: '32900', owner: 'bf', dueDate: '2026-10-15', createdAt: 1 },
  b: { name: '  ', amount: 500, category: 'bogus', owner: 'nobody', dueDate: 'soon', createdAt: 2 },
  z: { name: '零元', amount: 0 },
});
// 照付款日排序、沒日期的最後；0 元濾掉；欄位正規化
assert.deepEqual(list.map((r) => r.id), ['a', 'c', 'b']);
assert.equal(list[0].amount, 32900);
assert.equal(list[0].category, 'shopping');
assert.deepEqual([list[2].name, list[2].category, list[2].owner, list[2].dueDate], ['未命名', 'shopping', 'shared', '']);
assert.deepEqual(normalizeReservations(undefined), []);

// 10 月：10 月到期的＋沒日期的；11 月才到期的不算
assert.deepEqual(reservedForMonth(list, '2026-10').map((r) => r.id), ['a', 'b']);
assert.equal(sumAmount(reservedForMonth(list, '2026-10')), 33400);
// 11 月：逾期沒付的 10 月那筆也還要算
assert.deepEqual(reservedForMonth(list, '2026-11').map((r) => r.id), ['a', 'c', 'b']);

assert.equal(daysUntil('2026-10-15', '2026-10-08'), 7);
assert.equal(daysUntil('2026-10-01', '2026-10-08'), -7);
assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1);
assert.equal(daysUntil('', '2026-10-08'), null);

assert.deepEqual(toTransactionPrefill(list[0], 'gf', '2026-10-08'), { amount: 32900, note: '手機預購', category: 'shopping', date: '2026-10-08', paidBy: 'bf', splitType: 'bf_personal' });
assert.deepEqual(toTransactionPrefill(list[1], 'gf', '2026-10-08').splitType, 'shared');
assert.deepEqual(toTransactionPrefill(list[1], 'gf', '2026-10-08').paidBy, 'gf');

assert.deepEqual(dueInfo('2026-10-15', '2026-10-08'), { text: '10/15・還有 7 天', tone: 'soon' });
assert.deepEqual(dueInfo('2026-10-16', '2026-10-08').tone, 'normal');
assert.deepEqual(dueInfo('2026-10-08', '2026-10-08'), { text: '10/8・今天要付', tone: 'soon' });
assert.deepEqual(dueInfo('2026-10-05', '2026-10-08'), { text: '10/5・已逾期 3 天', tone: 'late' });
assert.deepEqual(dueInfo('', '2026-10-08').tone, 'none');

console.log('reservations.js OK');
