// node api/receipt.test.mjs
// 只測「模型輸出 → 前端吃得下的形狀」這段，不打真的 API。
import assert from 'node:assert/strict';
import { normalize, isSummaryRow } from './receipt.js';
import { extractJson } from './_nim.js';

const today = new Date().toISOString().split('T')[0];

// 乾淨 JSON
assert.deepEqual(extractJson('{"a":1}'), { a: 1 });

// ```json 圍籬
assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });

// JSON 前後多講了話
assert.deepEqual(extractJson('這是結果：\n{"a":1}\n以上。'), { a: 1 });

// 推理型模型留下的 <think> 區塊（裡面有大括號）要先拿掉
assert.deepEqual(extractJson('<think>先想想 {不是答案}</think>\n{"a":1}'), { a: 1 });

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

// --- 真實案例：模型把小計／總計／現金付款也當成品項列出來 ---
// 收據：腰內豬排定食 258 + 明太子 47 + 黑咖哩 40 + 海陸盛合定食 328 + 明太子 47
//       = 小計 720，加清潔費 72 = 總計 792，付現 1002 找零 210
const real = normalize({
  date: '2026-08-04',
  items: [
    { name: '腰內豬排定食', price: 258, category: 'food' },
    { name: '明太子', price: 47, category: 'food' },
    { name: '黑咖哩 (微辣)', price: 40, category: 'food' },
    { name: '海陸盛合定食', price: 328, category: 'food' },
    { name: '明太子', price: 47, category: 'food' },
    { name: '小計', price: 720, category: 'other' },
    { name: '清潔費', price: 72, category: 'other' },
    { name: '總計', price: 792, category: 'other' },
    { name: '現金付款', price: 1002, category: 'other' },
    { name: '找零', price: 210, category: 'other' },
  ],
  total: 1002, // 模型抓錯（那是付現金額），要被無視
});
assert.deepEqual(
  real.items.map((i) => i.name),
  ['腰內豬排定食', '明太子', '黑咖哩 (微辣)', '海陸盛合定食', '明太子', '清潔費'],
  '小計／總計／現金付款／找零要濾掉，清潔費要留'
);
assert.equal(real.total, 792, 'total 要由品項加總，不能用模型回的 1002');

// 彙總列判斷
for (const n of ['小計', '合計', '總計', '應付金額', '現金', '現金付款', '找零', '刷卡',
                 '信用卡', '營業稅', '折扣', '優惠', '發票', '統一編號', 'Subtotal',
                 'TOTAL', 'Cash', 'Change', 'Tax']) {
  assert.equal(isSummaryRow(n), true, `${n} 應該被視為彙總列`);
}
// 這些是真的花掉的錢，不能濾掉
for (const n of ['清潔費', '服務費', '外送費', '珍珠奶茶', '總匯三明治', '計程車資', '折凳']) {
  assert.equal(isSummaryRow(n), false, `${n} 不該被濾掉`);
}

console.log('receipt.js OK');
