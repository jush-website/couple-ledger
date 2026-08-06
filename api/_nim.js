// NVIDIA NIM 共用呼叫層。檔名開頭的底線讓 Vercel 不要把它當成一支 API route。
// receipt.js（看圖）與 parse-entry.js（看文字）都走這裡。

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'nvidia/nemotron-nano-12b-v2-vl';

export class NimError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const getApiKey = () => {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new NimError(
      '伺服器未設定 NVIDIA_API_KEY，請到 Vercel 專案的 Environment Variables 加上。',
      500
    );
  }
  return key;
};

// content 可以是純文字，或 OpenAI 格式的 content parts（給圖片用）
export const callNim = async (content, { maxTokens = 1024, temperature = 0.1 } = {}) => {
  const upstream = await fetch(NIM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content }],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('NVIDIA API error', upstream.status, detail.slice(0, 500));
    throw new NimError(`辨識服務回應 ${upstream.status}`, 502);
  }

  const data = await upstream.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new NimError('辨識服務沒有回傳內容', 502);
  return text;
};

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

export const CATEGORY_IDS = ['food', 'transport', 'entertainment', 'shopping', 'house', 'travel', 'other'];
