// NVIDIA NIM 共用呼叫層。檔名開頭的底線讓 Vercel 不要把它當成一支 API route。
// receipt.js（看圖）與 parse-entry.js（看文字）都走這裡。

const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// 原本的 nvidia/nemotron-nano-12b-v2-vl 在 2026-08-26 下架（NIM 回 410 Gone），
// 換成 NVIDIA 同系列的後繼模型，一樣能看圖也能看文字。
// NIM 的模型會定期退役：下次再遇到 410，到 build.nvidia.com 挑一個能看圖的模型，
// 在 Vercel 設 NVIDIA_MODEL 就能換，不用改程式。
const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
export const getModel = () => process.env.NVIDIA_MODEL || DEFAULT_MODEL;

// 免費的 NIM 端點名額很少，熱門模型常回 503「Worker local total request limit reached (16/16)」。
// 主模型忙線或下架時依序改用這些備用模型（都能看圖，也能處理純文字）。
// 11B 放前面：實測 90B 在忙的時候會 30 秒都不回應，小模型通常快很多。
// 備用模型本身也可能哪天退役，退役的會直接跳過，不會卡住。
const FALLBACK_MODELS = ['meta/llama-3.2-11b-vision-instruct', 'meta/llama-3.2-90b-vision-instruct'];
export const getModelChain = () => [...new Set([getModel(), ...FALLBACK_MODELS])];

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

// 忙線／暫時性錯誤：同一個模型等一下再試一次，還是不行就換下一個模型
const isBusy = (status) => status === 429 || status >= 500;
// 模型不存在、已退役，或不吃我們送的參數：重試沒用，直接換下一個模型
const isModelUnusable = (status) => status === 400 || status === 404 || status === 410 || status === 422;
// 單次請求上限，以及所有重試加起來的總上限：上游卡住時不要讓使用者一直轉圈圈。
// 主模型給比較久（看圖本來就慢）；備用模型卡住就早點換下一個。
const REQUEST_TIMEOUT_MS = 30_000;
const FALLBACK_TIMEOUT_MS = 12_000;
const TOTAL_BUDGET_MS = 55_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestOnce = async (model, content, { maxTokens, temperature, timeoutMs }) => {
  let upstream;
  try {
    upstream = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature,
        max_tokens: maxTokens,
        stream: false,
        // Nemotron 預設會先「想」一大段再回答：抽欄位用不到，只會變慢、還可能把 max_tokens 用完。
        // 只送給 Nemotron，其他模型不認得這個參數，有的會直接回 400。
        ...(model.includes('nemotron') ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // 逾時或連線失敗，當成忙線處理
    console.error('NVIDIA API unreachable', model, e.message);
    return { ok: false, status: 503 };
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error('NVIDIA API error', model, upstream.status, detail.slice(0, 500));
    return { ok: false, status: upstream.status };
  }

  const data = await upstream.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    console.error('NVIDIA API empty content', model);
    return { ok: false, status: 502 };
  }
  return { ok: true, text };
};

// content 可以是純文字，或 OpenAI 格式的 content parts（給圖片用）
export const callNim = async (content, { maxTokens = 1024, temperature = 0.1, retryDelayMs = 1000 } = {}) => {
  getApiKey(); // 沒設金鑰就別一個一個模型試了，直接回明確的錯誤
  const statuses = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  attempts: for (const model of getModelChain()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1000) break attempts;
      const perRequest = model === getModel() ? REQUEST_TIMEOUT_MS : FALLBACK_TIMEOUT_MS;
      const timeoutMs = Math.min(perRequest, remaining);
      const result = await requestOnce(model, content, { maxTokens, temperature, timeoutMs });
      if (result.ok) {
        if (model !== getModel()) console.warn('NVIDIA fallback model used', model);
        return result.text;
      }
      statuses.push(result.status);

      // 金鑰無效或沒權限：換模型也一樣，直接停
      if (result.status === 401 || result.status === 403) {
        throw new NimError(`辨識服務回應 ${result.status}（NVIDIA_API_KEY 無效或已過期）`, 502);
      }
      if (isModelUnusable(result.status)) break;
      if (isBusy(result.status) && attempt === 0) await sleep(retryDelayMs);
    }
  }

  // 全部都失敗：分成「NVIDIA 太忙」與「模型都下架了」兩種，讓畫面上的訊息指得出下一步
  if (statuses.length === 0 || statuses.some(isBusy)) {
    throw new NimError('辨識服務目前太忙（NVIDIA 免費額度的排隊已滿），請過一兩分鐘再試。', 503);
  }
  throw new NimError(
    `辨識服務回應 ${statuses.at(-1)}（模型 ${getModel()} 與備用模型都無法使用，請在 Vercel 設定 NVIDIA_MODEL 換一個）`,
    502
  );
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
