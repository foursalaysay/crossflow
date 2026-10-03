import { evidenceChanged } from './revalidation';
import { recordEquity } from './performance';
import { reflect } from './reflection';
import { riskConfig, operatingMode } from './config';
import { instruments, market } from './bitget';
import { context, technical } from './analysis';
import { all, db, transaction } from './db';
import { MacroEvent, Timeframe } from './types';
import { decide } from './agent';
import { assessRisk } from './risk';
import {
  account,
  managePositions,
  memory,
  PaperOrderExecutor,
  trades,
  closeTrade,
  strategyMemory,
} from './portfolio';
import { connectionConfig } from './bitget-private';
import { executeAutonomousOrder, previewOrder } from './live';
export type ExecutionTarget = 'PAPER' | 'BITGET_DEMO' | 'BITGET_LIVE';
export async function getContext(asset: string, pair: string, timeframe: Timeframe) {
  let universe;
  try {
    universe = await instruments();
  } catch (error) {
    const empty = {
      timeframe,
      candles: [],
      price: null,
      bid: null,
      ask: null,
      timestamp: Date.now(),
      status: 'ERROR' as const,
      source: 'Bitget REST v3',
      error: error instanceof Error ? error.message : 'API error',
    };
    return context(
      { ...empty, symbol: asset },
      { ...empty, symbol: pair },
      all<MacroEvent>('MacroEvent'),
    );
  }
  const [a, b] = await Promise.all([
    market(asset, timeframe, universe),
    market(pair, timeframe, universe),
  ]);
  const base = context(a, b, all<MacroEvent>('MacroEvent'));
  return base;
}
async function decisionContext(asset: string, pair: string, timeframe: Timeframe) {
  const ctx = await getContext(asset, pair, timeframe);
  const extra = await Promise.all(
    (['4H', '1H', '15m'] as Timeframe[])
      .filter((tf) => tf !== timeframe)
      .map(async (tf) => {
        const m = await market(asset, tf);
        return [tf, { status: m.status, analysis: technical(m.candles, tf) }] as const;
      }),
  );
  ctx.multiTimeframe = Object.fromEntries([
    [timeframe, { status: ctx.assetA.status, analysis: ctx.assetA.analysis }],
    ...extra,
  ]);
  return ctx;
}
export async function run(
  asset: string,
  pair: string,
  timeframe: Timeframe,
  mode: ExecutionTarget | 'READ_ONLY',
  executionAllowed: () => boolean = () => true,
) {
  if (operatingMode() === 'READ_ONLY') mode = 'READ_ONLY';
  const exchangeTarget = mode === 'BITGET_DEMO' || mode === 'BITGET_LIVE';
  if (exchangeTarget) {
    const cfg = connectionConfig();
    const expected = mode === 'BITGET_DEMO' ? 'demo' : 'live';
    if (cfg.environment !== expected) throw Error('EXECUTION_TARGET_ENVIRONMENT_MISMATCH');
    if (!cfg.enabled || !cfg.autonomous) throw Error('AUTONOMY_DISABLED');
  }
  const owner = crypto.randomUUID();
  transaction(() => {
    db().prepare('DELETE FROM RunLock WHERE expires < ?').run(Date.now());
    if (db().prepare('SELECT id FROM RunLock').get())
      throw Error('A decision cycle is already running');
    db()
      .prepare('INSERT INTO RunLock VALUES(?,?)')
      .run(owner, Date.now() + 240000);
  });
  const heartbeat = setInterval(
    () =>
      db()
        .prepare('UPDATE RunLock SET expires=? WHERE id=?')
        .run(Date.now() + 240000, owner),
    30000,
  );
  try {
    const ctx = await decisionContext(asset, pair, timeframe);
    if (mode === 'PAPER' && operatingMode() === 'PAPER') transaction(() => managePositions(ctx));
    const similar = memory(ctx),
      strategy = strategyMemory();
    const agentInputRiskState = {
      ...account(),
      riskConfig: riskConfig(),
      positions: trades()
        .filter((t) => t.status === 'OPEN')
        .map((t) => ({
          asset: t.asset,
          quantity: t.quantity,
          mark: t.mark,
          stop: t.stop,
          targets: t.targets,
        })),
    };
    recordEquity('before-decision');
    const agent = await decide(ctx, [...similar, ...strategy], agentInputRiskState);
    const actionable = ['LONG', 'SHORT', 'CLOSE', 'REDUCE'].includes(agent.decision.decision);
    const executionContext = actionable ? await decisionContext(asset, pair, timeframe) : ctx;
    const changed = actionable && evidenceChanged(ctx, executionContext);
    if (mode === 'PAPER' && operatingMode() === 'PAPER' && actionable)
      transaction(() => managePositions(executionContext));
    const result = transaction(() => {
      const effectiveMode = operatingMode() === 'READ_ONLY' ? 'READ_ONLY' : mode;
      const risk = assessRisk(
        agent.decision,
        executionContext,
        account(),
        effectiveMode,
        riskConfig(),
      );
      if (!executionAllowed()) {
        risk.status = 'REJECT';
        risk.reasons.push('AUTONOMY_PAUSED');
      }
      if (changed) {
        risk.status = 'REJECT';
        risk.reasons.push('EVIDENCE_CHANGED_DURING_INFERENCE: request a new decision');
      }
      const id = crypto.randomUUID();
      let execution: unknown = null;
      const trace = {
        id,
        timestamp: Date.now(),
        mode,
        context: ctx,
        executionContext,
        revalidation: { performed: actionable, evidenceChanged: changed, checkedAt: Date.now() },
        agentInputRiskState,
        executionRiskState: { ...account(), riskConfig: riskConfig() },
        agent,
        risk,
        similarTrades: similar,
        strategyMemory: strategy,
        execution,
      };
      db()
        .prepare('INSERT INTO TradeDecision VALUES(?,?,?,?)')
        .run(id, trace.timestamp, mode, JSON.stringify(trace));
      db().prepare('INSERT INTO MarketSnapshot VALUES(?,?)').run(id, JSON.stringify(ctx));
      for (const event of ctx.events)
        db()
          .prepare('INSERT OR IGNORE INTO TradeEvent VALUES(?,?,?)')
          .run(`${id}-${event.id}`, id, JSON.stringify(event));
      db().exec('SAVEPOINT execution');
      try {
        if (['APPROVE', 'MODIFY'].includes(risk.status)) {
          if (agent.decision.decision === 'LONG' && !exchangeTarget)
            execution = new PaperOrderExecutor().executeOrder(id, executionContext, agent.decision, risk);
          else if (['CLOSE', 'REDUCE'].includes(agent.decision.decision))
            execution = trades()
              .filter((t) => t.asset === asset && t.status === 'OPEN')
              .map((t) =>
                closeTrade(
                  t,
                  executionContext.assetA.bid ?? executionContext.assetA.price!,
                  Date.now(),
                  agent.decision.decision === 'REDUCE' ? 0.5 : 1,
                ),
              );
        }
        db().exec('RELEASE execution');
      } catch (error) {
        db().exec('ROLLBACK TO execution; RELEASE execution');
        risk.status = 'REJECT';
        risk.reasons.push(
          `EXECUTION_REJECTED: ${error instanceof Error ? error.message : 'Unknown failure'}`,
        );
        execution = null;
      }
      trace.execution = execution;
      db().prepare('UPDATE TradeDecision SET payload=? WHERE id=?').run(JSON.stringify(trace), id);
      return trace;
    });
    if (exchangeTarget && ['APPROVE', 'MODIFY'].includes(result.risk.status) && agent.decision.decision === 'LONG') {
      try {
        result.execution = await awaitExchangeOrder(asset, pair, agent.decision, result.risk);
      } catch (error) {
        result.risk.status = 'REJECT';
        result.risk.reasons.push(`EXECUTION_REJECTED: ${error instanceof Error ? error.message : 'Unknown failure'}`);
      }
      db().prepare('UPDATE TradeDecision SET payload=? WHERE id=?').run(JSON.stringify(result), result.id);
    }
    recordEquity('after-decision');
    for (const t of trades()
      .filter((t) => t.status === 'CLOSED' && !t.reflection)
      .slice(0, 1))
      await reflect(t);
    return result;
  } finally {
    clearInterval(heartbeat);
    db().prepare('DELETE FROM RunLock WHERE id=?').run(owner);
  }
}
export type Trace = Awaited<ReturnType<typeof run>>;

async function awaitExchangeOrder(asset: string, pair: string, decision: any, risk: any) {
  const preview = await previewOrder({
    symbol: asset,
    pair,
    side: 'buy',
    quantity: risk.quantity,
    stop: decision.invalidation,
    target: decision.targets[0],
  });
  return executeAutonomousOrder(preview.id);
}
