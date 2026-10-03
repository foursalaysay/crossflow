import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction } from './db';
import {
  connectionConfig,
  accountScope,
  exchangeAccount,
  exchangeOrder,
  privateRequest,
  BitgetError,
  type ExchangeAccount,
} from './bitget-private';
import { getContext } from './service';
import { operatingMode, riskConfig } from './config';
import { assessRisk } from './risk';

export const ticketSchema = z
  .object({
    symbol: z.string().regex(/^[A-Za-z0-9]+USDT$/),
    pair: z.string().regex(/^[A-Za-z0-9]+USDT$/),
    side: z.enum(['buy', 'sell']),
    quantity: z.number().positive().finite(),
    stop: z.number().positive().finite().optional(),
    target: z.number().positive().finite().optional(),
  })
  .strict();
type Ticket = z.infer<typeof ticketSchema>;
export type LiveOrder = {
  id: string;
  scope: string;
  environment: 'demo' | 'live';
  createdAt: number;
  expiresAt: number;
  status: 'PREVIEW' | 'SUBMITTING' | 'SUBMITTED' | 'UNKNOWN' | 'REJECTED';
  input: Ticket;
  request: Record<string, string>;
  notional: number;
  confirmation: string;
  checks: string[];
  orderId?: string;
  error?: string;
  submittedAt?: number;
  exchange?: Awaited<ReturnType<typeof exchangeOrder>>;
  protection?: string;
};
function storage() {
  db().exec(
    'CREATE TABLE IF NOT EXISTS ExchangeOrder(id TEXT PRIMARY KEY, scope TEXT NOT NULL, payload TEXT NOT NULL)',
  );
  return db();
}
function save(order: LiveOrder) {
  storage()
    .prepare(
      'INSERT INTO ExchangeOrder VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
    )
    .run(order.id, order.scope, JSON.stringify(order));
}
function load(id: string) {
  const row = storage()
    .prepare('SELECT payload FROM ExchangeOrder WHERE id=? AND scope=?')
    .get(id, accountScope()) as { payload: string } | undefined;
  if (!row) throw Error('ORDER_NOT_FOUND_FOR_CURRENT_ACCOUNT');
  return JSON.parse(row.payload) as LiveOrder;
}
function orders(): LiveOrder[] {
  return (
    storage()
      .prepare('SELECT payload FROM ExchangeOrder WHERE scope=? ORDER BY rowid DESC')
      .all(accountScope()) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload));
}
export function publicOrder(order: LiveOrder) {
  const { scope: _scope, ...safe } = order;
  void _scope;
  return safe;
}
export function orderHistory() {
  return orders()
    .filter((o) => o.status !== 'PREVIEW')
    .slice(0, 50)
    .map(publicOrder);
}
function enabled() {
  const cfg = connectionConfig();
  if (!cfg.configured) throw Error('BITGET_CREDENTIALS_MISSING');
  if (!cfg.enabled)
    throw Error(
      `${cfg.environment.toUpperCase()}_TRADING_DISABLED: configure ENABLE_${cfg.environment.toUpperCase()}_TRADING locally`,
    );
  if (operatingMode() === 'READ_ONLY') throw Error('READ_ONLY');
  return cfg;
}
function checkLedger(
  account: ExchangeAccount,
  notional: number,
  side: 'buy' | 'sell',
  excluding?: string,
) {
  const cfg = riskConfig();
  const history = orders().filter(
    (o) => o.id !== excluding && o.status !== 'PREVIEW' && o.status !== 'REJECTED',
  );
  if (history.some((o) => o.status === 'UNKNOWN' || o.status === 'SUBMITTING'))
    throw Error('RECONCILIATION_REQUIRED');
  if (side === 'sell') return;
  if (account.usdtEquity === null || account.positionValue === null)
    throw Error(
      'ACCOUNT_SUMMARY_UNAVAILABLE: Bitget authenticated, but did not supply equity or exposure. Check Demo account funding and UTA support; new buys are blocked.',
    );
  if (
    history.some(
      (o) =>
        o.input.side === 'buy' &&
        o.protection !== 'PRESET_REPORTED' &&
        !(o.exchange?.orderStatus === 'cancelled' && o.exchange.cumExecQty === 0),
    )
  )
    throw Error(
      'VERIFY_PREVIOUS_ORDER_PROTECTION: reconcile and inspect in Bitget before another buy',
    );
  if (account.positionValue !== 0 || account.assets.some((a) => a.debt !== 0))
    throw Error('DEDICATED_SPOT_ACCOUNT_REQUIRED: derivatives or debt detected');
  const cash = account.assets.find((a) => a.coin === 'USDT');
  const capital = Math.min(account.usdtEquity, cash?.balance ?? 0);
  // Full principal is at risk, even if an exchange stop fails. This cap is deliberately stricter than modeled stop loss.
  if (notional * 1.003 > (capital * cfg.riskPercent) / 100) throw Error('FULL_PRINCIPAL_RISK_CAP');
  const day = new Date().toISOString().slice(0, 10);
  const key = `live-equity:${accountScope()}:${day}`;
  const prior = db().prepare('SELECT payload FROM Settings WHERE id=?').get(key) as
    { payload: string } | undefined;
  const high = Math.max(prior ? Number(prior.payload) : account.usdtEquity, account.usdtEquity);
  db()
    .prepare(
      'INSERT INTO Settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
    )
    .run(key, String(high));
  if (account.usdtEquity <= high * (1 - cfg.dailyLossPercent / 100))
    throw Error('OBSERVED_EQUITY_DRAWDOWN_LIMIT');
  const committed = history
    .filter(
      (o) =>
        o.input.side === 'buy' &&
        o.submittedAt &&
        new Date(o.submittedAt).toISOString().slice(0, 10) === day,
    )
    .reduce((n, o) => n + o.notional * 1.003, 0);
  if (committed + notional * 1.003 > (capital * cfg.dailyLossPercent) / 100)
    throw Error('DAILY_BUY_BUDGET_EXHAUSTED');
}
async function validate(input: Ticket, fixed?: LiveOrder) {
  const cfg = enabled();
  if (input.symbol === input.pair) throw Error('SELECT_DIFFERENT_PAIR');
  const [ctx, account] = await Promise.all([
    getContext(input.symbol, input.pair, '1H'),
    exchangeAccount(),
  ]);
  const a = ctx.assetA,
    spec = a.instrument,
    risk = riskConfig();
  if (
    a.status !== 'VALID' ||
    ctx.assetB.status !== 'VALID' ||
    !spec ||
    !a.ask ||
    !a.bid ||
    a.ask < a.bid ||
    Date.now() - a.timestamp > 15000 ||
    a.timestamp > Date.now() + 5000 ||
    Date.now() - ctx.assetB.timestamp > 60000 ||
    ctx.assetB.timestamp > Date.now() + 5000
  )
    throw Error('FRESH_MARKET_DATA_REQUIRED');
  if (((a.ask - a.bid) / a.ask) * 100 > risk.maxSpreadPercent) throw Error('SPREAD_LIMIT');
  const qty = input.quantity.toFixed(spec.quantityPrecision);
  if (Number(qty) !== input.quantity) throw Error('QUANTITY_PRECISION: use fewer decimals');
  const unit = 10 ** spec.pricePrecision;
  const price =
    fixed?.request.price ??
    (input.side === 'buy'
      ? Math.ceil(a.ask * 1.0005 * unit) / unit
      : Math.floor(a.bid * 0.9995 * unit) / unit
    ).toFixed(spec.pricePrecision);
  const notional = Number(qty) * Number(price);
  if (
    !Number.isFinite(notional) ||
    notional <= 0 ||
    notional > cfg.maxOrderUSDT ||
    notional < spec.minOrderAmount
  )
    throw Error('ORDER_NOTIONAL_OUTSIDE_MINIMUM_OR_CONFIGURED_CAP');
  if (Math.abs(Number(price) / (input.side === 'buy' ? a.ask : a.bid) - 1) > 0.002)
    throw Error('PRICE_MOVED: create a new preview');
  const coin = input.side === 'buy' ? 'USDT' : input.symbol.slice(0, -4);
  const balance = account.assets.find((v) => v.coin.toUpperCase() === coin.toUpperCase());
  if (
    !balance ||
    Math.min(balance.available, balance.balance) <
      (input.side === 'buy' ? notional * 1.003 : input.quantity)
  )
    throw Error('INSUFFICIENT_EXCHANGE_BALANCE');
  const request: Record<string, string> = {
    category: 'SPOT',
    symbol: input.symbol,
    side: input.side,
    orderType: 'limit',
    timeInForce: 'ioc',
    qty,
    price,
    autoBorrow: 'no',
    pxAmendType: 'no',
  };
  if (input.side === 'buy') {
    if (account.usdtEquity === null || account.positionValue === null)
      throw Error(
        'ACCOUNT_SUMMARY_UNAVAILABLE: Bitget authenticated, but did not supply equity or exposure. Check Demo account funding and UTA support; new buys are blocked.',
      );
    if (!input.stop || !input.target) throw Error('STOP_AND_TARGET_REQUIRED');
    if (
      Number(input.stop.toFixed(spec.pricePrecision)) !== input.stop ||
      Number(input.target.toFixed(spec.pricePrecision)) !== input.target
    )
      throw Error('STOP_TARGET_PRECISION');
    if (input.stop >= a.bid || input.stop >= Number(price) || input.target <= Number(price))
      throw Error('INVALID_STOP_TARGET');
    const result = assessRisk(
      {
        decision: 'LONG',
        asset: input.symbol,
        reasoningSummary: ['Human-confirmed exchange ticket'],
        entryZone: [a.ask * 0.995, a.ask * 1.005],
        invalidation: input.stop,
        targets: [input.target],
        confidence: 0,
        riskNotes: [],
        conditionsToReevaluate: [],
      },
      ctx,
      {
        balance: Math.min(balance.available, balance.balance),
        equity: account.usdtEquity,
        dailyPnl: 0,
        dayStartEquity: account.usdtEquity,
        openPositions: account.assets.filter((v) => v.coin !== 'USDT' && v.balance > 0).length,
        reserved: 0,
      },
      'PAPER',
      risk,
    ); // Reuse deterministic evidence checks with real exchange funds; no paper execution occurs.
    if (!['APPROVE', 'MODIFY'].includes(result.status) || input.quantity > result.quantity)
      throw Error(`EXCHANGE_RISK_REJECTED: ${result.reasons.join('; ')}`);
    Object.assign(request, {
      stopLoss: String(input.stop),
      takeProfit: String(input.target),
      slOrderType: 'market',
      tpOrderType: 'market',
    });
  }
  checkLedger(account, notional, input.side, fixed?.id);
  return {
    request,
    notional,
    account,
    checks: [
      'Fresh Bitget quotes and instrument precision',
      'Actual exchange available balance; borrowing disabled',
      ...(input.side === 'buy'
        ? [
            'Structural stop and macro risk checks',
            'Full purchase principal capped by risk percentage',
            'Conservative daily gross buy budget; observed equity drawdown guard',
          ]
        : ['Sell limited to available owned assets']),
      'IOC limit: unfilled quantity cancels; partial fills possible',
      'Preset TP/SL requested for buys; inspect protection on Bitget after a fill',
    ],
  };
}
export async function previewOrder(raw: unknown) {
  const input = ticketSchema.parse(raw),
    checked = await validate(input);
  const id = `cf${randomUUID().replaceAll('-', '').slice(0, 28)}`,
    cfg = connectionConfig();
  const order: LiveOrder = {
    id,
    scope: accountScope(),
    environment: cfg.environment,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30000,
    status: 'PREVIEW',
    input,
    request: { ...checked.request, clientOid: id },
    notional: checked.notional,
    confirmation: `${cfg.environment.toUpperCase()} ${input.side.toUpperCase()} ${input.symbol}`,
    checks: checked.checks,
  };
  save(order);
  return publicOrder(order);
}
export async function confirmOrder(id: string, confirmation: string) {
  enabled();
  const order = load(id);
  if (confirmation !== order.confirmation) throw Error('EXACT_CONFIRMATION_REQUIRED');
  if (order.status !== 'PREVIEW') return publicOrder(order); // Never re-submit an uncertain request.
  if (Date.now() > order.expiresAt) throw Error('PREVIEW_EXPIRED');
  const checked = await validate(order.input, order);
  transaction(() => {
    enabled();
    const current = load(id);
    if (current.status !== 'PREVIEW') throw Error('ALREADY_SUBMITTED');
    if (Date.now() > order.expiresAt) throw Error('PREVIEW_EXPIRED');
    checkLedger(checked.account, order.notional, order.input.side, id);
    order.status = 'SUBMITTING';
    order.submittedAt = Date.now();
    save(order);
  });
  try {
    const result = z
      .object({ orderId: z.string().min(1), clientOid: z.string() })
      .parse(await privateRequest('POST', '/api/v3/trade/place-order', order.request));
    if (result.clientOid !== order.id) throw Error('ORDER_RESPONSE_MISMATCH');
    order.status = 'SUBMITTED';
    order.orderId = result.orderId;
  } catch (e) {
    // These codes and any transport/parse errors have unknown outcomes; reserve budget until resolved.
    order.status =
      e instanceof BitgetError && !['40010', '40725', '45001'].includes(e.code)
        ? 'REJECTED'
        : 'UNKNOWN';
    order.error = e instanceof Error ? e.message : 'ORDER_OUTCOME_UNKNOWN';
  }
  save(order);
  return publicOrder(order);
}

