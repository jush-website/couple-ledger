// 日曆格子上的每日開銷。純函式。
// 跟統計頁一樣不算還款（還款是兩人之間的轉帳，不是花掉的錢）。

export const spendingByDate = (transactions, from, to) => {
  const map = {};
  for (const t of transactions) {
    const d = t.date || '';
    if (t.category === 'repayment' || d < from || d > to) continue;
    const amt = Number(t.amount) || 0;
    if (amt) map[d] = (map[d] || 0) + amt;
  }
  return map;
};

// 格子很窄：一萬以下照常顯示，一萬以上用「1.2萬」，最多 5 個字左右
export const compactMoney = (n) => {
  const v = Math.round(n);
  if (Math.abs(v) < 10000) return `$${v.toLocaleString('en-US')}`;
  const wan = v / 10000;
  return `${Math.abs(wan) < 100 ? wan.toFixed(1).replace(/\.0$/, '') : Math.round(wan)}萬`;
};
