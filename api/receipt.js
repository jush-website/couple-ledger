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
    1. Identify the date (YYYY-MM-DD format).
    2. List all items with their prices.
    3. Translate item names to Traditional Chinese (Taiwan usage).
    4. Categorize each item into one of these IDs: 'food', 'transport', 'entertainment', 'shopping', 'house', 'travel', 'other'.
    5. Return ONLY valid JSON in this format:
    {
      "date": "YYYY-MM-DD",
      "items": [
        { "name": "Item Name in TW Chinese", "price": 100, "category": "food" }
      ],
      "total": 100
    }
    If date is unclear, use today. If category is unclear, use 'other'.
`;

const CATEGORY_IDS = ['food', 'transport', 'entertainment', 'shopping', 'house', 'travel', 'other'];

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
    .filter((item) => item.price > 0);

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw?.date) ? raw.date : today;
  const total = Number(raw?.total) || cleanItems.reduce((sum, i) => sum + i.price, 0);

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
