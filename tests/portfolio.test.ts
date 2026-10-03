import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.CROSSFLOW_DB = join(mkdtempSync(join(tmpdir(), 'crossflow-test-')), 'test.sqlite');
const { db, transaction } = await import('../lib/db');
const { PaperOrderExecutor, closeTrade, account, trades, memory } =
  await import('../lib/portfolio');
const { context } = await import('../lib/analysis');
const { waitDecision } = await import('../lib/agent');
import type { Market } from '../lib/types';
test('paper execution charges both fees, persists journal, closes once, and memory excludes future trades', () => {
  const now = Date.now(),
    id = 'test-decision';
  const m: Market = {
    symbol: 'TESTUSDT',
    timeframe: '1H',
    candles: [],
    price: 100,
    bid: 99.99,
    ask: 100,
    timestamp: now,
    status: 'VALID',
    source: 'TEST',
  };
  const ctx = context(m, { ...m, symbol: 'PAIRUSDT' }, [], now),
    decision = {
      ...waitDecision('TESTUSDT', 'fixture'),
      decision: 'LONG' as const,
      entryZone: [99, 101] as [number, number],
      invalidation: 95,
      targets: [110],
    };
  db().prepare('INSERT INTO TradeDecision VALUES(?,?,?,?)').run(id, now, 'PAPER', '{}');
  const t = transaction(() =>
    new PaperOrderExecutor().executeOrder(id, ctx, decision, {
      status: 'APPROVE',
      reasons: ['TEST'],
      quantity: 10,
      riskAmount: 52,
      entry: 100.05,
      stop: 95,
    }),
  );
  assert.equal(trades().length, 1);
  assert.ok(Math.abs(account().balance - 9998.9995) < 1e-7);
  assert.ok(db().prepare('SELECT * FROM TradeJournal WHERE tradeId=?').get(t.id));
  const closed = transaction(() => closeTrade(t, 110, now + 3600000));
  assert.equal(closed.status, 'CLOSED');
  assert.ok(closed.fees > 2);
  assert.ok(closed.slippage > 1);
  assert.ok(closed.lessons.length > 0);
  assert.equal(account().openPositions, 0);
  assert.equal(memory(ctx).length, 0);
  assert.throws(() => closeTrade(closed, 110, now + 4000000));
  const expected =
    10000 + (110 * 0.9995 - 100.05) * 10 - 110 * 0.9995 * 10 * 0.001 - 100.05 * 10 * 0.001;
  assert.ok(Math.abs(account().balance - expected) < 1e-7);
});
test('partial reductions respect quantity precision and do not leave below-minimum dust', () => {
  const now = Date.now(),
    id = 'reduction-decision';
  const m: Market = {
    symbol: 'DUSTUSDT',
    timeframe: '1H',
    candles: [],
    price: 100,
    bid: 99.99,
    ask: 100,
    timestamp: now,
    status: 'VALID',
    source: 'TEST',
    instrument: {
      symbol: 'DUSTUSDT',
      status: 'online',
      reality: false,
      pricePrecision: 2,
      quantityPrecision: 1,
      minOrderAmount: 10,
    },
  };
  const ctx = context(m, { ...m, symbol: 'PAIRUSDT' }, [], now),
    d = {
      ...waitDecision(m.symbol, 'TEST'),
      decision: 'LONG' as const,
      entryZone: [99, 101] as [number, number],
      invalidation: 95,
      targets: [110],
    };
  db().prepare('INSERT INTO TradeDecision VALUES(?,?,?,?)').run(id, now, 'PAPER', '{}');
  const t = transaction(() =>
    new PaperOrderExecutor().executeOrder(id, ctx, d, {
      status: 'APPROVE',
      reasons: ['TEST'],
      quantity: 0.1,
      riskAmount: 1,
      entry: 100,
      stop: 95,
    }),
  );
  assert.throws(() => transaction(() => closeTrade(t, 100, now + 1, 0.5)), /minimum size|dust/);
  assert.equal(trades().find((p) => p.id === t.id)?.quantity, 0.1);
  transaction(() => closeTrade(t, 100, now + 1));
});
