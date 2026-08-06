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
| `NVIDIA_API_KEY` | 收據辨識，只在 `/api/receipt` 伺服器端使用 |

`VITE_` 開頭的值一定會出現在前端 bundle 裡，這是 Firebase Web SDK 的正常運作方式；
真正的存取控制在 Firestore security rules。`NVIDIA_API_KEY` 沒有 `VITE_` 前綴，不會進 bundle。

## 結構

```
api/
  gold.js        台銀／Yahoo 金價爬取
  receipt.js     收據辨識 proxy → NVIDIA NIM
  receipt.test.mjs   node api/receipt.test.mjs
src/
  lib/
    firebase.js  Firebase init + Firestore 路徑 helper
    format.js    金額／重量格式化、計算機求值、圖片壓縮
    receipt.js   呼叫 /api/receipt
    theme.js     主題清單與 useTheme
    constants.js CATEGORIES、備份集合清單
  components/    22 個元件
  index.css      Tailwind + 主題變數
  App.jsx        狀態與資料流
```

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
→ NVIDIA `nvidia/nemotron-nano-12b-v2-vl` → 正規化成
`{ date, items: [{name, price, category}], total }` → 帶入記帳表單。

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
