// iCalendar（.ics）解析與展開：把 Google 日曆「iCal 格式的私人網址」的內容，
// 轉成某段日期區間內、一天一筆的行程。檔名開頭的底線讓 Vercel 不把它當成 API route。
//
// 支援 Google 日曆實際會輸出的東西：
//   - 整天（VALUE=DATE）與有時間的行程；多天的整天行程（DTEND 不含）每天都顯示
//   - 時區：TZID=Asia/Taipei 這種 IANA 名稱、UTC（結尾 Z）、沒有時區的浮動時間
//   - RRULE：DAILY / WEEKLY(BYDAY) / MONTHLY(BYMONTHDAY 或 BYDAY 如 2SU、-1FR) / YEARLY，
//     INTERVAL、COUNT、UNTIL、WKST
//   - EXDATE（刪掉的單次）、RECURRENCE-ID（被單獨修改的那一次）、STATUS:CANCELLED
// 不支援的少見規則（BYSETPOS、BYWEEKNO…）只會少顯示一些，不會出錯。

const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const msOfYmd = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const addDays = (ymd, n) => ymdOf(msOfYmd(ymd) + n * DAY);
const weekday = (ymd) => new Date(msOfYmd(ymd)).getUTCDay();
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 是 1–12

// ── 時區 ───────────────────────────────────────────
const fmtCache = new Map();
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
// 某個 UTC 時刻在 tz 的牆上時間
const wallOf = (ms, tz) => {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, s: +p.second };
};
// tz 的牆上時間 → UTC 毫秒（日光節約也對：先猜、再用猜到的時刻的偏移修正一次）
const utcOfWall = (ymd, hms, tz) => {
  const [h, mi, s] = hms;
  const guess = msOfYmd(ymd) + ((h * 60 + mi) * 60 + s) * 1000;
  const offsetAt = (ms) => { const w = wallOf(ms, tz); return msOfYmd(w.ymd) + ((+w.hm.slice(0, 2) * 60 + +w.hm.slice(3)) * 60 + w.s) * 1000 - ms; };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
};

// ── 解析 ───────────────────────────────────────────
const unfold = (text) => text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
const unescapeText = (v) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

// 一行 "NAME;PARAM=V;PARAM2=V2:value"
const parseLine = (line) => {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(';');
  const params = {};
  for (const p of paramParts) { const i = p.indexOf('='); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
};

// 日期／時間值 → { allDay, ymd, hms, tz }（tz：'UTC'、IANA 名稱，或 null＝浮動時間）
const parseDateValue = (value, params, fallbackTz) => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const ymd = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || params.VALUE === 'DATE') return { allDay: true, ymd };
  const tz = m[7] ? 'UTC' : params.TZID && validTz(params.TZID) ? params.TZID : fallbackTz;
  return { allDay: false, ymd, hms: [+m[4], +m[5], +m[6]], tz };
};

const parseRrule = (value) => Object.fromEntries(value.split(';').map((kv) => { const [k, v] = kv.split('='); return [k.toUpperCase(), v]; }));

export const parseIcs = (text, displayTz = 'Asia/Taipei') => {
  const lines = unfold(text).split('\n');
  const events = [];
  let calendarName = '';
  let calendarTz = displayTz;
  let cur = null;
  let depth = 0; // VEVENT 裡可能有 VALARM，裡面的屬性不要算進事件
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; depth = 0; continue; }
    if (line === 'END:VEVENT') { if (cur?.start) events.push(cur); cur = null; continue; }
    if (cur && line.startsWith('BEGIN:')) { depth++; continue; }
    if (cur && line.startsWith('END:')) { depth--; continue; }
    const p = parseLine(line);
    if (!p) continue;
    if (!cur) {
      if (p.name === 'X-WR-CALNAME') calendarName = unescapeText(p.value);
      if (p.name === 'X-WR-TIMEZONE' && validTz(p.value.trim())) calendarTz = p.value.trim();
      continue;
    }
    if (depth > 0) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break;
      case 'SUMMARY': cur.title = unescapeText(p.value); break;
      case 'STATUS': cur.cancelled = p.value.trim().toUpperCase() === 'CANCELLED'; break;
      case 'DTSTART': cur.start = parseDateValue(p.value, p.params, null); break;
      case 'DTEND': cur.end = parseDateValue(p.value, p.params, null); break;
      case 'RRULE': cur.rrule = parseRrule(p.value); break;
      case 'EXDATE': for (const v of p.value.split(',')) { const d = parseDateValue(v, p.params, null); if (d) cur.exdates.push(d); } break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDateValue(p.value, p.params, null); break;
      default: break;
    }
  }
  // 浮動時間（沒有時區）用日曆本身的時區
  for (const e of events) for (const d of [e.start, e.end, e.recurrenceId, ...e.exdates]) if (d && !d.allDay && !d.tz) d.tz = calendarTz;
  return { calendarName, events };
};

