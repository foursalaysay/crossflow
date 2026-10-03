import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  signBitget,
  privateRequest,
  exchangeAccount,
  connectionConfig,
} from '../lib/bitget-private';
import { previewOrder, confirmOrder, reconcileOrder, orderHistory } from '../lib/live';
import { db } from '../lib/db';
import { technical } from '../lib/analysis';
process.env.CROSSFLOW_DB = join(mkdtempSync(join(tmpdir(), 'crossflow-live-')), 'test.sqlite');

function setup() {
  process.env.BITGET_API_KEY = 'FAKE_TEST_KEY';
  process.env.BITGET_API_SECRET = 'FAKE_TEST_SECRET';
  process.env.BITGET_PASSPHRASE = 'FAKE_TEST_PHRASE';
  process.env.BITGET_ENV = 'demo';
  process.env.ENABLE_LIVE_TRADING = 'true';
  process.env.ENABLE_DEMO_TRADING = 'true';
  process.env.BITGET_MAX_ORDER_USDT = '10';
}
test('HMAC signs exact GET query and POST bytes; demo header, fixed host, no redirect or retry', async () => {
  setup();
  process.env.ENABLE_LIVE_TRADING = 'false';
  assert.equal(connectionConfig().enabled, true);
  assert.equal(
    signBitget('secret', '123', 'get', '/api/v3/trade/order-info?clientOid=a%3Ab'),
    createHmac('sha256', 'secret')
      .update('123GET/api/v3/trade/order-info?clientOid=a%3Ab')
      .digest('base64'),
  );
  const original = globalThis.fetch;
  const requests: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init: init! });
    return Response.json({ code: '00000', msg: 'success', data: { ok: true } });
  };
  try {
    await privateRequest('GET', '/api/v3/trade/order-info', { clientOid: 'a:b' });
    await privateRequest('POST', '/api/v3/trade/place-order', { category: 'SPOT', qty: '0.01' });
    for (const r of requests) {
      const h = r.init.headers as Record<string, string>;
      assert.equal(h.paptrading, '1');
      assert.equal(r.init.redirect, 'error');
      assert.equal(
        h['ACCESS-SIGN'],
        signBitget(
          'FAKE_TEST_SECRET',
          h['ACCESS-TIMESTAMP'],
          r.init.method!,
          r.url.replace('https://api.bitget.com', ''),
          String(r.init.body ?? ''),
        ),
      );
    }
    process.env.BITGET_ENV = 'live';
    await privateRequest('GET', '/api/v3/account/assets');
    assert.equal((requests.at(-1)!.init.headers as Record<string, string>).paptrading, undefined);
    process.env.ENABLE_LIVE_TRADING = 'false';
    await assert.rejects(() => privateRequest('POST', '/api/v3/trade/place-order', {}), /DISABLED/);
    assert.equal(requests.length, 3);
    process.env.BITGET_ENV = 'typo';
    await assert.rejects(() => privateRequest('GET', '/api/v3/account/assets'));
  } finally {
    globalThis.fetch = original;
    setup();
  }
});

