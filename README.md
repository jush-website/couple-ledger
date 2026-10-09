# 我們的小金庫 (couple-ledger)

情侶共同記帳、存錢罐、黃金存摺，資料存在 Firebase，部署在 Vercel。

## 開發

```bash
npm install
cp .env.example .env.local   # 填入 Firebase 設定與 NVIDIA 金鑰
npm run dev
```

沒有 `.env.local` 的話啟動會直接丟錯並告訴你缺哪個變數 —— 這是故意的，
以前設定寫死在原始碼裡，現在改成環境變數。

部署到 Vercel 時，同樣的變數要加在專案的 **Environment Variables**：

| 變數 | 用途 |
|---|---|
| `VITE_FIREBASE_*`（6 個必填 + `MEASUREMENT_ID` 選填）| 前端 Firebase 設定 |
| `NVIDIA_API_KEY` | 收據辨識與語音記帳，只在 `/api/*` 伺服器端使用 |
| `NVIDIA_MODEL`（選填）| 換 NIM 模型用，不填就用 `api/_nim.js` 的預設值 |

`VITE_` 開頭的值一定會出現在前端 bundle 裡，這是 Firebase Web SDK 的正常運作方式；
真正的存取控制在 Firestore security rules。`NVIDIA_API_KEY` 沒有 `VITE_` 前綴，不會進 bundle。

## 結構

```
api/
  gold.js          台銀／Yahoo 金價爬取
  _nim.js          NVIDIA NIM 共用呼叫層（底線開頭 = 不是 route）
  receipt.js       收據辨識 → 品項清單
  ical.js          代抓訂閱的 Google 日曆（iCal 私人網址），回傳某段期間的行程
  _ics.js          iCalendar 解析與重複規則展開（底線開頭 = 不是 route）
  parse-entry.js   語音文字 → 記帳欄位
  *.test.mjs       node api/_nim.test.mjs / _ics.test.mjs / receipt.test.mjs / parse-entry.test.mjs
                   （前端的純函式測試：for t in src/lib/*.test.mjs; do node $t; done）
src/
  lib/
    firebase.js  Firebase init + Firestore 路徑 helper
    format.js    金額／重量格式化、計算機求值、圖片壓縮
    receipt.js   呼叫 /api/receipt
    speech.js    瀏覽器聽寫能力偵測
    theme.js     主題清單與 useTheme
    constants.js CATEGORIES、備份集合清單
    budget.js    每月預算計算（+ budget.test.mjs）
    quickPicks.js「記一筆」的常用項目（+ quickPicks.test.mjs）
    reservations.js 預留款（+ reservations.test.mjs）
    calendar.js  月曆格子、農曆、台灣節日（+ calendar.test.mjs）
    events.js    行程與重複規則（+ events.test.mjs）
    anniversaries.js 紀念日天數與里程碑（+ anniversaries.test.mjs）
    dailySpend.js 日曆格子的每日開銷（+ dailySpend.test.mjs）
  components/    33 個元件
  index.css      Tailwind + 主題變數
  App.jsx        狀態與資料流
```

## 載入效能

- 首屏只載入登入頁、總覽與「記一筆」；其他分頁與對話框用 `React.lazy` 延後載入，
  登入後在瀏覽器閒置時預先抓好（`src/App.jsx` 的 `lazyImports`）。新增分頁或對話框時照同樣方式加進去。
- firebase / react / lucide-react 拆成獨立 chunk（`vite.config.js`），改 App 程式碼不會讓這些大檔的快取失效；
  `/assets/*` 在 `vercel.json` 設了一年 immutable 快取（檔名有 hash，內容變了檔名就會變）。
- `/api/gold` 同時向台銀與 Yahoo 發請求，回應由 Vercel CDN 快取 5 分鐘；前端切回黃金頁時 5 分鐘內也不重抓。

## 加到主畫面與離線使用

- `public/manifest.webmanifest` + `public/icons/`：手機瀏覽器選「加到主畫面」就能像 App 一樣全螢幕開啟。
  狀態列顏色登入後會跟著角色與主題變（`App.jsx` 設定 `meta[name=theme-color]`）。
