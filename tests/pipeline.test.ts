import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { technical } from '../lib/analysis';
import { run } from '../lib/service';
import { db, all } from '../lib/db';
import { trades } from '../lib/portfolio';
import { timeframes, Timeframe, Candle } from '../lib/types';
process.env.CROSSFLOW_DB = join(mkdtempSync(join(tmpdir(), 'crossflow-pipeline-')), 'test.sqlite');
test('complete fixture pipeline persists approved trade, failed model WAIT, and read-only rejection', async () => {
  const oldFetch = globalThis.fetch,
    oldKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'TEST_ONLY';
  process.env.LLM_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  process.env.LLM_MODEL = 'qwen-plus';
  process.env.LLM_API = 'chat_completions';
  const originalNow = Date.now;
  const now = Date.now();
  let clock = now;
  Date.now = () => clock;
  let slow = false;
  const make = (tf: Timeframe): Candle[] =>
    Array.from({ length: 100 }, (_, i) => {
      const price = 100 + i * 0.02 + Math.sin(i * 0.6) * 0.5;
      return {
        timestamp: Math.floor(now / timeframes[tf]) * timeframes[tf] - (100 - i) * timeframes[tf],
        open: price,
        high: price + 0.2,
        low: price - 0.2,
        close: price + 0.05,
        volume: 100,
      };
    });
  const candles = make('1H'),
    price = candles.at(-1)!.close;
  const support = technical(candles)
    .pivots.filter((p) => p.type === 'LOW' && p.price < price)
    .at(-1)!.price;
  let malformed = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/chat/completions')) {
      if (slow) {
        clock += 90000;
        slow = false;
      }
      const requestBody = JSON.parse(String(init?.body));
      assert.equal(requestBody.enable_thinking, false);
      assert.equal(requestBody.model, 'qwen-plus');
      return Response.json({
        choices: [
          {
            message: {
              content: malformed
                ? '{}'
                : JSON.stringify({
                    decision: 'LONG',
                    asset: 'TESTUSDT',
                    reasoningSummary: ['TEST FIXTURE proposal using supplied structural evidence'],
                    entryZone: [price * 0.99, price * 1.01],
                    invalidation: support * 0.999,
                    targets: [price * 1.05],
                    confidence: 0.6,
                    riskNotes: [],
                    conditionsToReevaluate: ['Structural support changes'],
                  }),
            },
          },
        ],
      });
    }
    let data: unknown;
    if (url.pathname.endsWith('/instruments'))
      data = ['TESTUSDT', 'PAIRUSDT'].map((symbol) => ({
        symbol,
        isReality: 'no',
        status: 'online',
        quantityPrecision: '4',
        pricePrecision: '2',
        minOrderAmount: '1',
      }));
    else if (url.pathname.endsWith('/candles'))
      data = make(url.searchParams.get('interval') as Timeframe).map((c) =>
        [c.timestamp, c.open, c.high, c.low, c.close, c.volume].map(String),
      );
    else if (url.pathname.endsWith('/tickers'))
      data = [
        { lastPrice: price, bid1Price: price * 0.9999, ask1Price: price * 1.0001, ts: Date.now() },
      ];
    else throw Error(`Unexpected fixture request ${url.pathname}`);
    return Response.json({ code: '00000', msg: 'success', data });
  };
  try {
    const first = await run('TESTUSDT', 'PAIRUSDT', '1H', 'PAPER');
    assert.equal(first.risk.status, 'APPROVE');
    assert.equal(trades().length, 1);
    assert.ok(first.execution);
    assert.ok(db().prepare('SELECT id FROM MarketSnapshot WHERE id=?').get(first.id));
    assert.ok(first.agentInputRiskState);
    slow = true;
    const delayed = await run('TESTUSDT', 'PAIRUSDT', '1H', 'PAPER');
    assert.equal(delayed.risk.status, 'APPROVE');
    assert.ok(delayed.executionContext.assetA.timestamp > delayed.context.assetA.timestamp);
    assert.equal(delayed.revalidation.performed, true);
    const paused = await run('TESTUSDT', 'PAIRUSDT', '1H', 'PAPER', () => false);
    assert.equal(paused.execution, null);
    assert.ok(paused.risk.reasons.includes('AUTONOMY_PAUSED'));
    malformed = true;
    const second = await run('TESTUSDT', 'PAIRUSDT', '1H', 'PAPER');
    assert.equal(second.agent.decision.decision, 'WAIT');
    assert.equal(second.agent.provider, 'failed');
    assert.equal(second.execution, null);
    malformed = false;
    db().prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)').run('mode', 'READ_ONLY');
    const third = await run('TESTUSDT', 'PAIRUSDT', '1H', 'PAPER');
    assert.equal(third.risk.status, 'REJECT');
    assert.ok(third.risk.reasons.includes('READ_ONLY'));
    assert.equal(trades().length, 2);
    assert.equal(all('TradeDecision').length, 5);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = oldFetch;
    if (oldKey) process.env.LLM_API_KEY = oldKey;
    else delete process.env.LLM_API_KEY;
  }
});
