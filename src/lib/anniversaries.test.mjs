// node src/lib/anniversaries.test.mjs
import assert from 'node:assert/strict';
import { normalizeAnniversary, summaryOf, nextMoment, upcoming, momentsByDate, sortAnniversaries, addYears } from './anniversaries.js';

const a = (o) => normalizeAnniversary({ id: o.name, ...o });
const together = a({ name: '在一起', date: '2026-06-20', type: 'since' });

// 跟截圖一致：10/9 是第 111 天，也是 111 天紀念
assert.equal(summaryOf(together, '2026-10-09').text, '已過 111 天');
assert.deepEqual(nextMoment(together, '2026-10-09'), { date: '2026-10-09', label: '111 天', daysLeft: 0 });
// 隔天：下一個是 200 天（2027-01-06）
assert.deepEqual(nextMoment(together, '2026-10-10'), { date: '2027-01-06', label: '200 天', daysLeft: 88 });
// 一週年與 1314 天
assert.equal(momentsByDate([together], '2027-06-01', '2027-06-30')['2027-06-20'][0].label, '1 週年');
assert.equal(momentsByDate([together], '2030-01-01', '2030-01-31')['2030-01-24']?.[0].label, '1314 天');
// 還沒開始的紀念日
assert.deepEqual(nextMoment(a({ name: 'x', date: '2026-12-01', type: 'since' }), '2026-10-09').label, '第一天');

// 每年（生日）：今年過了就算明年；2/29 平年用 2/28
const bday = a({ name: '生日', date: '1998-03-15', type: 'yearly' });
assert.deepEqual(nextMoment(bday, '2026-10-09'), { date: '2027-03-15', label: '', daysLeft: 157 });
assert.equal(summaryOf(bday, '2027-03-15').text, '就是今天');
assert.equal(addYears('2024-02-29', 1), '2025-02-28');
assert.equal(addYears('2024-02-29', 4), '2028-02-29');

// 倒數
const trip = a({ name: '日本', date: '2026-12-24', type: 'countdown' });
assert.equal(summaryOf(trip, '2026-10-09').text, '還有 76 天');
assert.equal(summaryOf(trip, '2026-12-30').text, '已過 6 天');
assert.equal(nextMoment(trip, '2026-12-30'), null);

// 即將到來（30 天內）、排序
assert.deepEqual(upcoming([trip, together, bday], '2026-10-09').map((u) => u.a.name), ['在一起']);
assert.deepEqual(upcoming([trip, together, bday], '2026-11-30').map((u) => u.a.name), ['日本']);
assert.deepEqual(sortAnniversaries([bday, trip, together], '2026-10-09', 'nearest').map((x) => x.name), ['在一起', '日本', '生日']);
assert.deepEqual(sortAnniversaries([trip, together, bday], '2026-10-09', 'date').map((x) => x.name), ['生日', '在一起', '日本']);

console.log('anniversaries.js OK');
