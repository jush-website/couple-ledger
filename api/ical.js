// 訂閱外部日曆（Google 日曆「iCal 格式的私人網址」）：瀏覽器不能直接跨網域讀，所以由這裡代抓、解析。
// GET /api/ical?url=<ics 網址>&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Asia/Taipei
// → { calendarName, events: [{ id, title, date, time }] }
import { parseIcs, expandIcs } from './_ics.js';

// 只代抓這些網域，避免被拿來當成任意網址的跳板
const ALLOWED_HOSTS = [/^calendar\.google\.com$/, /^p\d+-caldav\.icloud\.com$/, /(^|\.)icloud\.com$/];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_RANGE_DAYS = 120;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// Google 日曆 ID（xxx@group.calendar.google.com、xxx@gmail.com…）→ 公開的 iCal 網址
const publicIcsOf = (calendarId) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
const looksLikeCalendarId = (s) => /^[^\s/@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s);
const decodeCid = (cid) => {
  if (looksLikeCalendarId(cid)) return cid;
  try {
    const id = Buffer.from(cid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return looksLikeCalendarId(id) ? id : null;
  } catch { return null; }
};

// 使用者常貼的不是 .ics 網址，而是嵌入連結（/calendar/embed?src=ID）、分享連結（?cid=…）或日曆 ID。
// 這些都換成「公開」iCal 網址；日曆沒有設成公開的話，Google 會回 404，再提示改用私人網址。
export const resolveFeedUrl = (raw) => {
  const text = String(raw || '').trim();
  if (looksLikeCalendarId(text)) return { url: publicIcsOf(text), guessedPublic: true };
  let url;
  try { url = new URL(text.replace(/^webcal:\/\//i, 'https://')); } catch { return null; }
  if (url.hostname === 'calendar.google.com' && !url.pathname.startsWith('/calendar/ical/')) {
    const id = url.searchParams.get('src') || (url.searchParams.get('cid') && decodeCid(url.searchParams.get('cid')));
    if (id && looksLikeCalendarId(id)) return { url: publicIcsOf(id), guessedPublic: true };
    return null;
  }
  return { url: url.href, guessedPublic: /\/public\/basic\.ics$/.test(url.pathname) };
};

export const checkFeedUrl = (raw) => {
  const resolved = resolveFeedUrl(raw);
  if (!resolved) return null;
  const url = new URL(resolved.url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) return null;
  return url;
};

const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

export default async function handler(req, res) {
  const { url: rawUrl, from, to, tz: rawTz } = req.query || {};
  const url = checkFeedUrl(rawUrl);
  const guessedPublic = !!resolveFeedUrl(rawUrl)?.guessedPublic;
  if (!url) {
    return res.status(400).json({ error: '請貼上 Google 日曆的「iCal 格式的私人網址」（.ics 結尾），或日曆的嵌入連結、日曆 ID' });
  }
  if (!YMD.test(from) || !YMD.test(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: '日期範圍不正確' });
  }
  const tz = validTz(rawTz) ? rawTz : 'Asia/Taipei';

  let upstream;
  try {
    upstream = await fetch(url, { headers: { Accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(10000) });
  } catch (e) {
    console.error('iCal fetch failed', e.message);
    return res.status(502).json({ error: '連不到日曆網址，請稍後再試' });
  }
  // 重新導向後也必須還在允許的網域
  if (upstream.url && !checkFeedUrl(upstream.url)) return res.status(400).json({ error: '日曆網址被導向到不允許的網站' });
  if (upstream.status === 404 || upstream.status === 403 || upstream.status === 401) {
    return res.status(404).json({ error: guessedPublic
      ? '這個日曆沒有公開，讀不到。請到 Google 日曆該日曆的設定 →「整合日曆」複製「iCal 格式的私人網址」貼上；或在「存取權限」勾選「公開這個日曆」。'
      : '日曆網址無效或已失效。如果在 Google 日曆重設過私人網址，請重新複製貼上。' });
  }
  if (!upstream.ok) return res.status(502).json({ error: `日曆伺服器回應 ${upstream.status}` });

  const text = await upstream.text();
  if (text.length > MAX_BYTES) return res.status(413).json({ error: '日曆檔案太大' });
  if (!text.includes('BEGIN:VCALENDAR')) {
    return res.status(422).json({ error: '這個網址讀到的不是日曆。請改用 Google 日曆設定裡「整合日曆」的「iCal 格式的私人網址」。' });
  }

  try {
    const parsed = parseIcs(text, tz);
    const events = expandIcs(parsed, from, to, tz);
    // 網址本身就是秘密，結果不要讓 CDN 快取，只讓這支手機短暫快取
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ calendarName: parsed.calendarName, events });
  } catch (e) {
    console.error('iCal parse failed', e);
    return res.status(500).json({ error: '日曆內容解析失敗' });
  }
}
