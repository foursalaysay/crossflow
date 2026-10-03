import btc from '../data/replay/BTCUSDT.json';
import nvda from '../data/replay/RNVDAUSDT.json';
import specs from '../data/replay/instruments.json';
import { parseCandles } from './bitget';
import { context } from './analysis';
import { Market, Decision } from './types';
import { assessRisk, RiskResult } from './risk';
import { decide } from './agent';
import { db } from './db';
import { riskConfig } from './config';
const a = parseCandles(nvda.data).filter((c) => c.timestamp + 3600000 <= nvda.requestTime),
  b = parseCandles(btc.data).filter((c) => c.timestamp + 3600000 <= btc.requestTime);
export function replayContext(index: number) {
  index = Math.max(40, Math.min(index, a.length - 1));
  const at = a[index].timestamp + 3600000;
  const make = (symbol: string, candles: ReturnType<typeof parseCandles>): Market => {
    const c = candles.filter((c) => c.timestamp + 3600000 <= at),
      price = c.at(-1)!.close;
    const spec = specs.find((s) => s.symbol === symbol)!;
    return {
      symbol,
      timeframe: '1H',
      candles: c,
      price,
      bid: price * 0.9999,
      ask: price * 1.0001,
      timestamp: at,
      status: 'VALID',
      source: 'HISTORICAL REPLAY · Bitget capture 2026-09-22 · estimated spread 2bps',
      instrument: {
        symbol,
        reality: spec.isReality === 'yes',
        status: spec.status,
        quantityPrecision: Number(spec.quantityPrecision),
        pricePrecision: Number(spec.pricePrecision),
        minOrderAmount: Number(spec.minOrderAmount),
      },
    };
  };
  return context(make('RNVDAUSDT', a), make('BTCUSDT', b), [], at);
}
type ReplayPosition = {
  entry: number;
  quantity: number;
  stop: number;
  target: number;
  fee: number;
  openedAt: number;
  mae: number;
  mfe: number;
};
type ReplayLog = {
  timestamp: number;
  decision: Decision;
  risk: RiskResult;
  execution: string;
  context: ReturnType<typeof context>;
};
export type ReplaySession = {
  id: string;
  index: number;
  balance: number;
  position: ReplayPosition | null;
  pending: Decision | null;
  logs: ReplayLog[];
  closed: { entry: number; exit: number; pnl: number; mae: number; mfe: number; reason: string }[];
  done: boolean;
};
export async function advanceReplay(id?: string) {
  const row = id
    ? (db().prepare('SELECT payload FROM Settings WHERE id=?').get(`replay-${id}`) as
        { payload: string } | undefined)
    : undefined;
  if (id && !row) throw Error('Replay session not found');
  const s: ReplaySession = row
    ? JSON.parse(row.payload)
    : {
        id: crypto.randomUUID(),
        index: 79,
        balance: 10000,
        position: null,
        pending: null,
        logs: [],
        closed: [],
        done: false,
      };
  if (s.index >= a.length - 1) {
    s.done = true;
    return { session: s, context: replayContext(s.index) };
  }
  s.index++;
  const bar = a[s.index],
    ctx = replayContext(s.index);
  let execution = 'No order';
  const close = (price: number, reason: string, fraction = 1) => {
    const p = s.position!,
      qty = p.quantity * fraction;
    const exit = price * 0.9995,
      pnl = (exit - p.entry) * qty - exit * qty * 0.001;
    s.balance += pnl;
    s.closed.push({
      entry: p.entry,
      exit,
      pnl: pnl - p.fee * fraction,
      mae: p.mae,
      mfe: p.mfe,
      reason,
    });
    if (fraction === 1) s.position = null;
    else {
      p.quantity -= qty;
      p.fee *= 1 - fraction;
    }
    execution = reason;
  };
  // A decision from the previous close may fill only at this bar's open; its high/low are not used in sizing.
  if (s.pending && !s.position) {
    const previous = replayContext(s.index - 1);
    previous.timestamp = bar.timestamp;
    for (const m of [previous.assetA, previous.assetB]) m.timestamp = bar.timestamp;
    previous.assetA.price = bar.open;
    previous.assetA.bid = bar.open * 0.9999;
    previous.assetA.ask = bar.open * 1.0001;
    const risk = assessRisk(
      s.pending,
      previous,
      {
        balance: s.balance,
        equity: s.balance,
        dailyPnl: s.closed.reduce((sum, t) => sum + Math.min(0, t.pnl), 0),
        dayStartEquity: 10000,
        openPositions: 0,
        reserved: 0,
      },
      'PAPER',
      riskConfig(),
      bar.timestamp,
    );
    if (['APPROVE', 'MODIFY'].includes(risk.status) && risk.entry) {
      const fee = risk.entry * risk.quantity * 0.001;
      s.position = {
        entry: risk.entry,
        quantity: risk.quantity,
        stop: risk.stop!,
        target: s.pending.targets[0],
        fee,
        openedAt: bar.timestamp,
        mae: 0,
        mfe: 0,
      };
      s.balance -= fee;
      execution = 'Replay fill at next open + estimated spread/slippage';
    } else execution = `Pending entry rejected at next open: ${risk.reasons.join(', ')}`;
    s.pending = null;
  }
  if (s.position) {
    if (bar.low <= s.position.stop) {
      s.position.mae = Math.min(
        s.position.mae,
        (Math.min(bar.open, s.position.stop) / s.position.entry - 1) * 100,
      );
      s.position.mfe = Math.max(s.position.mfe, (bar.open / s.position.entry - 1) * 100);
      close(Math.min(bar.open, s.position.stop), 'Replay stop; conservative stop-first ordering');
    } else if (bar.high >= s.position.target) {
      s.position.mfe = Math.max(s.position.mfe, (s.position.target / s.position.entry - 1) * 100);
      s.position.mae = Math.min(s.position.mae, (bar.open / s.position.entry - 1) * 100);
      close(s.position.target, 'Replay target');
    } else {
      s.position.mae = Math.min(s.position.mae, (bar.low / s.position.entry - 1) * 100);
      s.position.mfe = Math.max(s.position.mfe, (bar.high / s.position.entry - 1) * 100);
    }
  }
  const agent = await decide(ctx, s.closed.slice(-5), {
    balance: s.balance,
    position: s.position,
    mode: 'REPLAY',
    rules: riskConfig(),
  });
  const risk = assessRisk(
    agent.decision,
    ctx,
    {
      balance: s.balance,
      equity: s.balance + (s.position ? (bar.close - s.position.entry) * s.position.quantity : 0),
      dailyPnl: s.closed.reduce((sum, t) => sum + Math.min(0, t.pnl), 0),
      dayStartEquity: 10000,
      openPositions: s.position ? 1 : 0,
      reserved: s.position ? s.position.entry * s.position.quantity : 0,
    },
    'PAPER',
    riskConfig(),
    ctx.timestamp,
  );
  if (['APPROVE', 'MODIFY'].includes(risk.status)) {
    if (agent.decision.decision === 'LONG' && !s.position) s.pending = agent.decision;
    if (['CLOSE', 'REDUCE'].includes(agent.decision.decision) && s.position)
      close(
        bar.close,
        'Replay agent exposure reduction',
        agent.decision.decision === 'REDUCE' ? 0.5 : 1,
      );
  }
  s.logs.push({
    timestamp: ctx.timestamp,
    decision: agent.decision,
    risk,
    execution,
    context: ctx,
  });
  s.done = s.index === a.length - 1;
  db()
    .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
    .run(`replay-${s.id}`, JSON.stringify(s));
  return { session: s, context: ctx };
}
