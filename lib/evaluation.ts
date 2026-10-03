import { all } from './db';
import { trades } from './portfolio';
import type { Trace } from './service';
export function agentEvaluation() {
  const decisions = all<Trace>('TradeDecision'),
    ts = trades(),
    closed = ts.filter((t) => t.status === 'CLOSED');
  const groups = new Map<string, string[]>();
  for (const d of decisions) {
    const key = JSON.stringify([
      d.context.assetA.symbol,
      d.context.assetB.symbol,
      d.context.assetA.price,
      d.context.assetA.analysis,
      d.context.crossAsset.correlation20,
      d.context.macro.events,
      d.agentInputRiskState,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), d.agent.decision.decision]);
  }
  const comparable = [...groups.values()].filter((v) => v.length > 1);
  const attempts = decisions.filter(
    (d) => d.risk.status === 'REJECT' && ['LONG', 'SHORT'].includes(d.agent.decision.decision),
  );
  return {
    decisionCount: decisions.length,
    counts: Object.fromEntries(
      ['LONG', 'SHORT', 'WAIT', 'REDUCE', 'CLOSE'].map((action) => [
        action,
        decisions.filter((d) => d.agent.decision.decision === action).length,
      ]),
    ),
    riskRejections: decisions.filter((d) => d.risk.status === 'REJECT').length,
    riskViolationAttempts: attempts.length,
    humanInterventions: ts.filter((t) => t.lessons.some((l) => l.includes('Human intervention')))
      .length,
    decisionConsistency: comparable.length
      ? comparable.filter((v) => new Set(v).size === 1).length / comparable.length
      : null,
    consistencyDefinition:
      'Fraction of repeated identical evidence groups with the same action; null without repeats',
    averageConfluenceAtEntry: ts.length
      ? ts.reduce((s, t) => s + t.context.assetA.analysis.confluence, 0) / ts.length
      : null,
    averageRealizedR: closed.length
      ? closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length
      : null,
    validationFailures: decisions.filter((d) => d.agent.provider === 'failed').length,
  };
}
