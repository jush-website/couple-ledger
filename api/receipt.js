// 收據辨識：跑在 Vercel 伺服器端 (Node.js)，NVIDIA 金鑰不會外流到前端。
// 模型走 NVIDIA NIM 的 OpenAI 相容端點。

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'nvidia/nemotron-nano-12b-v2-vl';

// NIM 內嵌圖片有大小上限，超過就得改走它的 asset upload API。
// 前端已經先壓過，這裡只是最後一道防線，避免上游回一個難解讀的錯誤。
const MAX_IMAGE_BYTES = 180 * 1024;

// 沿用改版前 Gemini 版本的提示詞：分類已經限定在 CATEGORIES 的七個 id，
// 而且要求繁體中文台灣用語，換模型不代表要重新調教輸出格式。
const PROMPT = `
    Analyze this receipt image.
    1. Identify the transaction date (YYYY-MM-DD format).
    2. List ONLY the actual purchased line items with their prices.
       Include add-ons and surcharges that were genuinely charged
       (e.g. 清潔費 cleaning fee, 服務費 service charge, 外送費 delivery fee).
       Each item's full name as printed, do not truncate.
    3. NEVER list summary or payment rows as items. Specifically EXCLUDE:
       小計 subtotal, 合計/總計 total, 應付/應收 amount due, 實收,
       現金付款/現金/刷卡/信用卡/悠遊卡 payment, 找零 change,
       營業稅/稅額 tax lines, 折扣/折讓/優惠 discounts, 發票/統一編號.
       These are NOT items. Listing them causes double counting.
    4. Translate item names to Traditional Chinese (Taiwan usage).
    5. Categorize each item into one of these IDs: 'food', 'transport', 'entertainment', 'shopping', 'house', 'travel', 'other'.
       Sub-items belong to the same category as the dish they belong to.
    6. Return ONLY valid JSON in this format:
    {
      "date": "YYYY-MM-DD",
      "items": [
        { "name": "Item Name in TW Chinese", "price": 100, "category": "food" }
      ]
    }
    If date is unclear, use today. If category is unclear, use 'other'.
`;

const CATEGORY_IDS = ['food', 'transport', 'entertainment', 'shopping', 'house', 'travel', 'other'];

// 模型很愛把「小計 / 總計 / 現金付款 / 找零」當成品項列出來，全勾起來就會重複計算。
// prompt 已經講了，但 prompt 會飄，這裡再擋一層。
// 注意：清潔費／服務費／外送費「不」在此列 —— 那是真的付出去的錢，要留著。
const SUMMARY_PATTERNS = [
  /小\s*計/, /合\s*計/, /總\s*計/, /總\s*金\s*額/, /金額合計/,
  /應\s*[付收]/, /實\s*[付收]/, /本次消費/,
  /現\s*金/, /付\s*款/, /刷\s*卡/, /信用卡/, /悠遊卡|一卡通|電子支付|行動支付/,
  /找\s*[零錢]/, /退\s*還/,
  /營業稅|稅\s*額|含稅|未稅|外加稅/,
  /折\s*[扣讓]|優\s*惠|折抵|扣抵/,
  /發\s*票|統一編號|統編|載具/,
  /^(sub)?total$/i, /^amount\s*(due|paid)$/i, /^cash$/i, /^change$/i,
  /^tax$/i, /^discount$/i, /^payment$/i, /^balance$/i,
];

export const isSummaryRow = (name) => SUMMARY_PATTERNS.some((re) => re.test(name));

// 模型偶爾會用 ```json 圍籬包起來，或在 JSON 前後多講幾句話
export const extractJson = (text) => {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('回應中找不到 JSON');
    return JSON.parse(stripped.slice(start, end + 1));
  }
};

// 前端只信任 { date, items:[{name, price, category}], total } 這個形狀，
// 模型輸出不保證乖，這裡收斂成前端一定吃得下的樣子。
export const normalize = (raw) => {
  const today = new Date().toISOString().split('T')[0];
  const items = Array.isArray(raw?.items) ? raw.items : [];

  const cleanItems = items
    .map((item) => ({
      name: String(item?.name ?? '').trim() || '未命名項目',
      price: Number(item?.price) || 0,
      category: CATEGORY_IDS.includes(item?.category) ? item.category : 'other',
    }))
    .filter((item) => item.price > 0 && !isSummaryRow(item.name));

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw?.date) ? raw.date : today;

  // total 一律由品項加總算出來，不採用模型回的 total。
  // 模型常把「現金付款」當成總額（付 1002 找 210，實際消費是 792），
  // 而且畫面上的總計必須跟列出來的品項對得起來，不然使用者會看不懂。
  const total = cleanItems.reduce((sum, i) => sum + i.price, 0);

  return { date, items: cleanItems, total };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只接受 POST' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: '伺服器未設定 NVIDIA_API_KEY，請到 Vercel 專案的 Environment Variables 加上。',
    });
  }

  const { image } = req.body || {};
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return res.status(400).json({ error: '請傳入 data:image/...;base64,... 格式的圖片' });
  }

  const base64 = image.slice(image.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      error: `圖片太大（${Math.round(bytes / 1024)} KB），上限 ${MAX_IMAGE_BYTES / 1024} KB。請重新拍一張或縮小後再試。`,
    });
  }

  try {
    const upstream = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('NVIDIA API error', upstream.status, detail.slice(0, 500));
      return res.status(502).json({
        error: `辨識服務回應 ${upstream.status}`,
        detail: detail.slice(0, 300),
      });
    }

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      return res.status(502).json({ error: '辨識服務沒有回傳內容' });
    }

    return res.status(200).json(normalize(extractJson(text)));
  } catch (e) {
    console.error('Receipt analysis failed', e);
    return res.status(500).json({ error: `辨識失敗：${e.message}` });
  }
}
