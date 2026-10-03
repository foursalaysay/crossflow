import { all, db } from './db';
import { Decision } from './types';
import { MarketContext, mean, std } from './analysis';
import { RiskResult } from './risk';
export type Trade = {
  id: string;
  decisionId: string;
  mode: 'PAPER';
  asset: string;
  pairedAsset: string;
  direction: 'LONG';
  timeframe: string;
  openedAt: number;
  closedAt: number | null;
  entry: number;
  stop: number;
  targets: number[];
  quantity: number;
  initialQuantity: number;
  riskAmount: number;
  entryFee: number;
  fees: number;
  slippage: number;
  realizedPnL: number;
  exitPrice: number | null;
  exitTurnover?: number;
  mark: number;
  mae: number;
  mfe: number;
  status: 'OPEN' | 'CLOSED';
  tags: string[];
  context: MarketContext;
  agentDecision: Decision;
  riskDecision: RiskResult;
  lessons: string[];
  rMultiple: number | null;
  decisionQuality: string;
  executionQuality: string;
  outcomeQuality: string;
  lastManagedAt: number;
  markTimestamp?: number;
  duration: number | null;
  reflection?: unknown;
};
export function trades() {
  return all<Trade>('Trade');
}
export function saveTrade(t: Trade) {
  db()
    .prepare(
      'INSERT INTO Trade(id,decisionId,status,mode,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload',
    )
    .run(t.id, t.decisionId, t.status, t.mode, JSON.stringify(t));
  db()
    .prepare(
      'INSERT INTO TradeJournal(tradeId,payload) VALUES(?,?) ON CONFLICT(tradeId) DO UPDATE SET payload=excluded.payload',
    )
    .run(t.id, JSON.stringify(t));
}
export function account() {
  const ts = trades(),
    open = ts.filter((t) => t.status === 'OPEN'),
    balance = 10000 + ts.reduce((s, t) => s + t.realizedPnL - t.entryFee, 0),
    unrealized = open.reduce((s, t) => s + (t.mark - t.entry) * t.quantity, 0);
  const dayStart = new Date().setUTCHours(0, 0, 0, 0),
    daily = (
      db()
        .prepare('SELECT COALESCE(SUM(amount),0) AS amount FROM Cashflow WHERE timestamp>=?')
        .get(dayStart) as { amount: number }
    ).amount;
  return {
    balance,
    equity: balance + unrealized,
    unrealized,
    dailyPnl: daily + Math.min(0, unrealized),
    dayStartEquity: Math.max(1, balance - daily),
    openPositions: open.length,
    reserved: open.reduce((s, t) => s + t.entry * t.quantity, 0),
  };
}
export function tags(ctx: MarketContext) {
  return [
    ctx.assetA.symbol,
    ctx.assetB.symbol,
    ctx.assetA.analysis.regime,
    ...ctx.events.map((e) => e.type),
    ...((ctx.assetA.analysis.relativeVolume ?? 0) > 1.25 ? ['HIGH_VOLUME'] : []),
    ...ctx.macro.events
      .filter((e) => e.timestamp && Math.abs(ctx.timestamp - Date.parse(e.timestamp)) < 86400000)
      .map((e) => `MACRO_${e.eventType}`),
  ];
}
export function memory(ctx: MarketContext) {
  const current = tags(ctx);
  return trades()
    .filter((t) => t.status === 'CLOSED' && t.closedAt! < ctx.timestamp)
    .map((t) => ({
      tradeId: t.id,
      similarity:
        current.filter((v) => t.tags.includes(v)).length /
        Math.max(1, new Set([...current, ...t.tags]).size),
      outcomeR: t.rMultiple,
      lessons: t.lessons,
      decisionQuality: t.decisionQuality,
    }))
    .filter((t) => t.similarity > 0.15)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}