- `public/sw.js`：只快取網頁外殼與 `/assets/*`，**HTML 一律先走網路**，所以新版部署後馬上生效。
  不碰 `/api/*` 和 Firebase；回來的是 HTML（檔案不存在）就不存。改了快取策略要把裡面的 `CACHE` 版本號加一。

### 部署新版時的白畫面防護

每次部署分頁程式檔都會換檔名。手機上還開著的舊頁面去抓舊檔名會失敗，以前會整頁白掉。現在：
- `vercel.json` 的 SPA 改寫排除 `/assets/`、`/icons/`、`/api/`：找不到的檔案回真正的 404，不會回首頁 HTML。
- `src/lib/lazyReload.js` 的 `withReload` 包住每個 `React.lazy`：載入失敗就自動重新整理一次拿新版
  （每個分頁階段只試一次、離線時不試；背景預抓不包，免得把正在用的畫面重整掉）。
- `ErrorBoundary`：整個 App 一層、分頁內容一層（`key={activeTab}`，切分頁會重來、導覽列不受影響）。
  出錯時顯示錯誤訊息與「重新載入」（會先清 Service Worker 快取），不再是白畫面。
- `index.html` 裡的**開機保險**（不靠主程式的內嵌 script）：主程式本身載不起來時（手機留著壞掉的舊快取，
  ErrorBoundary 還沒啟動也救不了），10 秒後畫面仍空白就自動解除 Service Worker、清快取、
  用 `fetch(url, { cache: 'reload' })` 覆寫瀏覽器 HTTP 快取裡的程式檔，再重新整理一次；
  還是不行才顯示錯誤訊息與「清除快取並重新載入」按鈕。
  （修正前 `/assets/*` 的一年 immutable 快取會連「找不到檔案時回的首頁 HTML」一起存，這是手機上白畫面的根源。）
- `src/lib/firebase.js` 開了 Firestore 的 `persistentLocalCache`（IndexedDB）：打開時先顯示上次的資料，
  沒訊號也能記帳，連線後自動同步。
  - 記帳、存帳本、收據多筆匯入不再 `await` 寫入（離線時那個 promise 要等連上伺服器才會 resolve），
    走 `commitInBackground`，失敗時才跳 toast。
  - 帳本監聽只在「伺服器確認是空的」（`!fromCache`）時才自動建第一本帳，否則快取剛開、還沒資料時會多建一本。
  - 存錢罐的 `runTransaction` 本來就需要連線，離線時會失敗，這是 Firestore 的限制。

## 每月預算

帳本文件多一個**選填**欄位 `budget: { total, categories: { food: 8000, … } }`，在「編輯帳本」設定。
沒有這個欄位＝沒設預算，舊資料不受影響。總覽頁只顯示快用完（≥80%）或超支的分類，統計頁顯示該月全部。
月份比對用交易 `date` 字串的 `YYYY-MM` 前綴，不經過 `new Date()`，避免時區把月底算到下個月。

## 總覽摘要卡

`SummaryCard` 把「本帳本結算」「本月預算」「預留款」合成一張卡，預設收合（每項一行），
展開才顯示分類預算明細、預留款清單與新增按鈕。收合／展開存在 localStorage（`overview-summary-expanded`），
跟著裝置走。收合時「快用完／超支」的分類與最近一筆預留的倒數照樣顯示顏色，不會因為收起來就看不到警示。
統計頁的月份預算仍用獨立的 `BudgetCard`；兩邊共用 `BudgetBar` / `BudgetTotal` / `BudgetCategories`。

## 日曆與紀念日

底部導覽的「日曆」分頁，上方切換「日曆／紀念日」。兩個新集合沿用既有的路徑格式：
`events_{coupleId}`、`anniversaries_{coupleId}`（不分帳本，兩人共用），也已加進 `BACKUP_COLLECTIONS`；
舊備份檔沒有這兩個集合，還原時會整個跳過、不會被清空。

- **月曆**：週日開始、固定 6 週；每格顯示國曆、農曆（`Intl` 的中國曆，不用套件，初一顯示月份）、
  節日（國定假日紅底）、紀念日里程碑（♥）、行程。左右滑動或點標題換月份，「今天」跳回本月。
  篩選（每日開銷、誰的行程、節日、紀念日）存 localStorage。點日期看當天明細並可在那天新增行程。
