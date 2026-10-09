// node src/lib/events.test.mjs
import assert from 'node:assert/strict';
import { normalizeEvent, expandEvents, groupByDate, colorHex } from './events.js';

const ev = (o) => normalizeEvent({ id: o.id || 'x', title: 't', ...o });
const days = (list) => list.map((o) => o.on);

// 單次事件
assert.deepEqual(days(expandEvents([ev({ date: '2026-10-13' })], '2026-10-01', '2026-10-31')), ['2026-10-13']);
assert.deepEqual(days(expandEvents([ev({ date: '2026-11-01' })], '2026-10-01', '2026-10-31')), []);

// 每週：從 9/29（週二）開始，10 月的週二；until 截止；單獨刪掉 10/20
const weekly = ev({ date: '2026-09-29', repeat: 'weekly', until: '2026-10-27', exceptions: ['2026-10-20'] });
assert.deepEqual(days(expandEvents([weekly], '2026-10-01', '2026-10-31')), ['2026-10-06', '2026-10-13', '2026-10-27']);
// 從 from 當天剛好是重複日
assert.deepEqual(days(expandEvents([ev({ date: '2026-09-29', repeat: 'weekly' })], '2026-10-06', '2026-10-06')), ['2026-10-06']);

// 每月 31 號：沒有 31 號的月份跳過
const monthly = ev({ date: '2026-01-31', repeat: 'monthly' });
assert.deepEqual(days(expandEvents([monthly], '2026-01-01', '2026-06-30')), ['2026-01-31', '2026-03-31', '2026-05-31']);
// 開始日之前不出現
assert.deepEqual(days(expandEvents([ev({ date: '2026-10-15', repeat: 'monthly' })], '2026-09-01', '2026-11-30')), ['2026-10-15', '2026-11-15']);

// 每年：生日；2/29 只有閏年
assert.deepEqual(days(expandEvents([ev({ date: '1998-10-20', repeat: 'yearly' })], '2026-10-01', '2026-10-31')), ['2026-10-20']);
assert.deepEqual(days(expandEvents([ev({ date: '2024-02-29', repeat: 'yearly' })], '2025-01-01', '2028-12-31')), ['2028-02-29']);
// 查詢區間跨年
assert.deepEqual(days(expandEvents([ev({ date: '2020-01-02', repeat: 'yearly' })], '2026-12-27', '2027-01-06')), ['2027-01-02']);

// 依擁有者篩選、排序（全天在前、再依時間）
const list = [
  ev({ id: 'a', date: '2026-10-13', time: '16:00', owner: 'bf', title: '上班' }),
  ev({ id: 'b', date: '2026-10-13', owner: 'gf', title: '休假' }),
  ev({ id: 'c', date: '2026-10-13', time: '11:00', owner: 'shared', title: '做指甲' }),
];
assert.deepEqual(expandEvents(list, '2026-10-13', '2026-10-13').map((o) => o.id), ['b', 'c', 'a']);
assert.deepEqual(expandEvents(list, '2026-10-13', '2026-10-13', ['bf']).map((o) => o.id), ['a']);
assert.deepEqual(Object.keys(groupByDate(expandEvents(list, '2026-10-01', '2026-10-31'))), ['2026-10-13']);

// 正規化
const n = normalizeEvent({ id: 'z', title: '  ', date: '2026-10-01', time: '7:00', owner: 'x', color: 'nope', repeat: 'daily', exceptions: ['bad', '2026-10-02'] });
assert.deepEqual([n.title, n.time, n.owner, n.color, n.repeat, n.exceptions], ['未命名', '', 'shared', 'amber', 'none', ['2026-10-02']]);
assert.equal(colorHex('red'), '#E5484D');

console.log('events.js OK');