/** Submit an already validated ticket without a repeated prompt when the
 * environment's explicit autonomous-execution flag is enabled. Validation is
 * repeated immediately before submission, so autonomy never bypasses risk. */
export async function executeAutonomousOrder(id: string) {
  const cfg = enabled();
  if (!cfg.autonomous) throw Error('AUTONOMOUS_EXECUTION_DISABLED');
  const order = load(id);
  if (order.status !== 'PREVIEW') return publicOrder(order);
  if (Date.now() > order.expiresAt) throw Error('PREVIEW_EXPIRED');
  const checked = await validate(order.input, order);
  transaction(() => {
    enabled();
    const current = load(id);
    if (current.status !== 'PREVIEW') throw Error('ALREADY_SUBMITTED');
    checkLedger(checked.account, order.notional, order.input.side, id);
    order.status = 'SUBMITTING';
    order.submittedAt = Date.now();
    save(order);
  });
  try {
    const result = z
      .object({ orderId: z.string().min(1), clientOid: z.string() })
      .parse(await privateRequest('POST', '/api/v3/trade/place-order', order.request));
    if (result.clientOid !== order.id) throw Error('ORDER_RESPONSE_MISMATCH');
    order.status = 'SUBMITTED';
    order.orderId = result.orderId;
  } catch (e) {
    order.status = e instanceof BitgetError && !['40010', '40725', '45001'].includes(e.code)
      ? 'REJECTED'
      : 'UNKNOWN';
    order.error = e instanceof Error ? e.message : 'ORDER_OUTCOME_UNKNOWN';
  }
  save(order);
  return publicOrder(order);
}
export async function reconcileOrder(id: string) {
  const order = load(id);
  if (order.status === 'PREVIEW' || order.status === 'REJECTED') throw Error('ORDER_NOT_SUBMITTED');
  const result = await exchangeOrder(id);
  if (
    result.clientOid !== id ||
    result.symbol !== order.input.symbol ||
    result.side !== order.input.side ||
    (order.orderId && result.orderId !== order.orderId)
  )
    throw Error('ORDER_RESPONSE_MISMATCH');
  order.exchange = result;
  order.orderId = result.orderId;
  order.status = 'SUBMITTED';
  order.protection =
    order.input.side === 'sell'
      ? 'EXPOSURE_REDUCTION'
      : Number(result.stopLoss) === order.input.stop &&
          Number(result.takeProfit) === order.input.target
        ? 'PRESET_REPORTED'
        : 'UNVERIFIED_CHECK_BITGET';
  delete order.error;
  save(order);
  return publicOrder(order);
}