- **每日開銷**：格子右下角是當天支出（不含還款），一萬以上顯示「1.2萬」；月份標題下有當月合計；
  當天明細列出每一筆。用的是目前選的帳本（跟總覽、統計同一本）。
- **節日**：國曆固定日、農曆（春節、端午、中秋、重陽、七夕…）、除夕（隔天是正月初一）、清明（節氣公式）、母親節。
  **補假與調整放假**每年由行政院公告，無法用公式算，沒有處理。
- **行程**：`{ title, date, time, owner, color, repeat, until, exceptions, note }`。重複規則 none/weekly/monthly/yearly，
  只存一筆文件，顯示時用 `expandEvents` 展開；每月 31 號、2/29 這種「那個月沒有這天」的會跳過。
  重複行程「只刪這天」寫進 `exceptions`（`arrayUnion`），修改會套用到整個重複行程。
- **連結 Google 日曆**（日曆工具列的 🔗）：貼上 Google 日曆「iCal 格式的私人網址」，
  存在 `calendar_feeds_{coupleId}`（`{ name, url, owner, color }`），兩個人的日曆都會顯示、唯讀。
  瀏覽器不能跨網域讀，所以由 `/api/ical` 代抓並解析（`api/_ics.js`：整天／時區／多天、
  RRULE DAILY/WEEKLY/MONTHLY/YEARLY、EXDATE、RECURRENCE-ID、取消）。
  也接受公開日曆的嵌入連結（`/calendar/embed?src=ID`）、分享連結（`?cid=`）或日曆 ID，
  自動換成公開網址 `/calendar/ical/ID/public/basic.ics`（`resolveFeedUrl`）；沒公開時 Google 回 404，會提示改用私人網址。
  只允許 `calendar.google.com` 與 iCloud 網域；回應 `Cache-Control: private`（網址本身是秘密，不給 CDN 快取）。
  前端 `src/lib/icalFeed.js` 同一個月 5 分鐘內不重抓，離線時顯示上次的結果。
  私人網址等於日曆的鑰匙，所以**沒有**放進備份檔（`BACKUP_COLLECTIONS` 不含 `calendar_feeds`）。
- **紀念日**：`since`（累計，6/20→10/9＝已過 111 天，跟一般紀念日 App 相同）、`yearly`（生日）、`countdown`（單次倒數）。
  里程碑：每 100 天、`SPECIAL_DAYS`（99、111、520、1314…）、每週年；「即將到來」列 30 天內的。

## 預留款

預購、後付的東西先把錢「圈起來」，提醒這筆錢不能花。存在帳本文件的選填欄位
`reservations: { [id]: { name, amount, category, owner, dueDate, createdAt } }`。
用 map + 欄位路徑 `reservations.<id>` 更新（不是陣列），兩人同時改不同筆不會互相覆蓋，離線也能寫。

- 算進本月預算的是「本月（含逾期）到期」與「沒填付款日」的預留款；下個月以後才付的不算，
  否則一筆大額預購會讓每個月預算都爆掉。預算卡上以斜線段顯示，「還剩」改叫「可自由花用」＝預算－已花－預留。
- 按「付款了」會把內容帶進記一筆（共同→平分、個人→該人 100%），**存檔時**用同一個 `writeBatch`
  新增支出並刪掉該筆預留（`payingReservation`）；取消就什麼都不變。
  任何其他打開記一筆／還款的入口都要把 `payingReservation` 清掉，不然會誤刪別筆預留。
- 「取消預留」只刪預留，不記成支出。

## 常用項目與搜尋

- 「記一筆」上方列出最近 200 筆裡最常重複的「備註＋分類＋金額＋分帳」組合，點一下只帶入欄位，還是要按 ✓ 才存。
  自訂金額／比例分帳不列入（明細跟當次金額綁定）。
- 統計頁搜尋時可切換「本月／全部月份」。

## 換主題

設定頁可切換 `經典藍粉` / `暖奶油` / `莫蘭迪` / `暗夜`，選擇存在 localStorage，
不寫進 Firestore。

