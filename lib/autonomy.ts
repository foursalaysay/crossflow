import { z } from 'zod';
import { db } from './db';
import { run, type ExecutionTarget } from './service';
import { trades } from './portfolio';
import { operatingMode } from './config';
export const autonomySchema = z
  .object({
    enabled: z.boolean(),
    assets: z
      .array(z.string().regex(/^[A-Z0-9]+USDT$/))
      .min(1)
      .max(8),
    intervalSeconds: z.number().int().min(60).max(3600),
    executionTarget: z.enum(['PAPER', 'BITGET_DEMO', 'BITGET_LIVE']).default('PAPER'),
  })
  .strict();
export function autonomyConfig() {
  const row = db().prepare('SELECT payload FROM Settings WHERE id=?').get('autonomy') as
    { payload: string } | undefined;
  const parsed = row
    ? autonomySchema.parse(JSON.parse(row.payload))
    : { enabled: false, assets: ['RNVDAUSDT', 'BTCUSDT'], intervalSeconds: 60, executionTarget: 'PAPER' as const };
  const target = process.env.CROSSFLOW_EXECUTION_TARGET;
  if (target !== 'PAPER' && target !== 'BITGET_DEMO' && target !== 'BITGET_LIVE')
    return { ...parsed, executionTarget: 'PAPER' as const };
  return { ...parsed, executionTarget: target };
}
export function workerStatus() {
  const row = db().prepare('SELECT payload FROM Settings WHERE id=?').get('worker-status') as
    { payload: string } | undefined;
  const status = row ? JSON.parse(row.payload) : null;
  return {
    ...status,
    online: !!status && Date.now() - status.heartbeatAt < 45000,
    config: autonomyConfig(),
  };
}
export async function paperCycle(continueRunning: () => boolean = () => true) {
  const config = autonomyConfig();
  if (!config.enabled || operatingMode() !== 'PAPER') return [];
  const assets = [
    ...new Set([
      ...trades()
        .filter((t) => t.status === 'OPEN')
        .map((t) => t.asset),
      ...config.assets,
    ]),
  ];
  const results = [];
  for (const asset of assets) {
    if (!continueRunning() || !autonomyConfig().enabled || operatingMode() !== 'PAPER') break;
    const pair =
      asset === 'BTCUSDT' ? (config.assets.find((s) => s !== 'BTCUSDT') ?? 'RNVDAUSDT') : 'BTCUSDT';
    try {
      const trace = await run(
        asset,
        pair,
        '1H',
        config.executionTarget as ExecutionTarget,
        () => continueRunning() && autonomyConfig().enabled,
      );
      results.push({
        asset,
        id: trace.id,
        action: trace.agent.decision.decision,
        status: trace.risk.status,
        error: trace.agent.error ?? null,
      });
    } catch (e) {
      results.push({ asset, error: e instanceof Error ? e.message : 'Cycle failed' });
    }
  }
  return results;
}
