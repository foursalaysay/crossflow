import { db } from './db';
import { account, trades } from './portfolio';
export type EquityPoint = {
  timestamp: number;
  equity: number;
  marksFresh: boolean;
  source: string;
};
export function recordEquity(source: string) {
  const timestamp = Date.now();
  const open = trades().filter((t) => t.status === 'OPEN');
  const point: EquityPoint = {
    timestamp,
    equity: account().equity,
    marksFresh: open.every(
      (t) =>
        t.markTimestamp !== undefined &&
        timestamp - t.markTimestamp <= 60000 &&
        t.markTimestamp <= timestamp + 5000,
    ),
    source,
  };
  db()
    .prepare('INSERT OR REPLACE INTO EquitySnapshot VALUES(?,?)')
    .run(timestamp, JSON.stringify(point));
}
export function equityHistory(): EquityPoint[] {
  return (
    db().prepare('SELECT payload FROM EquitySnapshot ORDER BY timestamp').all() as {
      payload: string;
    }[]
  ).map((r) => JSON.parse(r.payload));
}
export function performanceFrom(points: EquityPoint[]) {
  const valid = points
    .filter((p) => p.marksFresh && p.equity > 0 && Number.isFinite(p.equity))
    .sort((a, b) => a.timestamp - b.timestamp);
  let peak = valid[0]?.equity ?? 0,
    drawdown = 0;
  for (const p of valid) {
    peak = Math.max(peak, p.equity);
    drawdown = Math.max(drawdown, (peak - p.equity) / peak);
  }
  const daily = new Map<number, EquityPoint>();
  for (const p of valid) daily.set(Math.floor(p.timestamp / 86400000), p);
  const rows = [...daily];
  const returns: number[] = [];
  let gaps = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] - rows[i - 1][0] !== 1) {
      gaps++;
      continue;
    }
    returns.push(rows[i][1].equity / rows[i - 1][1].equity - 1);
  }
  const avg = returns.length ? returns.reduce((s, v) => s + v, 0) / returns.length : 0;
  const sd =
    returns.length > 1
      ? Math.sqrt(returns.reduce((s, v) => s + (v - avg) ** 2, 0) / (returns.length - 1))
      : 0;
  const downside = returns.length
    ? Math.sqrt(returns.reduce((s, v) => s + Math.min(0, v) ** 2, 0) / returns.length)
    : 0;
  const sufficient = returns.length >= 30 && gaps === 0;
  return {
    snapshotCount: points.length,
    freshSnapshotCount: valid.length,
    excludedStaleSnapshots: points.length - valid.length,
    observedDays: rows.length,
    consecutiveDailyReturns: returns.length,
    gaps,
    first: valid[0]?.timestamp ?? null,
    last: valid.at(-1)?.timestamp ?? null,
    annualizedSharpe: sufficient && sd > 0 ? (avg / sd) * Math.sqrt(365) : null,
    annualizedSortino: sufficient && downside > 0 ? (avg / downside) * Math.sqrt(365) : null,
    sampledMarkToMarketDrawdownPercent: valid.length >= 2 ? drawdown * 100 : null,
    observedReturnPercent:
      valid.length >= 2 ? (valid.at(-1)!.equity / valid[0].equity - 1) * 100 : null,
    cashBaselineReturnPercent: valid.length >= 2 ? 0 : null,
    methodology:
      'Last fresh observed equity per UTC day, not guaranteed closing marks; 365-day annualization, zero risk-free/target return. Ratios require 30 daily returns with no missing observed dates. Drawdown is sampled, not tick-complete. Cash baseline earns zero and is not a fixed-rule trading strategy.',
  };
}
