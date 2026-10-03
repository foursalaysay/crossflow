import { z } from 'zod';
import { Market, Instrument, Timeframe, timeframes, Candle } from './types';
const envelope = z.object({ code: z.string(), msg: z.string(), data: z.unknown() });
export async function bitget(path: string, params: Record<string, string>) {
  const response = await fetch(
    `https://api.bitget.com/api/v3/market/${path}?${new URLSearchParams({ category: 'SPOT', ...params })}`,
    { cache: 'no-store', signal: AbortSignal.timeout(12000) },
  );
  if (!response.ok) throw Error(`Bitget HTTP ${response.status}`);
  const result = envelope.parse(await response.json());
  if (result.code !== '00000') throw Error(`Bitget ${result.code}: ${result.msg}`);
  return result.data;
}
export async function instruments(): Promise<Instrument[]> {
  const data = z
    .array(
      z.object({
        symbol: z.string(),
        isReality: z.string().optional(),
        status: z.string(),
        quantityPrecision: z.coerce.number().int().min(0).max(12),
        pricePrecision: z.coerce.number().int().min(0).max(18),
        minOrderAmount: z.coerce.number().nonnegative(),
      }),
    )
    .parse(await bitget('instruments', {}));
  return data.map((v) => ({
    symbol: v.symbol,
    reality: v.isReality === 'yes',
    status: v.status,
    quantityPrecision: v.quantityPrecision,
    pricePrecision: v.pricePrecision,
    minOrderAmount: v.minOrderAmount,
  }));
}
export function parseCandles(data: unknown): Candle[] {
  const rows = z.array(z.array(z.union([z.string(), z.number(), z.null()])).min(5)).parse(data);
  return rows
    .map((r) => {
      const values = r.slice(0, 5).map(Number);
      if (
        values.some((v) => !Number.isFinite(v) || v <= 0) ||
        values[2] < Math.max(values[1], values[4]) ||
        values[3] > Math.min(values[1], values[4])
      )
        throw Error('Invalid OHLC');
      const volume = r[5] === undefined || r[5] === null || r[5] === '' ? null : Number(r[5]);
      if (volume !== null && (!Number.isFinite(volume) || volume < 0))
        throw Error('Invalid volume');
      return {
        timestamp: values[0],
        open: values[1],
        high: values[2],
        low: values[3],
        close: values[4],
        volume,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((v, i, a) => i === 0 || v.timestamp !== a[i - 1].timestamp);
}
export async function market(
  symbol: string,
  timeframe: Timeframe,
  universe?: Instrument[],
): Promise<Market> {
  const empty: Market = {
    symbol,
    timeframe,
    candles: [],
    price: null,
    bid: null,
    ask: null,
    timestamp: Date.now(),
    status: 'ERROR',
    source: 'Bitget REST v3',
  };
  try {
    const instrument = (universe ?? (await instruments())).find((v) => v.symbol === symbol);
    if (!instrument || instrument.status !== 'online')
      return {
        ...empty,
        status: 'UNAVAILABLE',
        error: 'Instrument not available in Bitget discovery',
      };
    const [raw, tickerRaw] = await Promise.all([
      bitget('candles', { symbol, interval: timeframe, limit: '300' }),
      bitget('tickers', { symbol }),
    ]);
    const candles = parseCandles(raw).filter(
      (c) => c.timestamp + timeframes[timeframe] <= Date.now(),
    );
    const ticker = z
      .array(
        z.object({
          lastPrice: z.coerce.number().positive(),
          bid1Price: z.coerce.number().nonnegative(),
          ask1Price: z.coerce.number().nonnegative(),
          ts: z.coerce.number(),
        }),
      )
      .parse(tickerRaw)[0];
    if (!ticker) throw Error('Missing ticker');
    const now = Date.now(),
      stale =
        now - ticker.ts > 60000 ||
        !candles.length ||
        now - candles.at(-1)!.timestamp > timeframes[timeframe] * 2;
    return {
      ...empty,
      instrument,
      candles,
      price: ticker.lastPrice,
      bid: ticker.bid1Price || null,
      ask: ticker.ask1Price || null,
      timestamp: ticker.ts,
      status: stale ? 'STALE' : candles.length < 40 ? 'INSUFFICIENT_DATA' : 'VALID',
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : 'Market data failed' };
  }
}

export async function watchlistQuotes() {
  const rows = z
    .array(
      z.object({
        symbol: z.string(),
        lastPrice: z.coerce.number().finite(),
        ts: z.coerce.number().finite(),
      }),
    )
    .parse(await bitget('tickers', {}));
  return Object.fromEntries(
    rows
      .filter((r) => r.lastPrice > 0)
      .map((r) => [r.symbol, { price: r.lastPrice, timestamp: r.ts }]),
  );
}
