import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llmConfig } from '../lib/llm-config';
import { requestLLM } from '../lib/llm';
test('hackathon Responses request uses documented gateway and parses only final assistant JSON', async () => {
  const original = globalThis.fetch;
  process.env.LLM_API_KEY = 'TEST_ONLY';
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_API;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://hackathon.bitgetops.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'qwen3.8-max');
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.deepEqual(body.text, { format: { type: 'json_object' } });
    assert.equal(body.enable_thinking, undefined);
    assert.equal(body.temperature, undefined);
    assert.equal(init?.redirect, 'error');
    return Response.json({
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: '{"connected":true}' }],
        },
      ],
    });
  };
  try {
    assert.deepEqual(await requestLLM([{ role: 'user', content: 'Return JSON' }]), {
      connected: true,
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    delete process.env.LLM_API_KEY;
  }
});
test('provider errors and incomplete or refused output fail closed without endpoint fallback', async () => {
  const original = globalThis.fetch;
  process.env.LLM_API_KEY = 'TEST_ONLY';
  let calls = 0;
  try {
    for (const data of [
      { status: 'incomplete', output: [] },
      {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'No' }],
          },
        ],
      },
      {
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'invalid' }],
          },
        ],
      },
    ]) {
      globalThis.fetch = async () => {
        calls++;
        return Response.json(data);
      };
      await assert.rejects(() => requestLLM([{ role: 'user', content: 'JSON' }]), /LLM_INVALID/);
    }
    globalThis.fetch = async () => {
      calls++;
      return Response.json({}, { status: 401 });
    };
    await assert.rejects(() => requestLLM([{ role: 'user', content: 'JSON' }]), /LLM_HTTP_401/);
    assert.equal(calls, 4);
    process.env.LLM_API = 'wrong';
    assert.throws(() => llmConfig(), /LLM_INVALID_API/);
  } finally {
    globalThis.fetch = original;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API;
  }
});
test('timeout and network failures are distinguishable and never retried', async () => {
  const original = globalThis.fetch;
  process.env.LLM_API_KEY = 'TEST_ONLY';
  try {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(
      () => requestLLM([{ role: 'user', content: 'JSON' }]),
      /LLM_NETWORK_ERROR/,
    );
    globalThis.fetch = async (_url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      init?.signal?.throwIfAborted();
      throw Error('Expected timeout');
    };
    await assert.rejects(
      () => requestLLM([{ role: 'user', content: 'JSON' }], { timeoutMs: 1 }),
      /LLM_TIMEOUT/,
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.LLM_API_KEY;
  }
});