實作方式是**覆寫 Tailwind 內建色階**（`src/index.css` 的 `@theme inline`），
`gray` 是介面中性色、`blue` 是男友、`pink` 是女友、`purple` 是 AI。
所以元件裡照常寫 `bg-gray-50` / `text-blue-600`，換主題只要改 `[data-theme]`
區塊的變數，標記完全不用動。新增一套主題＝複製一個 `[data-theme="..."]`
區塊改顏色，再到 `src/lib/theme.js` 的 `THEMES` 加一筆。

## 收據辨識

`ReceiptScannerModal` → `compressForOcr`（壓到 170KB 以下）→ `POST /api/receipt`
→ NVIDIA `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`（關閉思考模式）→ 正規化成
`{ date, items: [{name, price, category}], total }` → 使用者勾選品項後二選一：
- **合併成一筆**：帶入記帳表單（原本的流程）。
- **每項各記一筆**：在同一個畫面選付款人與每個品項的分帳方式（平分／男友／女友），
  按「記 N 筆」用 `writeBatch` 一次寫入（`handleSaveMany`）。這個畫面列出每一筆的金額與分帳，本身就是確認畫面。

## 語音記帳

`VoiceEntryModal` 用瀏覽器內建的 Web Speech API 聽寫（`zh-TW`，零依賴零成本），
文字送 `POST /api/parse-entry` 解析成 `{amount, note, category, date, paidBy, splitType}`，
再帶進記帳表單確認。Firefox 沒有這個 API，偵測不到時麥克風按鈕整個不顯示。

可以這樣說：「昨天晚餐六百八 我付的 平分」「計程車兩百五 他付的」「買衣服一千二 我自己的」。
`我` 會依說話者的 role 解析，所以 API 需要前端把 `role` 與 `today` 一起帶上
（伺服器在 UTC，深夜記帳會算成隔天）。

聽不出金額時回 422，不會憑空生出一筆帳 —— prompt 明確要求
「沒有金額就回 `{"amount": null}`」，否則模型會照抄範例值。

## 兩個 AI 功能的共同原則

兩者共用 `api/_nim.js` 的同一個模型。**NIM 的模型會退役**：原本的
`nvidia/nemotron-nano-12b-v2-vl` 在 2026-08-26 下架，兩個功能同時壞掉、畫面顯示「辨識服務回應 410」。
下次再看到 404／410，到 build.nvidia.com 挑一個能看圖的模型，在 Vercel 設 `NVIDIA_MODEL` 後重新部署即可。

免費端點名額很少，熱門模型常回 503「Worker local total request limit reached」。`callNim` 會：
忙線（429／5xx／逾時）同一模型等 1 秒重試一次 → 還是不行就換備用模型（`FALLBACK_MODELS`，
先 Llama 3.2 Vision 11B 再 90B，備用模型單次最多等 12 秒）；下架或參數不合（400／404／410）直接換下一個；金鑰錯誤（401／403）立刻停。
全部重試加起來最多 55 秒。邏輯的測試在 `node api/_nim.test.mjs`。

辨識結果一律只是「預先填好」，**永遠經過確認畫面才寫進 Firestore**。
兩者都走 `handlePrefillTransaction`，它塞給 `editingTransaction` 的物件沒有 `id`，
而 `handleSaveTransaction` 是靠 `editingTransaction?.id` 判斷新增或編輯 ——
不要改成只看真假值，那會走進 `updateDoc(…, undefined)` 然後被 catch 吞掉。

## ⚠️ 不要動的地方

`src/lib/firebase.js` 裡 `appId` 的推導：

```js
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
```

`__app_id` 是 Google AI Studio / Canvas 才會注入的全域變數，在 Vite build 裡永遠
undefined，所以正式站的 `appId` 就是字串 `'default-app-id'`。它是所有 Firestore
路徑的第一段，看起來像該清掉的死碼，**清掉等於現有資料全部讀不到**。

集合路徑格式（coupleId 嵌在集合名稱裡，不是子集合）：

```
artifacts/{appId}/public/data/{transactions|savings_jars|books|gold_transactions}_{coupleId}/{docId}
artifacts/{appId}/users/{uid}/profile/data
```

一律透過 `coupleCol()` / `coupleDoc()` / `profileDoc()` 存取。
