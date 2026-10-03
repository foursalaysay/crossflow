import type { MarketContext } from './analysis';
// Quotes may move inside the proposed entry zone; changed closed-bar/macro evidence needs a new decision.
export function evidenceChanged(before: MarketContext, after: MarketContext) {
  const evidence = (c: MarketContext) =>
    JSON.stringify({
      a: c.assetA.candles,
      b: c.assetB.candles,
      regimeA: c.assetA.analysis.regime,
      regimeB: c.assetB.analysis.regime,
      macro: c.macro.events,
      multiTimeframe: c.multiTimeframe,
    });
  return evidence(before) !== evidence(after);
}
