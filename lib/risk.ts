import { MarketContext } from './analysis';
import { Decision, RiskConfig, defaultRisk } from './types';
export type AccountRisk = {
  balance: number;
  equity: number;
  dailyPnl: number;
  dayStartEquity: number;
  openPositions: number;
  reserved: number;
};
export type RiskResult = {
  status: 'APPROVE' | 'MODIFY' | 'REJECT' | 'NO_ORDER';
  reasons: string[];
  quantity: number;
  riskAmount: number;
  entry: number | null;
  stop: number | null;
};
export function assessRisk(
  decision: Decision,
  ctx: MarketContext,
  account: AccountRisk,
  mode: string,
  config: RiskConfig = defaultRisk,
  now = Date.now(),
): RiskResult {
  const result: RiskResult = {
    status: 'REJECT',
    reasons: [],
    quantity: 0,
    riskAmount: 0,
    entry: null,
    stop: decision.invalidation,
  };
  const reject = (reason: string) => ({ ...result, reasons: [reason] });
  if (decision.decision === 'WAIT')
    return { ...result, status: 'NO_ORDER', reasons: ['Agent selected WAIT'] };
  if (mode !== 'PAPER') return reject(mode === 'LIVE' ? 'LIVE_TRADING_DISABLED' : 'READ_ONLY');
  const a = ctx.assetA,
    b = ctx.assetB;
  if (
    a.status !== 'VALID' ||
    b.status !== 'VALID' ||
    now - a.timestamp > 60000 ||
    now - b.timestamp > 60000 ||
    a.timestamp > now + 5000 ||
    b.timestamp > now + 5000
  )
    return reject('CRITICAL_DATA_NOT_FRESH');
  if (decision.asset !== a.symbol || !a.instrument || a.instrument.status !== 'online')
    return reject('INSTRUMENT_UNAVAILABLE');
  if (decision.decision === 'CLOSE' || decision.decision === 'REDUCE')
    return {
      ...result,
      status: 'APPROVE',
      reasons: ['Reduce existing exposure only; no new position'],
    };
  // The current universe is spot. A short proposal is logged, never silently simulated as an available spot order.
  if (decision.decision === 'SHORT') return reject('SPOT_SHORT_UNSUPPORTED');
  if (account.dailyPnl <= (-account.dayStartEquity * config.dailyLossPercent) / 100)
    return reject('DAILY_LOSS_LIMIT');
  if (account.openPositions >= config.maxPositions) return reject('POSITION_LIMIT');
  if (
    !a.bid ||
    !a.ask ||
    a.ask < a.bid ||
    ((a.ask - a.bid) / a.ask) * 100 > config.maxSpreadPercent
  )
    return reject('SPREAD_UNAVAILABLE_OR_EXCESSIVE');
  if (!decision.entryZone || !decision.invalidation || !decision.targets.length)
    return reject('INCOMPLETE_ORDER');
  const entry = a.ask * 1.0005,
    stop = decision.invalidation;
  if (
    decision.entryZone[0] > decision.entryZone[1] ||
    entry < decision.entryZone[0] ||
    entry > decision.entryZone[1] ||
    stop >= entry ||
    decision.targets.some((t) => t <= entry)
  )
    return reject('INVALID_ORDER_GEOMETRY');
  const supports = [
    ...a.analysis.pivots.filter((p) => p.type === 'LOW').map((p) => p.price),
    ...a.analysis.zones.filter((z) => z.type === 'SUPPORT').map((z) => z.lowerBound),
  ];
  if (!supports.some((p) => stop < p && p < entry && Math.abs(p - stop) / entry < 0.02))
    return reject('STOP_NOT_STRUCTURALLY_GROUNDED');
  let budget = (Math.min(account.balance, account.equity) * config.riskPercent) / 100;
  const event = ctx.macro.events.find(
    (e) =>
      e.importance === 'HIGH' &&
      e.timestamp &&
      (!e.affectedAssets.length || e.affectedAssets.includes(a.symbol)) &&
      now >= Date.parse(e.timestamp) - config.beforeMinutes * 60000 &&
      now <= Date.parse(e.timestamp) + config.afterMinutes * 60000,
  );
  if (event && config.eventPolicy === 'BLOCK') return reject(`MACRO_RISK_WINDOW: ${event.title}`);
  if (event && config.eventPolicy === 'REDUCE') budget *= 0.5;
  const unitRisk = entry - stop + entry * 0.001 + stop * 0.001 + stop * 0.0005;
  const scale = 10 ** a.instrument.quantityPrecision;
  const quantity =
    Math.floor(
      Math.min(
        budget / unitRisk,
        Math.max(0, account.balance - account.reserved) / (entry * 1.001),
      ) * scale,
    ) / scale;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity * entry < a.instrument.minOrderAmount)
    return reject('MINIMUM_SIZE_OR_BALANCE');
  return {
    ...result,
    status: event && config.eventPolicy === 'REDUCE' ? 'MODIFY' : 'APPROVE',
    entry,
    quantity,
    riskAmount: quantity * unitRisk,
    reasons: [
      `Risk capped at ${config.riskPercent}% including estimated fees and slippage`,
      ...(event ? [`Event policy ${config.eventPolicy}`] : []),
    ],
  };
}
export class BitgetOrderExecutor {
  async executeOrder(previewId?: string, confirmation?: string) {
    const { connectionConfig } = await import('./bitget-private');
    const config = connectionConfig();
    if (!config.enabled) throw Error('LIVE_TRADING_DISABLED');
    if (!previewId || !confirmation) throw Error('ORDER_CONFIRMATION_REQUIRED');
    const { confirmOrder } = await import('./live');
    return confirmOrder(previewId, confirmation);
  }
}
