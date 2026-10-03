import type { Market, MacroEvent } from '../types';
export const macroCategories = [
  'FED_RATE',
  'FOMC_STATEMENT',
  'FED_SPEECH',
  'CPI',
  'CORE_CPI',
  'PPI',
  'PCE',
  'CORE_PCE',
  'NFP',
  'UNEMPLOYMENT',
  'JOBLESS_CLAIMS',
  'GDP',
  'RETAIL_SALES',
  'ISM_MANUFACTURING',
  'ISM_SERVICES',
  'CONSUMER_CONFIDENCE',
  'TREASURY_YIELDS',
  'USD_STRENGTH',
  'EARNINGS',
  'BOJ',
  'ECB',
  'GEOPOLITICAL',
  'CRYPTO_REGULATION',
  'CRYPTO_EVENT',
  'ETF_FLOWS',
  'JOLTS',
] as const;
const average = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export function macroSignals(events: MacroEvent[], markets: Market[], now: number) {
  const relevant = events.filter(
    (e) => !e.affectedAssets.length || markets.some((m) => e.affectedAssets.includes(m.symbol)),
  );
  const upcoming = relevant
    .filter((e) => e.timestamp && Date.parse(e.timestamp) > now)
    .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
  const released = relevant
    .filter((e) => e.status !== 'UPCOMING' && e.timestamp && Date.parse(e.timestamp) <= now)
    .sort((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!));
  const imminent = upcoming.find(
      (e) => e.importance === 'HIGH' && Date.parse(e.timestamp!) - now <= 3600000,
    ),
    active = released.find((e) => now - Date.parse(e.timestamp!) <= 14400000) ?? null;
  const observations = markets.map((m) => {
    const recent = m.candles.slice(-20),
      prior = m.candles.slice(-40, -20),
      r = average(recent.map((c) => (c.high - c.low) / c.close)),
      p = average(prior.map((c) => (c.high - c.low) / c.close));
    const compression =
      recent.length === 20 && prior.length === 20 && r !== null && p !== null && p > 0
        ? r / p
        : null;
    const previous = m.candles.slice(-21, -1),
      last = m.candles.at(-1);
    const sweep =
      previous.length === 20 && last
        ? last.high > Math.max(...previous.map((c) => c.high)) &&
          last.close < Math.max(...previous.map((c) => c.high))
          ? 'UPSIDE_SWEEP'
          : last.low < Math.min(...previous.map((c) => c.low)) &&
              last.close > Math.min(...previous.map((c) => c.low))
            ? 'DOWNSIDE_SWEEP'
            : null
        : null;
    return {
      symbol: m.symbol,
      volatilityCompressionRatio: compression,
      compressed: compression !== null && compression < 0.7,
      liquiditySweep: sweep,
      interpretation: 'Observed price behavior; no positioning data inferred',
    };
  });
  const phase = active
    ? 'POST_EVENT_CONFIRMATION'
    : imminent
      ? observations.some((o) => o.compressed || o.liquiditySweep)
        ? 'PRE_EVENT_SETUP'
        : 'PRE_EVENT_WAIT'
      : 'NO_ACTIVE_EVENT';
  return {
    phase,
    activeEvent: active,
    upcomingEvents: upcoming,
    observations,
    surprise:
      active && active.actual !== null && active.forecast !== null
        ? {
            raw: active.actual - active.forecast,
            relativeToForecast:
              active.forecast !== 0
                ? (active.actual - active.forecast) / Math.abs(active.forecast)
                : null,
            numericDirection:
              active.actual > active.forecast
                ? 'ABOVE_FORECAST'
                : active.actual < active.forecast
                  ? 'BELOW_FORECAST'
                  : 'AS_EXPECTED',
            interpretation:
              'Numeric surprise only; economic meaning varies by series and does not imply a trade direction',
          }
        : null,
  };
}
