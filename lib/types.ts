import { z } from 'zod';
export const timeframes = {
  '5m': 300000,
  '15m': 900000,
  '1H': 3600000,
  '4H': 14400000,
  '1D': 86400000,
} as const;
export type Timeframe = keyof typeof timeframes;
export type DataStatus =
  'LOADING' | 'VALID' | 'STALE' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE' | 'ERROR';
export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};
export type Instrument = {
  symbol: string;
  reality: boolean;
  status: string;
  quantityPrecision: number;
  pricePrecision: number;
  minOrderAmount: number;
};
export type Market = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  price: number | null;
  bid: number | null;
  ask: number | null;
  timestamp: number;
  status: DataStatus;
  source: string;
  error?: string;
  instrument?: Instrument;
};
export const decisionSchema = z
  .object({
    decision: z.enum(['LONG', 'SHORT', 'WAIT', 'REDUCE', 'CLOSE']),
    asset: z.string(),
    reasoningSummary: z.array(z.string()).min(1).max(12),
    entryZone: z.tuple([z.number().positive(), z.number().positive()]).nullable(),
    invalidation: z.number().positive().nullable(),
    targets: z.array(z.number().positive()).max(3),
    confidence: z.number().min(0).max(1),
    riskNotes: z.array(z.string()),
    conditionsToReevaluate: z.array(z.string()),
  })
  .strict();
export type Decision = z.infer<typeof decisionSchema>;
export const macroSchema = z.object({
  id: z.string().min(1),
  timestamp: z.iso.datetime().nullable(),
  eventType: z.string().min(1),
  title: z.string().min(1),
  country: z.string(),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  actual: z.number().nullable(),
  forecast: z.number().nullable(),
  previous: z.number().nullable(),
  source: z.string().min(1),
  affectedAssets: z.array(z.string()),
  status: z.enum(['UPCOMING', 'RELEASED', 'UPDATED']),
});
export type MacroEvent = z.infer<typeof macroSchema> & { surprise: number | null };
export type RiskConfig = {
  riskPercent: number;
  dailyLossPercent: number;
  maxPositions: number;
  maxSpreadPercent: number;
  eventPolicy: 'BLOCK' | 'REDUCE' | 'ALLOW';
  beforeMinutes: number;
  afterMinutes: number;
};
export const defaultRisk: RiskConfig = {
  riskPercent: 1,
  dailyLossPercent: 3,
  maxPositions: 3,
  maxSpreadPercent: 0.3,
  eventPolicy: 'BLOCK',
  beforeMinutes: 60,
  afterMinutes: 30,
};
