// node src/lib/calendar.test.mjs
import assert from 'node:assert/strict';
import { monthGrid, shiftMonth, addDays, daysBetween, weekdayOf, lunarOf, lunarLabel, holidaysOf, qingmingOf } from './calendar.js';

// 2026 年 10 月：1 號是週四，第一格是 9/27（週日），共 42 格
const grid = monthGrid(2026, 10);
assert.equal(grid.length, 42);
assert.equal(grid[0].date, '2026-09-27');
assert.equal(grid[0].inMonth, false);
assert.equal(grid[4].date, '2026-10-01');
assert.equal(grid[4].inMonth, true);
assert.equal(grid.filter((c) => c.inMonth).length, 31);

assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
assert.equal(addDays('2026-02-28', 1), '2026-03-01');
assert.equal(addDays('2028-02-28', 1), '2028-02-29');
assert.equal(daysBetween('2026-06-20', '2026-10-09'), 111);
assert.equal(weekdayOf('2026-10-09'), 5);

// 農曆：跟截圖對得上
assert.deepEqual(lunarOf('2026-10-09'), { month: 8, day: 29, leap: false });
assert.equal(lunarLabel('2026-10-09'), '廿九');
assert.equal(lunarLabel('2026-10-10'), '九月');
assert.equal(lunarLabel('2026-10-12'), '初三');
assert.equal(lunarLabel('2026-10-19'), '初十');
assert.equal(lunarLabel('2026-10-20'), '十一');
assert.equal(lunarLabel('2026-10-29'), '二十');
assert.equal(lunarLabel('2025-07-25'), '閏六月');

const names = (d) => holidaysOf(d).map((h) => h.name);
assert.deepEqual(names('2026-10-10'), ['國慶日']);
assert.deepEqual(names('2026-10-18'), ['重陽節']);
assert.deepEqual(names('2026-10-25'), ['台灣光復節']);
assert.deepEqual(names('2026-02-17'), ['春節']);
assert.deepEqual(names('2026-02-16'), ['除夕']); // 2026 臘月只有 29 天
assert.deepEqual(names('2026-06-19'), ['端午節']);
assert.deepEqual(names('2026-09-25'), ['中秋節']);
assert.deepEqual(names('2026-05-10'), ['母親節']);
assert.deepEqual(names('2026-10-09'), []);
assert.equal(holidaysOf('2026-09-28')[0].dayOff, true);
assert.equal(holidaysOf('2026-10-18')[0].dayOff, false);
// 閏六月初七不是七夕
assert.deepEqual(names('2025-07-31'), []);

assert.equal(qingmingOf(2024), '2024-04-04');
assert.equal(qingmingOf(2025), '2025-04-04');
assert.equal(qingmingOf(2026), '2026-04-05');

console.log('calendar.js OK');
