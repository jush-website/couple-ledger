// node api/_nim.test.mjs
// 測 callNim 的重試／換模型邏輯，fetch 用假的，不打真的 API。
// 檔名開頭的底線讓 Vercel 不要把它當成 API route。
import assert from 'node:assert/strict';
import { callNim, NimError } from './_nim.js';

process.env.NVIDIA_API_KEY = 'test';
delete process.env.NVIDIA_MODEL;

const ok = (text) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });
const fail = (status) => ({ ok: false, status, text: async () => `error ${status}` });
const run = async (responses) => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const silence = console.error; const silenceWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    return { text: await callNim('hi', { retryDelayMs: 0 }), calls };
  } catch (error) {
    return { error, calls };
  } finally {
    console.error = silence; console.warn = silenceWarn;
  }
};

// 一次就成功：只打主模型，並關掉 Nemotron 的思考模式
{
  const { text, calls } = await run([ok('A')]);
  assert.equal(text, 'A');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning');
  assert.deepEqual(calls[0].chat_template_kwargs, { enable_thinking: false });
}

// 503 忙線：同一個模型重試一次就過
{
  const { text, calls } = await run([fail(503), ok('B')]);
  assert.equal(text, 'B');
  assert.deepEqual(calls.map((c) => c.model), [calls[0].model, calls[0].model]);
}

// 主模型連續忙線 → 換備用模型；備用模型不能帶 Nemotron 專屬參數
{
  const { text, calls } = await run([fail(503), fail(503), ok('C')]);
  assert.equal(text, 'C');
  assert.equal(calls[2].model, 'meta/llama-3.2-90b-vision-instruct');
  assert.equal(calls[2].chat_template_kwargs, undefined);
}

// 主模型下架（410）→ 不重試，直接換下一個
{
  const { text, calls } = await run([fail(410), ok('D')]);
  assert.equal(text, 'D');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, 'meta/llama-3.2-90b-vision-instruct');
}

// 連線失敗／逾時當成忙線
{
  const { text } = await run([new Error('socket hang up'), ok('E')]);
  assert.equal(text, 'E');
}

// 全部忙線 → 503 與「太忙」訊息
{
  const { error, calls } = await run([fail(503), fail(503), fail(503), fail(503), fail(503), fail(503)]);
  assert.ok(error instanceof NimError);
  assert.equal(error.status, 503);
  assert.match(error.message, /太忙/);
  assert.equal(calls.length, 6);
}

// 全部下架 → 提示設定 NVIDIA_MODEL
{
  const { error, calls } = await run([fail(410), fail(404), fail(410)]);
  assert.equal(error.status, 502);
  assert.match(error.message, /NVIDIA_MODEL/);
  assert.equal(calls.length, 3);
}

// 金鑰無效 → 立刻停，不要把每個模型都試一遍
{
  const { error, calls } = await run([fail(401)]);
  assert.match(error.message, /NVIDIA_API_KEY/);
  assert.equal(calls.length, 1);
}

// NVIDIA_MODEL 覆寫主模型
{
  process.env.NVIDIA_MODEL = 'vendor/custom';
  const { calls } = await run([ok('F')]);
  assert.equal(calls[0].model, 'vendor/custom');
  assert.equal(calls[0].chat_template_kwargs, undefined);
  delete process.env.NVIDIA_MODEL;
}

console.log('_nim.js OK');
