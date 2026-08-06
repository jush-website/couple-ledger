// node api/receipt.test.mjs
// 只測「模型輸出 → 前端吃得下的形狀」這段，不打真的 API。
import assert from 'node:assert/strict';
import { extractJson, normalize } from './receipt.js';

const today = new Date().toISOString().split('T')[0];

// 乾淨 JSON
assert.deepEqual(extractJson('{"a":1}'), { a: 1 });

// ```json 圍籬
assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });

// JSON 前後多講了話
assert.deepEqual(extractJson('這是結果：\n{"a":1}\n以上。'), { a: 1 });

// 完全不是 JSON 要丟錯，不能靜靜回 undefined
assert.throws(() => extractJson('看不懂這張收據'));

// 正常收據
const ok = normalize({
  date: '2026-08-01',
  items: [
    { name: '雞腿便當', price: 110, category: 'food' },
    { name: '捷運', price: 25, category: 'transport' },
  ],
  total: 135,
});
assert.deepEqual(ok, {
  date: '2026-08-01',
  items: [
    { name: '雞腿便當', price: 110, category: 'food' },
    { name: '捷運', price: 25, category: 'transport' },
  ],
  total: 135,
});

// 亂七八糟的輸出：日期格式錯、分類不存在、價格是字串、有零元項目、沒給 total
const messy = normalize({
  date: '2026/08/01',
  items: [
    { name: '  咖啡  ', price: '85', category: '飲料' },
    { name: '', price: 15, category: 'food' },
    { name: '贈品', price: 0, category: 'food' },
    null,
  ],
});
assert.equal(messy.date, today, '日期格式不對要退回今天');
assert.deepEqual(messy.items, [
  { name: '咖啡', price: 85, category: 'other' },
  { name: '未命名項目', price: 15, category: 'food' },
]);
assert.equal(messy.total, 100, '沒給 total 要自己加總');

// 整包壞掉也不能爆
assert.deepEqual(normalize(null), { date: today, items: [], total: 0 });
assert.deepEqual(normalize({ items: 'not-an-array' }), { date: today, items: [], total: 0 });

console.log('receipt.js OK');
