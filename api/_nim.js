// NVIDIA NIM 共用呼叫層。檔名開頭的底線讓 Vercel 不要把它當成一支 API route。
// receipt.js（看圖）與 parse-entry.js（看文字）都走這裡。

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// 原本的 nvidia/nemotron-nano-12b-v2-vl 在 2026-08-26 下架（NIM 回 410 Gone），
// 換成 NVIDIA 同系列的後繼模型，一樣能看圖也能看文字。
// NIM 的模型會定期退役：下次再遇到 410，到 build.nvidia.com 挑一個能看圖的模型，
// 在 Vercel 設 NVIDIA_MODEL 就能換，不用改程式。
const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
export const getModel = () => process.env.NVIDIA_MODEL || DEFAULT_MODEL;

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
      model: getModel(),
      messages: [{ role: 'user', content }],
      temperature,
      max_tokens: maxTokens,
      stream: false,
      // 新模型預設會先「想」一大段再回答：抽欄位用不到，只會變慢、還可能把 max_tokens 用完。
      // 不支援這個參數的模型會直接忽略它。
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('NVIDIA API error', upstream.status, detail.slice(0, 500));
    // 404／410＝模型不存在或已退役，這不是重試能解決的，畫面上直接講清楚要做什麼
    const hint = upstream.status === 404 || upstream.status === 410
      ? `（模型 ${getModel()} 已下架，請在 Vercel 設定 NVIDIA_MODEL 換一個）`
      : '';
    throw new NimError(`辨識服務回應 ${upstream.status}${hint}`, 502);
  }

  const data = await upstream.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new NimError('辨識服務沒有回傳內容', 502);
  return text;
};

// 模型偶爾會用 ```json 圍籬包起來，或在 JSON 前後多講幾句話。
// 推理型模型就算關掉思考，也可能留下 <think>…</think>，裡面的大括號會干擾下面的找 JSON。
export const extractJson = (text) => {
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '').replace(/```/g, '').trim();
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
