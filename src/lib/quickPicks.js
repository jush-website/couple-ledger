// 「記一筆」上方的常用項目：從最近的紀錄找出最常重複記的組合，點一下就帶入。
// 純函式，不依賴 React 或 Firebase。

const RECENT_LIMIT = 200;
// 自訂金額／比例分帳的明細跟當次金額綁在一起，套到下一筆會錯，所以不列入
const REUSABLE_SPLITS = ['shared', 'bf_personal', 'gf_personal'];

export const getQuickPicks = (transactions, limit = 6) => {
  const groups = new Map();
  // transactions 已經是「新 → 舊」排好的，先出現的就是比較近的
  transactions.slice(0, RECENT_LIMIT).forEach((t, index) => {
    const note = (t.note || '').trim();
    const amount = Number(t.amount) || 0;
    const splitType = t.splitType || 'shared';
    if (!note || amount <= 0 || t.category === 'repayment' || !REUSABLE_SPLITS.includes(splitType)) return;

    const key = [note, t.category, amount, splitType].join('|');
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { note, amount, category: t.category, splitType, count: 1, recency: index });
  });

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.recency - b.recency)
    .slice(0, limit)
    .map(({ note, amount, category, splitType }) => ({ note, amount, category, splitType }));
};
