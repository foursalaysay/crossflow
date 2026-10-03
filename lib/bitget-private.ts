import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

export function connectionConfig() {
  const environment = z.enum(['demo', 'live']).parse(process.env.BITGET_ENV ?? 'demo');
  return {
    environment,
    configured: !!(
      process.env.BITGET_API_KEY &&
      process.env.BITGET_API_SECRET &&
      process.env.BITGET_PASSPHRASE
    ),
    enabled:
      environment === 'demo'
        ? process.env.ENABLE_DEMO_TRADING === 'true'
        : process.env.ENABLE_LIVE_TRADING === 'true',
    autonomous:
      environment === 'demo'
        ? process.env.ENABLE_DEMO_AUTONOMY === 'true'
        : process.env.ENABLE_LIVE_AUTONOMY === 'true',
    maxOrderUSDT: z.coerce
      .number()
      .positive()
      .max(1000)
      .parse(process.env.BITGET_MAX_ORDER_USDT ?? '10'),
  };
}
export function accountScope() {
  return createHash('sha256')
    .update(`${connectionConfig().environment}:${process.env.BITGET_API_KEY ?? ''}`)
    .digest('hex');
}
export function signBitget(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body = '',
) {
  return createHmac('sha256', secret)
    .update(timestamp + method.toUpperCase() + path + body)
    .digest('base64');
}
export class BitgetError extends Error {
  constructor(public code: string) {
    super(
      `Bitget ${code}. Check API permissions, account mode and the Bitget error documentation.`,
    );
  }
}
// Fixed origin, no redirects, no retries. Never log headers, secrets or raw upstream error bodies.
export async function privateRequest(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string> = {},
) {
  const config = connectionConfig();
  if (!config.configured) throw Error('BITGET_CREDENTIALS_MISSING');
  if (!/^\/api\/v3\/(account|trade)\/[a-z-]+$/.test(path)) throw Error('INVALID_BITGET_PATH');
  if (method === 'POST' && !config.enabled) throw Error('LIVE_TRADING_DISABLED');
  const query = method === 'GET' ? new URLSearchParams(params).toString() : '';
  const requestPath = path + (query ? `?${query}` : '');
  const body = method === 'POST' ? JSON.stringify(params) : '';
  const timestamp = String(Date.now());
  let response: Response;
  try {
    response = await fetch(`https://api.bitget.com${requestPath}`, {
      method,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: {
        'ACCESS-KEY': process.env.BITGET_API_KEY!,
        'ACCESS-SIGN': signBitget(
          process.env.BITGET_API_SECRET!,
          timestamp,
          method,
          requestPath,
          body,
        ),
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': process.env.BITGET_PASSPHRASE!,
        'Content-Type': 'application/json',
        locale: 'en-US',
        ...(config.environment === 'demo' ? { paptrading: '1' } : {}),
      },
      ...(body ? { body } : {}),
    });
  } catch {
    throw Error('BITGET_NETWORK_OR_TIMEOUT: reconcile before attempting another order');
  }
  if (!response.ok)
    throw Error(`BITGET_HTTP_${response.status}: reconcile before attempting another order`);
  const result = z.object({ code: z.string(), data: z.unknown() }).parse(await response.json());
  if (result.code !== '00000') throw new BitgetError(result.code);
  return result.data;
}
const numeric = z
  .union([z.string().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().finite());
const optionalSummaryNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  numeric.nullable(),
);
export async function exchangeAccount() {
  return z
    .object({
      usdtEquity: optionalSummaryNumber,
      usdtUnrealisedPnl: optionalSummaryNumber,
      positionValue: optionalSummaryNumber,
      assets: z.array(
        z.object({
          coin: z.string(),
          available: numeric,
          balance: numeric,
          debt: numeric,
          locked: numeric,
        }),
      ),
    })
    .parse(await privateRequest('GET', '/api/v3/account/assets'));
}
export type ExchangeAccount = Awaited<ReturnType<typeof exchangeAccount>>;
export const orderInfoSchema = z.object({
  orderId: z.string(),
  clientOid: z.string(),
  symbol: z.string(),
  category: z.literal('SPOT'),
  side: z.enum(['buy', 'sell']),
  orderStatus: z.string(),
  cumExecQty: numeric,
  avgPrice: numeric,
  stopLoss: z.string().optional(),
  takeProfit: z.string().optional(),
});
export async function exchangeOrder(clientOid: string) {
  return orderInfoSchema.parse(
    await privateRequest('GET', '/api/v3/trade/order-info', { clientOid }),
  );
}