test('confirmed live flow uses exchange funds, exact confirmation, durable idempotency and reconciliation', async () => {
  setup();
  const original = globalThis.fetch;
  let posts = 0,
    timeout = false,
    malformedBalance = false,
    missingSummary = false,
    balance = 10000;
  const now = Date.now(),
    hour = 3600000;
  const candles = Array.from({ length: 100 }, (_, i) => {
    const p = 100 + i * 0.02 + Math.sin(i * 0.6) * 0.5;
    return {
      timestamp: Math.floor(now / hour) * hour - (100 - i) * hour,
      open: p,
      high: p + 0.2,
      low: p - 0.2,
      close: p + 0.05,
      volume: 100,
    };
  });
  const price = candles.at(-1)!.close;
  const stop =
    Math.floor(
      technical(candles)
        .pivots.filter((p) => p.type === 'LOW' && p.price < price)
        .at(-1)!.price *
        100 -
        1,
    ) / 100;
  let last: Record<string, string> = {};
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    let data: unknown;
    if (url.pathname.endsWith('/assets'))
      data = {
        usdtEquity: missingSummary ? '' : String(balance),
        positionValue: missingSummary ? '' : '0',
        assets: [
          {
            coin: 'USDT',
            available: malformedBalance ? '' : String(balance),
            balance: String(balance),
            debt: '0',
            locked: '0',
          },
          { coin: 'TEST', available: '1', balance: '1', debt: '0', locked: '0' },
        ],
      };
    else if (url.pathname.endsWith('/instruments'))
      data = ['TESTUSDT', 'PAIRUSDT'].map((symbol) => ({
        symbol,
        status: 'online',
        quantityPrecision: '4',
        pricePrecision: '2',
        minOrderAmount: '1',
      }));
    else if (url.pathname.endsWith('/candles'))
      data = candles.map((c) =>
        [c.timestamp, c.open, c.high, c.low, c.close, c.volume].map(String),
      );
    else if (url.pathname.endsWith('/tickers'))
      data = [
        {
          lastPrice: String(price),
          bid1Price: String(price - 0.01),
          ask1Price: String(price + 0.01),
          ts: String(Date.now()),
        },
      ];
    else if (url.pathname.endsWith('/place-order')) {
      posts++;
      last = JSON.parse(String(init!.body));
      if (timeout) throw Error('timeout');
      data = { orderId: 'test-order', clientOid: last.clientOid };
    } else if (url.pathname.endsWith('/order-info'))
      data = {
        orderId: 'test-order',
        clientOid: last.clientOid,
        symbol: last.symbol,
        category: 'SPOT',
        side: last.side,
        orderStatus: 'filled',
        cumExecQty: last.qty,
        avgPrice: last.price,
        stopLoss: last.stopLoss,
        takeProfit: last.takeProfit,
      };
    else throw Error('Unexpected request');
    return Response.json({ code: '00000', msg: 'success', data });
  };
  const buy = {
    symbol: 'TESTUSDT',
    pair: 'PAIRUSDT',
    side: 'buy',
    quantity: 0.05,
    stop,
    target: 110,
  };
  try {
    missingSummary = true;
    const incompleteAccount = await exchangeAccount();
    assert.equal(incompleteAccount.usdtEquity, null);
    assert.equal(incompleteAccount.positionValue, null);
    await assert.rejects(() => previewOrder(buy), /ACCOUNT_SUMMARY_UNAVAILABLE/);
    assert.equal(posts, 0);
    missingSummary = false;
    malformedBalance = true;
    await assert.rejects(() => exchangeAccount());
    malformedBalance = false;
    balance = 1;
    await assert.rejects(() => previewOrder(buy), /INSUFFICIENT/);
    balance = 10000;
    await assert.rejects(() => previewOrder({ ...buy, quantity: 1 }), /NOTIONAL/);
    await assert.rejects(() => previewOrder({ ...buy, stop: 200 }), /INVALID_STOP/);
    const p = await previewOrder(buy);
    assert.equal(posts, 0);
    assert.equal(p.environment, 'demo');
    assert.equal('scope' in p, false);
    assert.equal(p.request.autoBorrow, 'no');
    assert.equal(p.request.timeInForce, 'ioc');
    await assert.rejects(() => confirmOrder(p.id, 'yes'), /CONFIRMATION/);
    assert.equal(posts, 0);
    process.env.ENABLE_DEMO_TRADING = 'false';
    await assert.rejects(() => confirmOrder(p.id, p.confirmation), /DISABLED/);
    process.env.ENABLE_LIVE_TRADING = 'true';
    process.env.ENABLE_DEMO_TRADING = 'true';
    const simultaneous = await Promise.allSettled([
      confirmOrder(p.id, p.confirmation),
      confirmOrder(p.id, p.confirmation),
    ]);
    assert.ok(simultaneous.some((r) => r.status === 'fulfilled' && r.value.status === 'SUBMITTED'));
    assert.equal(posts, 1);
    assert.equal(last.qty, '0.0500');
    assert.equal(last.stopLoss, String(stop));
    assert.equal(last.slOrderType, 'market');
    await confirmOrder(p.id, p.confirmation);
    assert.equal(posts, 1);
    await assert.rejects(() => previewOrder(buy), /VERIFY_PREVIOUS/);
    const filled = await reconcileOrder(p.id);
    assert.equal(filled.exchange?.cumExecQty, 0.05);
    assert.equal(filled.protection, 'PRESET_REPORTED');
    const second = await previewOrder({ ...buy, side: 'sell', stop: undefined, target: undefined });
    timeout = true;
    const unknown = await confirmOrder(second.id, second.confirmation);
    assert.equal(unknown.status, 'UNKNOWN');
    await confirmOrder(second.id, second.confirmation);
    assert.equal(posts, 2);
    await assert.rejects(() => previewOrder(buy), /RECONCILIATION_REQUIRED/);
    await reconcileOrder(second.id);
    assert.equal(orderHistory().length, 2);
    const expired = await previewOrder(buy);
    const row = db().prepare('SELECT payload FROM ExchangeOrder WHERE id=?').get(expired.id) as {
      payload: string;
    };
    const value = JSON.parse(row.payload);
    value.expiresAt = Date.now() - 1;
    db()
      .prepare('UPDATE ExchangeOrder SET payload=? WHERE id=?')
      .run(JSON.stringify(value), expired.id);
    await assert.rejects(() => confirmOrder(expired.id, expired.confirmation), /EXPIRED/);
    db().prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)').run('mode', 'READ_ONLY');
    await assert.rejects(() => previewOrder(buy), /READ_ONLY/);
    assert.equal(posts, 2);
  } finally {
    globalThis.fetch = original;
    db().prepare('DELETE FROM Settings WHERE id=?').run('mode');
  }
});
