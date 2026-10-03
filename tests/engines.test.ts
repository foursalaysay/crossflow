import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pivots,
  technical,
  volumeProfile,
  relativeVolume,
  correlation,
  crossAsset,
  context,
  reaction,
} from '../lib/analysis';
import { parseCandles } from '../lib/bitget';
import { assessRisk, BitgetOrderExecutor } from '../lib/risk';
import { agentEvidence, decide, waitDecision } from '../lib/agent';
import { Candle, Market, defaultRisk, MacroEvent } from '../lib/types';
const candles = (n = 120): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const price = 100 + i * 0.08 + Math.sin(i * 0.6) * 2;
    return {
      timestamp: 1700000000000 + i * 3600000,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price + 0.2,
      volume: 100 + (i % 7),
    };
  });
const now = Date.now();
const m = (symbol = 'BTCUSDT'): Market => ({
  symbol,
  timeframe: '1H',
  candles: candles(),
  price: 110,
  bid: 109.99,
  ask: 110,
  timestamp: now,
  status: 'VALID',
  source: 'TEST FIXTURE',
  instrument: {
    symbol,
    reality: false,
    status: 'online',
    quantityPrecision: 5,
    pricePrecision: 2,
    minOrderAmount: 1,
  },
});
const acct = {
  balance: 10000,
  equity: 10000,
  dailyPnl: 0,
  dayStartEquity: 10000,
  openPositions: 0,
  reserved: 0,
};
test('pivots wait for right-side confirmation and classify repeated structure', () => {
  const c = candles();
  const p = pivots(c);
  assert.ok(p.length > 10);
  assert.ok(p.every((v) => v.timestamp <= c.at(-4)!.timestamp));
  assert.ok(p.some((v) => v.label === 'HH'));
  assert.ok(p.some((v) => v.label === 'HL'));
  assert.equal(technical(c.slice(0, 4)).regime, 'UNCERTAIN');
  assert.ok(technical(c).trendlines.length > 0);
  assert.ok(technical(c).zones.every((z) => z.touches >= 2));
});
test('profile preserves null volume and contiguous 70% value area', () => {
  const c = candles();
  assert.equal(volumeProfile(c.map((v) => ({ ...v, volume: null }))).available, false);
  const p = volumeProfile(c);
  assert.equal(p.available, true);
  if (p.available) {
    assert.ok(p.val <= p.poc && p.poc <= p.vah);
    const inside = p.bins
        .filter((b) => b.price >= p.val && b.price <= p.vah)
        .reduce((s, b) => s + b.volume, 0),
      total = p.bins.reduce((s, b) => s + b.volume, 0);
    assert.ok(inside / total >= 0.7);
  }
  assert.equal(relativeVolume(c.slice(0, 15)), null);
  assert.equal(relativeVolume(c.map((v) => ({ ...v, volume: 100 }))), 1);
});
test('returns are timestamp aligned, scale independent, and no small-sample lead lag', () => {
  const c = candles(),
    b = c.map((v) => ({ ...v, close: v.close * 5 })),
    cross = crossAsset(c, b);
  assert.ok(Math.abs(cross.correlation20! - 1) < 1e-10);
  assert.ok(Math.abs(cross.relativePerformance!) < 1e-9);
  assert.equal(cross.normalized[0].a, 100);
  assert.equal(crossAsset(c.slice(0, 10), b.slice(0, 10)).leadLag, null);
  assert.equal(correlation(Array(20).fill(1), Array(20).fill(1)), null);
  assert.equal(
    crossAsset(
      c,
      b.map((v) => ({ ...v, timestamp: v.timestamp + 1 })),
    ).sampleSize,
    0,
  );
});
test('parsing rejects malformed OHLC and preserves absent volume', () => {
  assert.equal(parseCandles([['1700000000000', '10', '12', '9', '11', '']])[0].volume, null);
  assert.throws(() => parseCandles([['1', '10', '8', '9', '11', '2']]));
  assert.throws(() => parseCandles([['1', '10', '12', '9', '11', '-2']]));
});
test('macro reaction never uses unreleased or incomplete future horizons', () => {
  const market = m(),
    at = market.candles[40].timestamp;
  const event: MacroEvent = {
    id: 'test',
    timestamp: new Date(at).toISOString(),
    eventType: 'CPI',
    title: 'Fixture',
    country: 'US',
    importance: 'HIGH',
    actual: null,
    forecast: null,
    previous: null,
    surprise: null,
    source: 'TEST',
    affectedAssets: [],
    status: 'RELEASED',
  };
  const r = reaction(event, market, at + 3600000);
  assert.equal(r.return1m, null);
  assert.equal(r.return240m, null);
  assert.equal(typeof r.return60m, 'number');
});
test('hard limits cannot be overridden by confidence or memory', () => {
  const ctx = context(m(), m('ETHUSDT'), [], now),
    d = {
      ...waitDecision('BTCUSDT', 'test'),
      decision: 'LONG' as const,
      entryZone: [109, 112] as [number, number],
      invalidation: 108,
      targets: [115],
      confidence: 1,
    };
  ctx.assetA.analysis.pivots.push({
    price: 108.5,
    timestamp: now - 3600000,
    type: 'LOW',
    strength: 6,
    volume: 100,
    label: 'HL',
  });
  const approved = assessRisk(d, ctx, acct, 'PAPER', defaultRisk, now);
  assert.equal(approved.status, 'APPROVE');
  assert.ok(approved.riskAmount <= 100);
  assert.ok(approved.quantity * approved.entry! <= 10000);
  assert.equal(assessRisk(d, ctx, acct, 'LIVE').status, 'REJECT');
  assert.equal(assessRisk(d, ctx, acct, 'READ_ONLY').status, 'REJECT');
  assert.equal(assessRisk(d, ctx, { ...acct, dailyPnl: -301 }, 'PAPER').status, 'REJECT');
  assert.equal(assessRisk(d, ctx, { ...acct, openPositions: 3 }, 'PAPER').status, 'REJECT');
  assert.equal(assessRisk({ ...d, invalidation: 112 }, ctx, acct, 'PAPER').status, 'REJECT');
  ctx.assetA.timestamp = now - 61000;
  assert.equal(assessRisk(d, ctx, acct, 'PAPER', defaultRisk, now).status, 'REJECT');
});
test('high impact policy blocks or reduces without inventing directional bias', () => {
  const event: MacroEvent = {
    id: 'cpi',
    timestamp: new Date(now).toISOString(),
    title: 'CPI',
    eventType: 'CPI',
    country: 'US',
    importance: 'HIGH',
    actual: 2,
    forecast: 3,
    previous: null,
    surprise: -1,
    source: 'TEST',
    affectedAssets: [],
    status: 'RELEASED',
  };
  const ctx = context(m(), m('ETHUSDT'), [event], now);
  ctx.assetA.analysis.pivots.push({
    price: 108.5,
    timestamp: now - 3600000,
    type: 'LOW',
    strength: 6,
    volume: null,
    label: 'HL',
  });
  const d = {
    ...waitDecision('BTCUSDT', 'test'),
    decision: 'LONG' as const,
    entryZone: [109, 112] as [number, number],
    invalidation: 108,
    targets: [115],
  };
  assert.equal(assessRisk(d, ctx, acct, 'PAPER', defaultRisk, now).status, 'REJECT');
  const result = assessRisk(d, ctx, acct, 'PAPER', { ...defaultRisk, eventPolicy: 'REDUCE' }, now);
  assert.equal(result.status, 'MODIFY');
  assert.ok(result.riskAmount <= 50);
});
test('missing provider produces WAIT, live executor refuses', async () => {
  const old = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  const result = await decide(context(m(), m('ETHUSDT'), []), [], {});
  assert.equal(result.decision.decision, 'WAIT');
  if (old) process.env.LLM_API_KEY = old;
  await assert.rejects(() => new BitgetOrderExecutor().executeOrder());
});
test('malformed LLM responses and timeout fail closed', async () => {
  const oldKey = process.env.LLM_API_KEY,
    oldFetch = globalThis.fetch;
  process.env.LLM_API_KEY = 'unit-test';
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"decision":"BUY"}' } }] }));
    assert.equal(
      (await decide(context(m(), m('ETHUSDT'), []), [], {})).decision.reasoningSummary[0],
      'AGENT_VALIDATION_FAILURE',
    );
    globalThis.fetch = async () => {
      throw Error('timeout');
    };
    assert.equal((await decide(context(m(), m('ETHUSDT'), []), [], {})).decision.decision, 'WAIT');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey) process.env.LLM_API_KEY = oldKey;
    else delete process.env.LLM_API_KEY;
  }
});
test('same-origin localhost is authorized but cross-origin and remote mutation fail', async () => {
  const { authorize } = await import('../lib/auth');
  assert.doesNotThrow(() =>
    authorize(
      new Request('http://localhost:3000/api/run', {
        headers: {
          host: '127.0.0.1:3000',
          origin: 'http://127.0.0.1:3000',
          'sec-fetch-site': 'same-origin',
        },
      }),
    ),
  );
  assert.throws(() =>
    authorize(
      new Request('http://localhost:3000/api/run', {
        headers: {
          host: '127.0.0.1:3000',
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        },
      }),
    ),
  );
  assert.throws(() =>
    authorize(
      new Request('https://example.com/api/run', {
        headers: { host: 'example.com', origin: 'https://example.com' },
      }),
    ),
  );
});
test('replay never reveals candles after its clock or incomplete captured candles', async () => {
  const { replayContext } = await import('../lib/replay');
  for (const i of [40, 80, 10000]) {
    const c = replayContext(i);
    assert.ok(c.assetA.candles.every((v) => v.timestamp + 3600000 <= c.timestamp));
    assert.ok(c.assetB.candles.every((v) => v.timestamp + 3600000 <= c.timestamp));
    assert.ok(
      c.assetA.analysis.pivots.every((p) => p.timestamp < c.assetA.candles.at(-3)!.timestamp),
    );
  }
  const small = replayContext(40),
    large = replayContext(80);
  assert.ok(small.assetA.candles.length < large.assetA.candles.length);
});
test('correlation does not treat a missing interval as a one-candle lag', () => {
  const c = candles();
  const b = c.filter((_, i) => i !== 110);
  assert.equal(crossAsset(c, b).correlation20, null);
});
test('upstream Bitget transport failure is explicit ERROR, never synthetic candles', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw Error('upstream unavailable');
    };
    const { market } = await import('../lib/bitget');
    const result = await market('BTCUSDT', '1H');
    assert.equal(result.status, 'ERROR');
    assert.equal(result.candles.length, 0);
    assert.equal(result.price, null);
  } finally {
    globalThis.fetch = old;
  }
});

test('compact agent evidence preserves risk levels and active macro context without mutating the audit', () => {
  const ctx = context(m(), m('RNVDAUSDT'), []);
  ctx.multiTimeframe = {
    '1H': { status: 'VALID', analysis: ctx.assetA.analysis },
    '4H': { status: 'VALID', analysis: ctx.assetA.analysis },
  };
  const original = JSON.stringify(ctx);
  const compact = agentEvidence(ctx);
  assert.equal(compact.assetA.candles.length, 8);
  assert.ok(compact.assetA.analysis.pivots.length <= 6);
  assert.deepEqual(compact.assetA.analysis.zones, ctx.assetA.analysis.zones);
  assert.equal(compact.crossAsset.correlation20, ctx.crossAsset.correlation20);
  assert.equal(compact.multiTimeframe['1H'], undefined);
  assert.ok(compact.multiTimeframe['4H']);
  assert.equal(JSON.stringify(ctx), original);
});
