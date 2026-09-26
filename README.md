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
  parse-entry.js   語音文字 → 記帳欄位
  *.test.mjs       node api/_nim.test.mjs / receipt.test.mjs / parse-entry.test.mjs
src/
  lib/
    firebase.js  Firebase init + Firestore 路徑 helper
    format.js    金額／重量格式化、計算機求值、圖片壓縮
    receipt.js   呼叫 /api/receipt
    speech.js    瀏覽器聽寫能力偵測
    theme.js     主題清單與 useTheme
    constants.js CATEGORIES、備份集合清單
  components/    23 個元件
  index.css      Tailwind + 主題變數
  App.jsx        狀態與資料流
```

## 載入效能

- 首屏只載入登入頁、總覽與「記一筆」；其他分頁與對話框用 `React.lazy` 延後載入，
  登入後在瀏覽器閒置時預先抓好（`src/App.jsx` 的 `lazyImports`）。新增分頁或對話框時照同樣方式加進去。
- firebase / react / lucide-react 拆成獨立 chunk（`vite.config.js`），改 App 程式碼不會讓這些大檔的快取失效；
  `/assets/*` 在 `vercel.json` 設了一年 immutable 快取（檔名有 hash，內容變了檔名就會變）。
- `/api/gold` 同時向台銀與 Yahoo 發請求，回應由 Vercel CDN 快取 5 分鐘；前端切回黃金頁時 5 分鐘內也不重抓。

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
`{ date, items: [{name, price, category}], total }` → 帶入記帳表單。

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
Llama 3.2 Vision）；下架或參數不合（400／404／410）直接換下一個；金鑰錯誤（401／403）立刻停。
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
