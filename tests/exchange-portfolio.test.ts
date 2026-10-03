import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecords, exchangePortfolio } from '../lib/exchange-portfolio';
test('empty Bitget lists and optional numbers preserve missing versus zero values', () => {
  assert.deepEqual(parseRecords({ list: null, cursor: null }, 'fills'), { rows: [], cursor: null });
  const p = parseRecords(
    {
      list: [
        {
          orderId: '1',
          symbol: 'BTCUSDT',
          side: 'buy',
          orderStatus: 'live',
          qty: '1',
          price: '0',
          cumExecQty: '0',
          avgPrice: '',
          createdTime: '123',
        },
      ],
      cursor: 'next',
    },
    'open',
  );
  assert.equal(p.rows[0].average, null);
  assert.equal(p.rows[0].filled, 0);
  assert.equal(p.cursor, 'next');
  assert.throws(() => parseRecords({}, 'fills'));
  assert.throws(() => parseRecords({ list: [{ orderId: 'x' }] }, 'history'));
});
test('portfolio preserves valid account and orders if a fills request fails', async () => {
  const original = globalThis.fetch;
  process.env.BITGET_API_KEY = 'TEST';
  process.env.BITGET_API_SECRET = 'TEST';
  process.env.BITGET_PASSPHRASE = 'TEST';
  process.env.BITGET_ENV = 'demo';
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, 'GET');
    assert.equal((init?.headers as Record<string, string>).paptrading, '1');
    const path = String(url);
    if (path.includes('/fills')) return Response.json({}, { status: 503 });
    return Response.json({
      code: '00000',
      data: path.includes('/assets')
        ? { usdtEquity: '100', usdtUnrealisedPnl: '0', positionValue: '', assets: [] }
        : { list: [], cursor: null },
    });
  };
  try {
    const result = await exchangePortfolio();
    assert.equal(result.account?.usdtEquity, 100);
    assert.equal(result.account?.usdtUnrealisedPnl, 0);
    assert.equal(result.account?.positionValue, null);
    assert.deepEqual(result.records.open?.rows, []);
    assert.equal(result.records.fills, null);
    assert.match(result.errors.fills, /503/);
  } finally {
    globalThis.fetch = original;
    for (const k of ['BITGET_API_KEY', 'BITGET_API_SECRET', 'BITGET_PASSPHRASE', 'BITGET_ENV'])
      delete process.env[k];
  }
});
