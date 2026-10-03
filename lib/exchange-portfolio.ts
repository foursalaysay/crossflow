import { z } from 'zod';
import { connectionConfig, exchangeAccount, privateRequest } from './bitget-private';
const value = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z
    .union([z.string().trim().min(1), z.number()])
    .transform(Number)
    .pipe(z.number().finite())
    .nullable(),
);
export const recordKinds = ['open', 'history', 'fills'] as const;
export type RecordKind = (typeof recordKinds)[number];
const order = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.string(),
  orderStatus: z.string(),
  qty: value,
  price: value,
  cumExecQty: value,
  avgPrice: value,
  createdTime: value,
});
const fill = z.object({
  execId: z.string(),
  orderId: z.string(),
  symbol: z.string(),
  side: z.string(),
  execQty: value,
  execPrice: value,
  execValue: value,
  createdTime: value,
  feeDetail: z.array(z.object({ feeCoin: z.string().nullable(), fee: value })).optional(),
});
export type ExchangeRecord = {
  id: string;
  orderId: string;
  symbol: string;
  side: string;
  status: string;
  quantity: number | null;
  filled: number | null;
  price: number | null;
  average: number | null;
  timestamp: number | null;
  fees: { coin: string | null; amount: number | null }[];
};
export function parseRecords(raw: unknown, kind: RecordKind) {
  const data = z
    .object({
      list: z
        .array(z.unknown())
        .nullable()
        .transform((v) => v ?? []),
      cursor: z.string().nullish(),
    })
    .parse(raw);
  const rows: ExchangeRecord[] = data.list.map((item) => {
    if (kind === 'fills') {
      const v = fill.parse(item);
      return {
        id: v.execId,
        orderId: v.orderId,
        symbol: v.symbol,
        side: v.side,
        status: 'filled',
        quantity: v.execQty,
        filled: v.execQty,
        price: v.execPrice,
        average: v.execPrice,
        timestamp: v.createdTime,
        fees: (v.feeDetail ?? []).map((f) => ({ coin: f.feeCoin, amount: f.fee })),
      };
    }
    const v = order.parse(item);
    return {
      id: v.orderId,
      orderId: v.orderId,
      symbol: v.symbol,
      side: v.side,
      status: v.orderStatus,
      quantity: v.qty,
      filled: v.cumExecQty,
      price: v.price,
      average: v.avgPrice,
      timestamp: v.createdTime,
      fees: [],
    };
  });
  return { rows, cursor: data.list.length ? data.cursor || null : null };
}
export async function exchangeRecords(
  kind: RecordKind,
  cursor?: string,
  startTime?: number,
  endTime?: number,
) {
  const end = endTime ?? Date.now(),
    start = startTime ?? end - 30 * 86400000;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    end - start > 30 * 86400000 ||
    start < Date.now() - 90 * 86400000 ||
    end > Date.now() + 5000
  )
    throw Error('INVALID_HISTORY_WINDOW');
  const path = { open: 'unfilled-orders', history: 'history-orders', fills: 'fills' }[kind];
  const params: Record<string, string> = {
    category: 'SPOT',
    limit: '100',
    ...(cursor ? { cursor } : {}),
  };
  if (kind !== 'open') Object.assign(params, { startTime: String(start), endTime: String(end) });
  return {
    ...parseRecords(await privateRequest('GET', `/api/v3/trade/${path}`, params), kind),
    startTime: start,
    endTime: end,
  };
}
export async function exchangePortfolio() {
  const config = connectionConfig();
  const kinds = recordKinds;
  const results = await Promise.allSettled([
    exchangeAccount(),
    ...kinds.map((kind) => exchangeRecords(kind)),
  ]);
  const accountResult = results[0] as PromiseSettledResult<
    Awaited<ReturnType<typeof exchangeAccount>>
  >;
  const records = {} as Record<RecordKind, Awaited<ReturnType<typeof exchangeRecords>> | null>;
  const errors: Record<string, string> = {};
  const describe = (e: unknown) =>
    e instanceof z.ZodError
      ? 'Bitget returned an unsupported response format'
      : e instanceof Error
        ? e.message
        : 'Exchange request failed';
  if (accountResult.status === 'rejected') errors.account = describe(accountResult.reason);
  kinds.forEach((kind, i) => {
    const result = results[i + 1] as PromiseSettledResult<
      Awaited<ReturnType<typeof exchangeRecords>>
    >;
    records[kind] = result.status === 'fulfilled' ? result.value : null;
    if (result.status === 'rejected') errors[kind] = describe(result.reason);
  });
  return {
    environment: config.environment,
    configured: config.configured,
    checkedAt: Date.now(),
    account: accountResult.status === 'fulfilled' ? accountResult.value : null,
    records,
    errors,
  };
}
export type ExchangePortfolio = Awaited<ReturnType<typeof exchangePortfolio>>;
