import { all } from './db';
import type { Trace } from './service';
import { trades, analytics } from './portfolio';
import { equityHistory, performanceFrom } from './performance';
export function evidenceBundle() {
  const decisions = all<Trace>('TradeDecision');
  const history = equityHistory();
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    classification: 'OBSERVED_LOCAL_PAPER_LOGS',
    notes: [
      'No fixture trades included. Historical timestamps are preserved. Local simulation is not Bitget exchange execution.',
      'Current build may differ from the code that produced historical decisions.',
    ],
    summary: {
      decisions: decisions.length,
      trades: trades().length,
      successfulModelDecisions: decisions.filter(
        (d) => !['failed', 'unconfigured', 'data-guard'].includes(d.agent.provider),
      ).length,
      competitionPeriodDecisions: decisions.filter(
        (d) =>
          d.timestamp >= Date.parse('2026-09-03T00:00:00+08:00') &&
          d.timestamp < Date.parse('2026-09-28T00:00:00+08:00'),
      ).length,
    },
    metrics: performanceFrom(history),
    tradeAnalytics: analytics(),
    equitySnapshots: history,
    decisions,
    trades: trades(),
  };
}
