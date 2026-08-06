// 語音記帳：把一句話解析成記帳欄位。跑在 Vercel 伺服器端，金鑰不外流。
// 聽寫是瀏覽器 Web Speech API 做的，這裡只處理「文字 → 欄位」。
import { CATEGORY_IDS, NimError, callNim, extractJson } from './_nim.js';

const MAX_TEXT_LENGTH = 300;

const SPLIT_TYPES = ['shared', 'ratio', 'custom', 'bf_personal', 'gf_personal'];
const ROLES = ['bf', 'gf'];

// today 與 speaker 由前端帶進來：
//   - 伺服器在 UTC，直接用 new Date() 會讓深夜記帳算成隔天
//   - 「我付的」要看說話的人是誰
const buildPrompt = (text, today, speaker) => {
  const other = speaker === 'bf' ? 'gf' : 'bf';
  const otherWords = speaker === 'bf' ? '女友 / 她 / 老婆 / 女生' : '男友 / 他 / 老公 / 男生';

  return `
You convert one spoken sentence (Traditional Chinese, Taiwan) into a shared-ledger expense entry.

There are exactly two people in this ledger: "bf" (the boyfriend) and "gf" (the girlfriend).
The speaker of the sentence is "${speaker}". The speaker's partner is "${other}".
So in this sentence, 我 means "${speaker}", and ${otherWords} all mean "${other}".

Today is ${today}.

Sentence: "${text}"

Extract these fields:

- amount: the number of TWD spent, as a number. Understand spoken Chinese numerals
  (六百八 = 680, 兩百五 = 250, 一千二 = 1200, 三十五塊 = 35).
  This is money spent, NOT change received.

- note: short description of what it was for, Traditional Chinese, max 20 characters.
  Use only words from the sentence.

- category: exactly one of: food, transport, entertainment, shopping, house, travel, other
  Groceries and ingredients (買菜 / 超市 / 全聯 / 菜市場) are "food", not "shopping".
  Utility bills and household supplies (電費 / 水費 / 房租 / 家用品) are "house".

- date: YYYY-MM-DD, resolved against today (${today}):
  今天 / 剛剛 / not mentioned -> ${today}
  昨天 -> yesterday,  前天 -> two days ago,  上週五 -> last Friday

- paidBy: which of the two people actually handed over the money.
  a word meaning the speaker (我 / 我的 / 自己)  -> "${speaker}"
  a word meaning the partner (${otherWords}) -> "${other}"
  nobody mentioned                              -> "${speaker}"

- splitType: how the cost is DIVIDED between the two people.
  The default is "shared". Only use something else when the sentence explicitly
  says the cost belongs to one person alone.

  IMPORTANT: paying for something does not make it that person's personal expense.
  Words about who paid affect paidBy only, never splitType.

  nothing said about whose cost it is -> "shared"
  平分 / 一人一半 / 各付一半           -> "shared"
  我自己的 / 我個人的 / 算我的         -> "${speaker}_personal"
  ${otherWords.split(' / ').map((w) => w + '自己的').join(' / ')} / 算${speaker === 'bf' ? '她' : '他'}的 -> "${other}_personal"
  split by a stated percentage        -> "ratio"
  split by stated amounts             -> "custom"

Return ONLY valid JSON with these six keys, no explanation, no markdown:
{"amount": <number>, "note": <string>, "category": <string>, "date": <string>, "paidBy": <string>, "splitType": <string>}

CRITICAL: if the sentence does not state a specific amount of money that was spent,
return exactly {"amount": null} and nothing else.
Never invent an amount, a note or a category that is not in the sentence.
`;
};

// 前端只吃得下 AddTransactionModal 的欄位形狀，模型輸出不保證乖，這裡收斂。
// 欄位名稱與值域必須跟 Firestore 現有的 transactions 文件完全一致。
export const normalizeEntry = (raw, { today, speaker }) => {
  const amount = Math.round(Number(raw?.amount) || 0);
  const note = String(raw?.note ?? '').trim().slice(0, 30);

  return {
    amount,
    note,
    category: CATEGORY_IDS.includes(raw?.category) ? raw.category : 'other',
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw?.date) ? raw.date : today,
    paidBy: ROLES.includes(raw?.paidBy) ? raw.paidBy : speaker,
    splitType: SPLIT_TYPES.includes(raw?.splitType) ? raw.splitType : 'shared',
  };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只接受 POST' });
  }

  const { text, today, role } = req.body || {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: '沒有聽到內容，請再說一次' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({ error: `說得太長了（${text.length} 字），上限 ${MAX_TEXT_LENGTH} 字` });
  }

  const speaker = ROLES.includes(role) ? role : 'bf';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().split('T')[0];

  try {
    const reply = await callNim(buildPrompt(text.trim(), day, speaker), { maxTokens: 300 });
    const entry = normalizeEntry(extractJson(reply), { today: day, speaker });

    if (!(entry.amount > 0)) {
      return res.status(422).json({ error: `聽不出金額，你說的是：「${text.trim()}」` });
    }
    return res.status(200).json(entry);
  } catch (e) {
    console.error('Voice entry parse failed', e);
    return res.status(e instanceof NimError ? e.status : 500).json({
      error: e instanceof NimError ? e.message : `解析失敗：${e.message}`,
    });
  }
}
