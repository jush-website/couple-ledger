// node api/parse-entry.test.mjs
// 只測「模型輸出 → AddTransactionModal 吃得下的形狀」，不打真的 API。
import assert from 'node:assert/strict';
import { normalizeEntry } from './parse-entry.js';

const ctx = { today: '2026-08-06', speaker: 'gf' };

// 正常case
assert.deepEqual(
  normalizeEntry(
    { amount: 680, note: '晚餐', category: 'food', date: '2026-08-05', paidBy: 'bf', splitType: 'shared' },
    ctx
  ),
  { amount: 680, note: '晚餐', category: 'food', date: '2026-08-05', paidBy: 'bf', splitType: 'shared' }
);

// 沒提到的欄位要退回安全預設：日期＝今天、付款人＝說話的人、分帳＝平分
assert.deepEqual(normalizeEntry({ amount: 120, note: '午餐', category: 'food' }, ctx), {
  amount: 120,
  note: '午餐',
  category: 'food',
  date: '2026-08-06',
  paidBy: 'gf',
  splitType: 'shared',
});

// 值域外的東西一律不可以流進 Firestore
const junk = normalizeEntry(
  { amount: '250', note: '  咖啡  ', category: '飲料', date: '8/5', paidBy: '我', splitType: '對半' },
  ctx
);
assert.equal(junk.amount, 250, '字串數字要轉成 number');
assert.equal(junk.note, '咖啡', 'note 要 trim');
assert.equal(junk.category, 'other', '不存在的分類要退回 other');
assert.equal(junk.date, '2026-08-06', '格式不對的日期要退回今天');
assert.equal(junk.paidBy, 'gf', '不合法的 paidBy 要退回說話的人');
assert.equal(junk.splitType, 'shared', '不合法的 splitType 要退回 shared');

// amount 一定是整數（TWD 沒有小數，且 Firestore 現有資料都是整數）
assert.equal(normalizeEntry({ amount: 99.6 }, ctx).amount, 100);
assert.equal(normalizeEntry({ amount: 'abc' }, ctx).amount, 0, '聽不出金額要是 0，讓 handler 擋下來');
assert.equal(normalizeEntry({}, ctx).amount, 0);
assert.equal(normalizeEntry(null, ctx).amount, 0, '整包壞掉也不能爆');

// 講了一句沒有金額的話時，prompt 要求模型回 {"amount": null}。
// 這是防「模型照抄範例值、憑空生出一筆假帳」的最後一道防線 —— amount 必須是 0，
// handler 才會回 422 而不是存進一筆不存在的支出。
assert.equal(normalizeEntry({ amount: null }, ctx).amount, 0);
assert.equal(normalizeEntry({ amount: 0 }, ctx).amount, 0);
assert.equal(normalizeEntry({ amount: -50 }, ctx).amount, -50, '負數也不會 > 0，一樣被 handler 擋下');

// note 過長要截斷，不然備註欄會爆版
assert.equal(normalizeEntry({ note: '字'.repeat(100) }, ctx).note.length, 30);

// 個人支出的兩個方向都要能通過
for (const st of ['bf_personal', 'gf_personal', 'ratio', 'custom', 'shared']) {
  assert.equal(normalizeEntry({ amount: 1, splitType: st }, ctx).splitType, st);
}

// 說話的人是男友時，預設付款人要跟著換
assert.equal(normalizeEntry({ amount: 1 }, { today: '2026-08-06', speaker: 'bf' }).paidBy, 'bf');

console.log('parse-entry.js OK');
