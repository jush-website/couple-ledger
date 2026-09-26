// node src/lib/quickPicks.test.mjs
import assert from 'node:assert/strict';
import { getQuickPicks } from './quickPicks.js';

const t = (note, amount, extra = {}) => ({ note, amount, category: 'food', splitType: 'shared', ...extra });

// 次數多的排前面，次數一樣時比較近的排前面
assert.deepEqual(
  getQuickPicks([t('早餐', 60), t('午餐', 120), t('早餐', 60), t('晚餐', 200), t('午餐', 120), t('早餐', 60)]).map((p) => p.note),
  ['早餐', '午餐', '晚餐']
);

// 同名但金額不同是不同的組合
assert.equal(getQuickPicks([t('午餐', 120), t('午餐', 150)]).length, 2);

// 沒備註、還款、自訂／比例分帳、0 元都不列入
assert.deepEqual(
  getQuickPicks([
    t('', 100), t('還款', 500, { category: 'repayment' }), t('房租', 20000, { splitType: 'custom' }),
    t('火鍋', 800, { splitType: 'ratio' }), t('免費', 0), t('捷運', 30, { category: 'transport', splitType: 'bf_personal' }),
  ]),
  [{ note: '捷運', amount: 30, category: 'transport', splitType: 'bf_personal' }]
);

// 數量上限、金額可能是字串
assert.equal(getQuickPicks(Array.from({ length: 20 }, (_, i) => t(`項目${i}`, String(i + 1))), 6).length, 6);
assert.equal(getQuickPicks([t('咖啡', '85')])[0].amount, 85);

console.log('quickPicks.js OK');
