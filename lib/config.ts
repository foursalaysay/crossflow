import { z } from 'zod';
import { db } from './db';
import { defaultRisk } from './types';
export const riskSchema = z
  .object({
    riskPercent: z.number().min(0.1).max(1),
    dailyLossPercent: z.number().min(0.5).max(3),
    maxPositions: z.number().int().min(1).max(3),
    maxSpreadPercent: z.number().min(0.01).max(0.5),
    eventPolicy: z.enum(['BLOCK', 'REDUCE', 'ALLOW']),
    beforeMinutes: z.number().int().min(0).max(240),
    afterMinutes: z.number().int().min(0).max(240),
  })
  .strict();
export function riskConfig() {
  const row = db().prepare('SELECT payload FROM Settings WHERE id=?').get('risk') as
    { payload: string } | undefined;
  return row ? riskSchema.parse(JSON.parse(row.payload)) : defaultRisk;
}
export function operatingMode(): 'PAPER' | 'READ_ONLY' {
  const row = db().prepare('SELECT payload FROM Settings WHERE id=?').get('mode') as
    { payload: string } | undefined;
  return row?.payload === 'READ_ONLY' ? 'READ_ONLY' : 'PAPER';
}