// ── 重複規則展開 ───────────────────────────────────
// 在事件自己的時區（或整天）裡，依規則產生「牆上日期」，最多到 limitYmd
const occurrenceDays = (e, limitYmd) => {
  const startYmd = e.start.ymd;
  const r = e.rrule;
  if (!r) return [startYmd];
  const interval = Math.max(1, parseInt(r.INTERVAL, 10) || 1);
  const count = parseInt(r.COUNT, 10) || Infinity;
  let untilYmd = '9999-12-31';
  if (r.UNTIL) {
    const u = parseDateValue(r.UNTIL, {}, 'UTC');
    if (u) untilYmd = u.allDay || e.start.allDay ? u.ymd : wallOf(utcOfWall(u.ymd, u.hms, u.tz), e.start.tz).ymd;
  }
  const end = untilYmd < limitYmd ? untilYmd : limitYmd;
  const byday = (r.BYDAY || '').split(',').filter(Boolean).map((t) => { const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(t); return m ? { n: m[1] ? +m[1] : 0, wd: WEEKDAYS.indexOf(m[2]) } : null; }).filter(Boolean);
  const bymonthday = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
  const out = [];
  let produced = 0;
  const push = (d) => { if (d < startYmd || produced >= count) return; produced++; if (d <= end) out.push(d); };
  const [sy, sm, sd] = [+startYmd.slice(0, 4), +startYmd.slice(5, 7), +startYmd.slice(8, 10)];

  // 某年某月裡第 n 個（負數＝倒數）星期 wd
  const nthWeekday = (y, m, n, wd) => {
    const dim = daysInMonth(y, m);
    const days = [];
    for (let d = 1; d <= dim; d++) if (weekday(`${y}-${pad(m)}-${pad(d)}`) === wd) days.push(d);
    const pick = n > 0 ? days[n - 1] : n < 0 ? days[days.length + n] : null;
    return pick ? [pick] : n === 0 ? days : [];
  };
  const monthDays = (y, m) => {
    const dim = daysInMonth(y, m);
    let days;
    if (bymonthday.length) days = bymonthday.map((d) => (d < 0 ? dim + d + 1 : d));
    else if (byday.length) days = byday.flatMap(({ n, wd }) => nthWeekday(y, m, n, wd));
    else days = [sd];
    return [...new Set(days)].filter((d) => d >= 1 && d <= dim).sort((a, b) => a - b).map((d) => `${y}-${pad(m)}-${pad(d)}`);
  };

  for (let i = 0; i < 3000 && produced < count; i++) {
    let batch = [];
    if (r.FREQ === 'DAILY') batch = [addDays(startYmd, i * interval)];
    else if (r.FREQ === 'WEEKLY') {
      const wkst = WEEKDAYS.indexOf(r.WKST || 'MO');
      const weekStart = addDays(startYmd, -((weekday(startYmd) - wkst + 7) % 7) + i * 7 * interval);
      const wds = byday.length ? byday.map((b) => b.wd) : [weekday(startYmd)];
      batch = wds.map((wd) => addDays(weekStart, (wd - wkst + 7) % 7)).sort();
    } else if (r.FREQ === 'MONTHLY') {
      const t = (sm - 1) + i * interval;
      batch = monthDays(sy + Math.floor(t / 12), (t % 12) + 1);
    } else if (r.FREQ === 'YEARLY') {
      const y = sy + i * interval;
      const months = (r.BYMONTH || String(sm)).split(',').map(Number).sort((a, b) => a - b);
      batch = months.flatMap((m) => (bymonthday.length || byday.length ? monthDays(y, m) : sd <= daysInMonth(y, m) ? [`${y}-${pad(m)}-${pad(sd)}`] : []));
    } else return [startYmd]; // 不認得的頻率：只顯示第一次
    if (!batch.length) continue;
    if (batch[0] > end) break;
    batch.forEach(push);
  }
  return out;
};

// 牆上的某一天 → 顯示時區的 { date, time }
const toDisplay = (startProto, ymd, displayTz) => {
  if (startProto.allDay) return { date: ymd, time: '' };
  const w = wallOf(utcOfWall(ymd, startProto.hms, startProto.tz), displayTz);
  return { date: w.ymd, time: w.hm };
};
// EXDATE／RECURRENCE-ID 跟「哪一次」對上：比較事件自己時區裡的日期
const instanceKey = (d, eventTz) => (d.allDay ? d.ymd : wallOf(utcOfWall(d.ymd, d.hms, d.tz), eventTz).ymd);

// 展開成 [from, to]（顯示時區的日期，含頭尾）內一天一筆：{ id, title, date, time }
export const expandIcs = (parsed, from, to, displayTz = 'Asia/Taipei') => {
  const overrides = new Map(); // uid → Set(被單獨修改的那幾次)
  for (const e of parsed.events) if (e.recurrenceId && e.uid) {
    if (!overrides.has(e.uid)) overrides.set(e.uid, new Set());
    overrides.get(e.uid).add(instanceKey(e.recurrenceId, e.start.tz || displayTz));
  }
  const out = [];
  const limit = addDays(to, 2); // 時區換算可能往後跨一天
  for (const e of parsed.events) {
    if (e.cancelled) continue;
    const eventTz = e.start.allDay ? null : e.start.tz;
    const skip = new Set(e.exdates.map((d) => instanceKey(d, eventTz || displayTz)));
    const overridden = e.recurrenceId ? null : overrides.get(e.uid);
    // 整天行程跨幾天（DTEND 是隔天、不含）；最多 31 天
    const spanDays = e.start.allDay && e.end?.allDay ? Math.min(31, Math.max(1, Math.round((msOfYmd(e.end.ymd) - msOfYmd(e.start.ymd)) / DAY))) : 1;
    const days = e.recurrenceId ? [e.start.ymd] : occurrenceDays(e, limit);
    for (const day of days) {
      if (skip.has(day) || overridden?.has(day)) continue;
      const { date, time } = toDisplay(e.start, day, displayTz);
      for (let k = 0; k < spanDays; k++) {
        const d = addDays(date, k);
        if (d >= from && d <= to) out.push({ id: `${e.uid || e.title}|${day}|${k}`, title: e.title || '（無標題）', date: d, time: k === 0 ? time : '' });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
};
