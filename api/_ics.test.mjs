// node api/_ics.test.mjs
// 用 Google 日曆實際的輸出格式測解析與展開（含重複、例外、時區、多天）。
import assert from 'node:assert/strict';
import { parseIcs, expandIcs } from './_ics.js';
import { checkFeedUrl } from './ical.js';

const ics = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
X-WR-CALNAME:Jush 班表
X-WR-TIMEZONE:Asia/Taipei
BEGIN:VEVENT
DTSTART;TZID=Asia/Taipei:20260929T070000
DTEND;TZID=Asia/Taipei:20260929T150000
RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU,TH
EXDATE;TZID=Asia/Taipei:20261013T070000
UID:shift@google.com
SUMMARY:早班
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:這是提醒，不是標題
TRIGGER:-P0DT0H30M0S
END:VALARM
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Taipei:20261015T090000
DTEND;TZID=Asia/Taipei:20261015T170000
RECURRENCE-ID;TZID=Asia/Taipei:20261015T070000
UID:shift@google.com
SUMMARY:早班（改九點）
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261023
DTEND;VALUE=DATE:20261026
UID:trip@google.com
SUMMARY:墾丁三天兩夜\\, 記得帶泳衣
END:VEVENT
BEGIN:VEVENT
DTSTART:20261020T013000Z
DTEND:20261020T023000Z
UID:utc@google.com
SUMMARY:看牙醫
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Taipei:20261001T200000
RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3
UID:lastfri@google.com
SUMMARY:月底聚餐
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:19991030
DTEND;VALUE=DATE:19991031
RRULE:FREQ=YEARLY
UID:bday@google.com
SUMMARY:生日
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261012
UID:cancel@google.com
STATUS:CANCELLED
SUMMARY:取消的行程
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20261018T200000
UID:ny@google.com
SUMMARY:跟紐約朋友視訊
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Asia/Taipei:20261001T080000
RRULE:FREQ=DAILY;INTERVAL=10;UNTIL=20261025T155959Z
UID:daily@google.com
SUMMARY:每十天
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');

const parsed = parseIcs(ics);
assert.equal(parsed.calendarName, 'Jush 班表');
const ev = expandIcs(parsed, '2026-09-27', '2026-11-07');
const on = (title) => ev.filter((e) => e.title === title).map((e) => `${e.date}${e.time ? ' ' + e.time : ''}`);

// 每週二、四 7:00；10/13 刪掉；10/15 那次改成 9:00（原本 7:00 不出現）
assert.deepEqual(on('早班'), [
  '2026-09-29 07:00', '2026-10-01 07:00', '2026-10-06 07:00', '2026-10-08 07:00',
  '2026-10-20 07:00', '2026-10-22 07:00', '2026-10-27 07:00', '2026-10-29 07:00', '2026-11-03 07:00', '2026-11-05 07:00',
]);
assert.deepEqual(on('早班（改九點）'), ['2026-10-15 09:00']);
// 多天整天行程（DTEND 不含）＋跳脫字元
assert.deepEqual(on('墾丁三天兩夜, 記得帶泳衣'), ['2026-10-23', '2026-10-24', '2026-10-25']);
// UTC 01:30 → 台北 09:30
assert.deepEqual(on('看牙醫'), ['2026-10-20 09:30']);
// 每月最後一個週五，共 3 次（10/30、11/27…只取區間內）
assert.deepEqual(on('月底聚餐'), ['2026-10-30 20:00']);
assert.deepEqual(expandIcs(parsed, '2026-12-01', '2027-01-31').filter((e) => e.title === '月底聚餐').map((e) => e.date), ['2026-12-25']);
// 每年生日；VALARM 的 DESCRIPTION 不會蓋掉標題
assert.deepEqual(on('生日'), ['2026-10-30']);
// 取消的不顯示
assert.deepEqual(on('取消的行程'), []);
// 紐約 10/18 20:00（夏令時間 UTC-4）→ 台北 10/19 08:00
assert.deepEqual(on('跟紐約朋友視訊'), ['2026-10-19 08:00']);
// 每 10 天、UNTIL 是 UTC 10/25 15:59:59（＝台北 10/25 23:59:59）
assert.deepEqual(on('每十天'), ['2026-10-01 08:00', '2026-10-11 08:00', '2026-10-21 08:00']);
// 依日期、時間排序
assert.ok(ev.every((e, i) => i === 0 || `${ev[i - 1].date}${ev[i - 1].time}` <= `${e.date}${e.time}`));

// 換顯示時區：UTC 顯示
assert.deepEqual(expandIcs(parsed, '2026-10-20', '2026-10-20', 'UTC').filter((e) => e.title === '看牙醫').map((e) => e.time), ['01:30']);

// 網址白名單
assert.ok(checkFeedUrl('https://calendar.google.com/calendar/ical/abc%40gmail.com/private-123/basic.ics'));
assert.ok(checkFeedUrl('webcal://p42-caldav.icloud.com/published/2/xyz'));
assert.equal(checkFeedUrl('http://calendar.google.com/x.ics'), null);
assert.equal(checkFeedUrl('https://evil.example.com/x.ics'), null);
assert.equal(checkFeedUrl('https://calendar.google.com.evil.com/x.ics'), null);
assert.equal(checkFeedUrl('not a url'), null);

console.log('_ics.js OK');