export class PaperOrderExecutor {
  executeOrder(id: string, ctx: MarketContext, decision: Decision, risk: RiskResult) {
    if (
      !['APPROVE', 'MODIFY'].includes(risk.status) ||
      !risk.entry ||
      !risk.stop ||
      risk.quantity <= 0
    )
      throw Error('Unapproved paper order');
    const fee = risk.entry * risk.quantity * 0.001;
    const t: Trade = {
      id: crypto.randomUUID(),
      decisionId: id,
      mode: 'PAPER',
      asset: decision.asset,
      pairedAsset: ctx.assetB.symbol,
      direction: 'LONG',
      timeframe: ctx.assetA.timeframe,
      openedAt: ctx.timestamp,
      closedAt: null,
      entry: risk.entry,
      stop: risk.stop,
      targets: decision.targets,
      quantity: risk.quantity,
      initialQuantity: risk.quantity,
      riskAmount: risk.riskAmount,
      entryFee: fee,
      fees: fee,
      slippage: (risk.entry - ctx.assetA.ask!) * risk.quantity,
      realizedPnL: 0,
      exitPrice: null,
      mark: ctx.assetA.price!,
      mae: 0,
      mfe: 0,
      status: 'OPEN',
      tags: tags(ctx),
      context: ctx,
      agentDecision: decision,
      riskDecision: risk,
      lessons: [],
      rMultiple: null,
      decisionQuality: 'UNREVIEWED',
      executionQuality: 'ESTIMATED',
      outcomeQuality: 'OPEN',
      lastManagedAt: ctx.timestamp,
      markTimestamp: ctx.assetA.timestamp,
      duration: null,
    };
    saveTrade(t);
    db()
      .prepare('INSERT INTO Cashflow VALUES(?,?,?,?)')
      .run(crypto.randomUUID(), t.id, ctx.timestamp, -fee);
    return t;
  }
}
export function closeTrade(
  t: Trade,
  quote: number,
  now: number,
  fraction = 1,
  reason = 'Agent exit',
) {
  if (t.status !== 'OPEN' || !Number.isFinite(quote) || quote <= 0) throw Error('Invalid close');
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1)
    throw Error('Invalid reduction fraction');
  const spec = t.context.assetA.instrument,
    scale = 10 ** (spec?.quantityPrecision ?? 8);
  const quantity = fraction === 1 ? t.quantity : Math.floor(t.quantity * fraction * scale) / scale,
    exit = quote * 0.9995,
    fee = exit * quantity * 0.001;
  if (
    quantity <= 0 ||
    (fraction < 1 &&
      spec &&
      (quantity * exit < spec.minOrderAmount ||
        (t.quantity - quantity) * exit < spec.minOrderAmount))
  )
    throw Error('Reduction violates minimum size or leaves dust');
  const cashflow = (exit - t.entry) * quantity - fee;
  t.exitTurnover = (t.exitTurnover ?? 0) + exit * quantity;
  t.realizedPnL += cashflow;
  db()
    .prepare('INSERT INTO Cashflow VALUES(?,?,?,?)')
    .run(crypto.randomUUID(), t.id, now, cashflow);
  t.fees += fee;
  t.slippage += (quote - exit) * quantity;
  t.quantity -= quantity;
  t.exitPrice = exit;
  t.mark = quote;
  if (t.quantity < 1e-12) {
    t.status = 'CLOSED';
    t.closedAt = now;
    t.duration = now - t.openedAt;
    t.rMultiple = (t.realizedPnL - t.entryFee) / t.riskAmount;
    t.outcomeQuality = t.rMultiple > 0 ? 'WIN' : 'LOSS';
    t.decisionQuality = 'UNREVIEWED';
    t.executionQuality = 'ESTIMATED';
    t.lessons = [
      `${reason}. Net result ${t.rMultiple.toFixed(2)}R; outcome does not establish decision quality.`,
      `Entry confluence ${t.context.assetA.analysis.confluence}/100; relative volume ${t.context.assetA.analysis.relativeVolume?.toFixed(2) ?? 'unavailable'}.`,
      `Observed MAE ${t.mae.toFixed(2)}%, MFE ${t.mfe.toFixed(2)}%. Market path is limited to collected observations.`,
    ];
  }
  saveTrade(t);
  return t;
}
export function managePositions(ctx: MarketContext) {
  for (const t of trades().filter((t) => t.status === 'OPEN')) {
    const m = [ctx.assetA, ctx.assetB].find((m) => m.symbol === t.asset);
    if (!m || m.status !== 'VALID' || !m.price || Date.now() - m.timestamp > 60000) continue;
    const bars = m.candles.filter((c) => c.timestamp >= t.lastManagedAt);
    for (const c of bars) {
      if (c.low <= t.stop) {
        t.mae = Math.min(t.mae, (Math.min(c.open, t.stop) / t.entry - 1) * 100);
        t.mfe = Math.max(t.mfe, (c.open / t.entry - 1) * 100);
        closeTrade(
          t,
          Math.min(c.open, t.stop),
          ctx.timestamp,
          1,
          'Structural stop (stop first if both touched)',
        );
        break;
      }
      if (c.high >= t.targets[0]) {
        t.mfe = Math.max(t.mfe, (t.targets[0] / t.entry - 1) * 100);
        t.mae = Math.min(t.mae, (c.open / t.entry - 1) * 100);
        closeTrade(t, t.targets[0], ctx.timestamp, 1, 'First target');
        break;
      }
      t.mae = Math.min(t.mae, (c.low / t.entry - 1) * 100);
      t.mfe = Math.max(t.mfe, (c.high / t.entry - 1) * 100);
    }
    if (t.status === 'CLOSED') continue;
    t.mark = m.price;
    t.markTimestamp = m.timestamp;
    t.mae = Math.min(t.mae, (m.price / t.entry - 1) * 100);
    t.mfe = Math.max(t.mfe, (m.price / t.entry - 1) * 100);
    if (m.price <= t.stop) closeTrade(t, m.bid ?? m.price, ctx.timestamp, 1, 'Structural stop');
    else if (m.price >= t.targets[0])
      closeTrade(t, m.bid ?? m.price, ctx.timestamp, 1, 'First target');
    else {
      t.lastManagedAt = bars.at(-1) ? bars.at(-1)!.timestamp + 1 : t.lastManagedAt;
      saveTrade(t);
    }
  }
}
export function analytics() {
  const ts = trades(),
    closed = ts.filter((t) => t.status === 'CLOSED').sort((a, b) => a.closedAt! - b.closedAt!),
    p = closed.map((t) => t.realizedPnL - t.entryFee),
    wins = p.filter((v) => v > 0),
    losses = p.filter((v) => v < 0);
  let equity = 10000,
    peak = 10000,
    maxDrawdown = 0;
  const curve = closed.map((t) => {
    equity += t.realizedPnL - t.entryFee;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
    return { timestamp: t.closedAt!, equity };
  });
  return {
    totalTrades: closed.length,
    netPnl: p.reduce((a, b) => a + b, 0),
    returnPercent: p.reduce((a, b) => a + b, 0) / 100,
    winRate: closed.length >= 10 ? (wins.length / p.length) * 100 : null,
    averageWinner: wins.length ? mean(wins) : null,
    averageLoser: losses.length ? mean(losses) : null,
    profitFactor:
      closed.length >= 10 && losses.length
        ? wins.reduce((a, b) => a + b, 0) / -losses.reduce((a, b) => a + b, 0)
        : null,
    sharpe: closed.length >= 30 && std(p) > 0 ? mean(p) / std(p) : null,
    sharpeLabel: 'Non-annualized trade-return ratio',
    maxDrawdown,
    turnover: ts.reduce(
      (s, t) =>
        s +
        t.entry * t.initialQuantity +
        (t.exitTurnover ?? (t.exitPrice ?? 0) * (t.initialQuantity - t.quantity)),
      0,
    ),
    averageHoldingPeriod: closed.length ? mean(closed.map((t) => t.duration!)) / 3600000 : null,
    fees: ts.reduce((s, t) => s + t.fees, 0),
    slippage: ts.reduce((s, t) => s + t.slippage, 0),
    curve,
  };
}
export function strategyMemory() {
  const closed = trades().filter((t) => t.status === 'CLOSED');
  const groups = new Map<string, Trade[]>();
  for (const t of closed) {
    const key = `${t.asset}/${t.pairedAsset}/${t.context.assetA.analysis.regime}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const result = [...groups]
    .filter(([, ts]) => ts.length >= 10)
    .map(([id, ts]) => ({
      id,
      createdAt: Date.now(),
      setupType: id,
      sampleSize: ts.length,
      metrics: {
        averageR: mean(ts.map((t) => t.rMultiple!)),
        winRate: ts.filter((t) => t.rMultiple! > 0).length / ts.length,
      },
      observation: 'Descriptive comparable-trade aggregate; no automatic rule or risk changes.',
      confidence: ts.length >= 20 ? 'MEDIUM' : 'LOW',
    }));
  for (const r of result)
    db().prepare('INSERT OR REPLACE INTO StrategyMemory VALUES(?,?)').run(r.id, JSON.stringify(r));
  return result;
}
