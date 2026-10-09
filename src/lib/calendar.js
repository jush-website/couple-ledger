// 日曆用的日期工具：月曆格子、農曆、台灣節日。
// 日期一律用 'YYYY-MM-DD' 字串表示，計算時轉成 UTC 午夜，避免時區與日光節約造成差一天。
// 純函式，不依賴 React 或 Firebase。

const pad = (n) => String(n).padStart(2, '0');
export const toYmd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m 是 1–12
const toUtc = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms) => { const dt = new Date(ms); return toYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };

export const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * 86400000);
export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / 86400000);
export const weekdayOf = (ymd) => new Date(toUtc(ymd)).getUTCDay(); // 0 = 週日
export const todayYmd = () => new Date().toLocaleDateString('en-CA');
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 某年某月（m 是 1–12）的月曆：從週日開始，固定 6 週 42 格，前後補上鄰月的日期
export const monthGrid = (y, m) => {
  const first = toYmd(y, m, 1);
  const start = addDays(first, -weekdayOf(first));
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    return { date, inMonth: date.slice(0, 7) === first.slice(0, 7) };
  });
};

export const shiftMonth = (y, m, delta) => {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
};

// ── 農曆 ─────────────────────────────────────────────
// 用瀏覽器內建的 Intl 中國曆（Chrome、Safari、Firefox 都支援），不用另外裝套件。
// 不支援的環境 lunarOf 回 null，畫面上就不顯示農曆。
let lunarFmt;
try {
  const f = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  lunarFmt = f.resolvedOptions().calendar === 'chinese' ? f : null;
} catch { lunarFmt = null; }

const lunarCache = new Map();
export const lunarOf = (ymd) => {
  if (!lunarFmt) return null;
  if (lunarCache.has(ymd)) return lunarCache.get(ymd);
  const parts = lunarFmt.formatToParts(new Date(toUtc(ymd)));
  const monthText = parts.find((p) => p.type === 'month')?.value || '';
  const dayText = parts.find((p) => p.type === 'day')?.value || '';
  const month = parseInt(monthText.replace(/\D/g, ''), 10);
  const day = parseInt(dayText.replace(/\D/g, ''), 10);
  const result = month && day ? { month, day, leap: /閏|bis/i.test(monthText) } : null;
  lunarCache.set(ymd, result);
  return result;
};

const LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '臘月'];
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const lunarDayName = (d) => {
  if (d <= 10) return `初${DIGITS[d]}`;
  if (d < 20) return `十${DIGITS[d - 10]}`;
  if (d === 20) return '二十';
  if (d < 30) return `廿${DIGITS[d - 20]}`;
  return '三十';
};

// 格子裡顯示的農曆字：初一顯示月份（九月、閏六月），其他天顯示初九、廿九
export const lunarLabel = (ymd) => {
  const l = lunarOf(ymd);
  if (!l) return '';
  if (l.day === 1) return `${l.leap ? '閏' : ''}${LUNAR_MONTHS[l.month - 1]}`;
  return lunarDayName(l.day);
};

// ── 台灣節日 ─────────────────────────────────────────
// dayOff：國定放假日（2025 年修法後新增教師節、光復節、行憲紀念日、除夕）。
// 補假、調整放假要看行政院每年公告，無法用公式算，這裡不處理。
const SOLAR = {
  '01-01': { name: '元旦', dayOff: true },
  '02-14': { name: '情人節', dayOff: false },
  '02-28': { name: '和平紀念日', dayOff: true },
  '04-04': { name: '兒童節', dayOff: true },
  '05-01': { name: '勞動節', dayOff: true },
  '08-08': { name: '父親節', dayOff: false },
  '09-28': { name: '教師節', dayOff: true },
  '10-10': { name: '國慶日', dayOff: true },
  '10-25': { name: '台灣光復節', dayOff: true },
  '12-25': { name: '行憲紀念日', dayOff: true },
};
const LUNAR = {
  '1-1': { name: '春節', dayOff: true },
  '1-2': { name: '春節', dayOff: true },
  '1-3': { name: '春節', dayOff: true },
  '1-15': { name: '元宵節', dayOff: false },
  '5-5': { name: '端午節', dayOff: true },
  '7-7': { name: '七夕', dayOff: false },
  '8-15': { name: '中秋節', dayOff: true },
  '9-9': { name: '重陽節', dayOff: false },
};

// 清明（節氣）：21 世紀的近似公式，2000–2099 年都對
export const qingmingOf = (year) => {
  const y = year % 100;
  return toYmd(year, 4, Math.floor(y * 0.2422 + 4.81) - Math.floor(y / 4));
};
// 母親節：五月第二個星期日
const mothersDayOf = (year) => {
  const first = toYmd(year, 5, 1);
  return addDays(first, ((7 - weekdayOf(first)) % 7) + 7);
};

export const holidaysOf = (ymd) => {
  const list = [];
  const solar = SOLAR[ymd.slice(5)];
  if (solar) list.push(solar);
  const year = Number(ymd.slice(0, 4));
  if (ymd === qingmingOf(year)) list.push({ name: '清明節', dayOff: true });
  if (ymd === mothersDayOf(year)) list.push({ name: '母親節', dayOff: false });
  const l = lunarOf(ymd);
  if (l && !l.leap) {
    const lunar = LUNAR[`${l.month}-${l.day}`];
    if (lunar) list.push(lunar);
    // 除夕＝隔天是正月初一（臘月可能只有 29 天，所以不能寫死 12-30）
    const next = lunarOf(addDays(ymd, 1));
    if (next && !next.leap && next.month === 1 && next.day === 1) list.push({ name: '除夕', dayOff: true });
  }
  return list;
};
