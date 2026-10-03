import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFedFeed } from '../lib/macro/source';
import { macroSignals } from '../lib/macro/analysis';
import { MacroEvent, Market } from '../lib/types';
const now = Date.parse('2026-09-22T00:00:00Z');
test('Fed feed preserves publication dates, source attribution, and unknown numbers', () => {
  const xml =
    '<rss><channel><item><title>Federal Reserve issues FOMC statement</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm</link><pubDate>Wed, 16 Sep 2026 18:00:00 GMT</pubDate></item></channel></rss>';
  const [event] = parseFedFeed(xml, now);
  assert.equal(event.timestamp, '2026-09-16T18:00:00.000Z');
  assert.equal(event.eventType, 'FOMC_STATEMENT');
  assert.equal(event.actual, null);
  assert.equal(event.forecast, null);
  assert.equal(event.surprise, null);
  assert.equal(event.importance, 'HIGH');
  assert.deepEqual(parseFedFeed(xml.replace('16 Sep', '30 Sep'), now), []);
  assert.deepEqual(parseFedFeed(xml.replace('www.federalreserve.gov', 'evil.example'), now), []);
  assert.throws(() => parseFedFeed('<!DOCTYPE foo>' + xml, now));
});
test('macro phase and compression are observations, with no directional signal', () => {
  const event: MacroEvent = {
    id: 'event',
    timestamp: new Date(now + 30 * 60000).toISOString(),
    eventType: 'CPI',
    title: 'Test fixture CPI',
    country: 'US',
    importance: 'HIGH',
    actual: null,
    forecast: null,
    previous: null,
    surprise: null,
    source: 'TEST',
    affectedAssets: [],
    status: 'UPCOMING',
  };
  const market: Market = {
    symbol: 'BTCUSDT',
    timeframe: '5m',
    candles: Array.from({ length: 40 }, (_, i) => ({
      timestamp: now - (40 - i) * 300000,
      open: 100,
      high: i < 20 ? 105 : 101,
      low: i < 20 ? 95 : 99,
      close: 100,
      volume: 10,
    })),
    price: 100,
    bid: 99.99,
    ask: 100.01,
    timestamp: now,
    status: 'VALID',
    source: 'TEST',
  };
  const result = macroSignals([event], [market], now);
  assert.equal(result.phase, 'PRE_EVENT_SETUP');
  assert.equal(result.observations[0].compressed, true);
  assert.equal(result.surprise, null);
  const released = {
    ...event,
    timestamp: new Date(now - 60000).toISOString(),
    status: 'RELEASED' as const,
    actual: 2.8,
    forecast: 3,
  };
  const post = macroSignals([released], [market], now);
  assert.equal(post.phase, 'POST_EVENT_CONFIRMATION');
  assert.equal(post.surprise?.numericDirection, 'BELOW_FORECAST');
  assert.ok(Math.abs(post.surprise!.raw + 0.2) < 1e-10);
});
