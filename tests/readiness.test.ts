import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performanceFrom } from '../lib/performance';
import { evidenceChanged } from '../lib/revalidation';
import { context } from '../lib/analysis';
import type { Market } from '../lib/types';
test('daily metrics exclude stale marks, require coverage and include unrealized equity drawdown', () => {
  const points = Array.from({ length: 32 }, (_, i) => ({
    timestamp: i * 86400000,
    equity: 10000 * (1 + i * 0.001 + (i % 2) * 0.002),
    marksFresh: true,
    source: 'TEST',
  }));
  const full = performanceFrom(points);
  assert.ok(full.annualizedSharpe !== null);
  assert.ok(full.annualizedSortino !== null);
  assert.equal(performanceFrom(points.slice(0, 10)).annualizedSharpe, null);
  const gapped = performanceFrom(points.filter((_, i) => i !== 5));
  assert.equal(gapped.gaps, 1);
  assert.equal(gapped.annualizedSharpe, null);
  const dd = performanceFrom([
    { ...points[0], equity: 10000 },
    { ...points[1], equity: 8000 },
    { ...points[2], equity: 1, marksFresh: false },
  ]);
  assert.equal(dd.sampledMarkToMarketDrawdownPercent, 20);
  assert.equal(dd.excludedStaleSnapshots, 1);
});
test('execution revalidation permits quote changes but rejects changed bars and macro evidence', () => {
  const m: Market = {
    symbol: 'TESTUSDT',
    timeframe: '1H',
    candles: [],
    price: 100,
    bid: 99,
    ask: 101,
    status: 'VALID',
    source: 'TEST',
    timestamp: Date.now(),
  };
  const before = context(m, { ...m, symbol: 'PAIRUSDT' }, []),
    after = structuredClone(before);
  after.assetA.price = 102;
  after.assetA.timestamp += 90000;
  assert.equal(evidenceChanged(before, after), false);
  after.assetA.candles.push({
    timestamp: 1,
    open: 100,
    high: 103,
    low: 99,
    close: 101,
    volume: 10,
  });
  assert.equal(evidenceChanged(before, after), true);
});
