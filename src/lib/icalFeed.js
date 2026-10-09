// 讀取訂閱的外部日曆（透過 /api/ical 代抓）。
// - 同一個月 5 分鐘內不重抓（切換分頁、來回翻月份不會一直打 API）
// - 抓成功的結果存一份在 localStorage，沒訊號時拿上次的結果來顯示（標記 stale）
const TTL = 5 * 60 * 1000;
const mem = new Map();

export const fetchFeedEvents = async (feed, from, to) => {
  const key = `${feed.url}|${from}|${to}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';
  try {
    const res = await fetch(`/api/ical?url=${encodeURIComponent(feed.url)}&from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `讀取失敗（${res.status}）`);
    mem.set(key, { at: Date.now(), data });
    try { localStorage.setItem(`ical-cache:${key}`, JSON.stringify(data)); } catch { /* 空間不夠就算了 */ }
    return data;
  } catch (e) {
    try {
      const cached = JSON.parse(localStorage.getItem(`ical-cache:${key}`) || 'null');
      if (cached) return { ...cached, stale: true };
    } catch { /* 快取壞掉就當作沒有 */ }
    throw e;
  }
};
