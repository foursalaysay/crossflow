import { macroSignals } from './macro/analysis';
import { Candle, Market, MacroEvent, timeframes } from './types';
export const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const std = (a: number[]) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
export function pivots(c: Candle[], left = 3, right = 3) {
  const result: {
    price: number;
    timestamp: number;
    type: 'HIGH' | 'LOW';
    strength: number;
    volume: number | null;
    label: string;
  }[] = [];
  for (let i = left; i < c.length - right; i++) {
    const window = c.slice(i - left, i + right + 1);
    for (const type of ['HIGH', 'LOW'] as const) {
      const key = type === 'HIGH' ? 'high' : 'low';
      if (
        window.every(
          (v, j) => j === left || (type === 'HIGH' ? v[key] < c[i][key] : v[key] > c[i][key]),
        )
      ) {
        const previous = result.filter((p) => p.type === type).at(-1);
        result.push({
          price: c[i][key],
          timestamp: c[i].timestamp,
          type,
          strength: left + right,
          volume: c[i].volume,
          label: previous
            ? type === 'HIGH'
              ? c[i][key] > previous.price
                ? 'HH'
                : 'LH'
              : c[i][key] > previous.price
                ? 'HL'
                : 'LL'
            : type,
        });
      }
    }
  }
  return result;
}
export function volumeProfile(c: Candle[], bins = 50) {
  c = c.slice(-200);
  if (!c.length || c.some((v) => v.volume === null)) return { available: false as const };
  const low = Math.min(...c.map((v) => v.low)),
    high = Math.max(...c.map((v) => v.high)),
    step = (high - low) / bins;
  if (!step || c.every((v) => v.volume === 0)) return { available: false as const };
  const volumes = Array<number>(bins).fill(0);
  // OHLCV cannot reveal actual trade-at-price. Allocate volume uniformly over each candle range.
  for (const v of c) {
    const start = Math.max(0, Math.floor((v.low - low) / step)),
      end = Math.min(bins - 1, Math.floor((v.high - low) / step));
    for (let i = start; i <= end; i++) volumes[i] += v.volume! / (end - start + 1);
  }
  const pocIndex = volumes.indexOf(Math.max(...volumes));
  let l = pocIndex,
    r = pocIndex,
    sum = volumes[l];
  const total = volumes.reduce((a, b) => a + b, 0);
  while (sum < total * 0.7 && (l > 0 || r < bins - 1)) {
    if (l > 0 && (r === bins - 1 || volumes[l - 1] > volumes[r + 1])) sum += volumes[--l];
    else sum += volumes[++r];
  }
  const level = (i: number) => low + (i + 0.5) * step;
  return {
    available: true as const,
    poc: level(pocIndex),
    val: low + l * step,
    vah: low + (r + 1) * step,
    highVolumeNodes: volumes.flatMap((v, i) => (v > mean(volumes) * 1.5 ? [level(i)] : [])),
    lowVolumeNodes: volumes.flatMap((v, i) => (v < mean(volumes) * 0.5 ? [level(i)] : [])),
    bins: volumes.map((v, i) => ({ price: level(i), volume: v })),
    method: 'OHLCV range allocation estimate',
  };
}
export function relativeVolume(c: Candle[]) {
  const previous = c.slice(-21, -1);
  return previous.length === 20 &&
    previous.every((v) => v.volume !== null) &&
    c.at(-1)?.volume !== null &&
    mean(previous.map((v) => v.volume!)) > 0
    ? c.at(-1)!.volume! / mean(previous.map((v) => v.volume!))
    : null;
}
export function technical(c: Candle[], timeframe = '1H') {
  const p = pivots(c),
    highs = p.filter((v) => v.type === 'HIGH'),
    lows = p.filter((v) => v.type === 'LOW'),
    price = c.at(-1)?.close;
  const lastHigh = highs.at(-1),
    lastLow = lows.at(-1),
    labels = p.slice(-4).map((v) => v.label);
  let regime = 'UNCERTAIN';
  if (highs.length >= 2 && lows.length >= 2) {
    regime =
      highs.at(-1)!.label === 'HH' && lows.at(-1)!.label === 'HL'
        ? 'BULLISH'
        : highs.at(-1)!.label === 'LH' && lows.at(-1)!.label === 'LL'
          ? 'BEARISH'
          : 'RANGE';
    if (price! > lastHigh!.price) regime = 'BREAKOUT';
    if (price! < lastLow!.price) regime = 'BREAKDOWN';
  }
  const clusters: (typeof p)[] = [];
  for (const pivot of p) {
    const cluster = clusters.find(
      (g) => Math.abs(mean(g.map((v) => v.price)) - pivot.price) / pivot.price < 0.003,
    );
    if (cluster) cluster.push(pivot);
    else clusters.push([pivot]);
  }
  const zones = clusters
    .filter((g) => g.length >= 2)
    .map((g) => ({
      price: mean(g.map((v) => v.price)),
      lowerBound: Math.min(...g.map((v) => v.price)) * 0.999,
      upperBound: Math.max(...g.map((v) => v.price)) * 1.001,
      type: mean(g.map((v) => v.price)) < price! ? 'SUPPORT' : 'RESISTANCE',
      strength: Math.min(
        100,
        g.length * 15 +
          (20 * (g.at(-1)!.timestamp - (c[0]?.timestamp ?? 0))) /
            Math.max(1, (c.at(-1)?.timestamp ?? 1) - (c[0]?.timestamp ?? 0)),
      ),
      touches: g.length,
      timeframe,
    }));
  const trendlines = [];
  for (const [direction, anchors] of [
    ['ASCENDING', lows.slice(-3)],
    ['DESCENDING', highs.slice(-3)],
  ] as const) {
    if (anchors.length < 2) continue;
    const a = anchors[0],
      b = anchors.at(-1)!,
      slope = (b.price - a.price) / (b.timestamp - a.timestamp);
    if ((direction === 'ASCENDING' && slope <= 0) || (direction === 'DESCENDING' && slope >= 0))
      continue;
    const projected = a.price + slope * ((c.at(-1)?.timestamp ?? 0) - a.timestamp);
    const touches = anchors.filter(
      (p) => Math.abs(p.price - (a.price + slope * (p.timestamp - a.timestamp))) / p.price < 0.003,
    ).length;
    trendlines.push({
      direction,
      anchors,
      slope,
      touches,
      currentProjectedLevel: projected,
      broken: direction === 'ASCENDING' ? price! < projected : price! > projected,
    });
  }
  const profile = volumeProfile(c),
    rv = relativeVolume(c);
  const confluence =
    (['BULLISH', 'BEARISH', 'BREAKOUT', 'BREAKDOWN'].includes(regime)
      ? 25
      : regime === 'RANGE'
        ? 10
        : 0) +
    (zones.length ? 20 : 0) +
    (trendlines.some((t) => !t.broken) ? 15 : 0) +
    (profile.available ? 15 : 0) +
    (rv !== null && rv > 1.25 ? 10 : 0);
  return {
    regime,
    latestStructure: labels,
    confidence:
      regime === 'UNCERTAIN'
        ? 0
        : labels.filter((label) =>
            ['BULLISH', 'BREAKOUT'].includes(regime)
              ? ['HH', 'HL'].includes(label)
              : ['BEARISH', 'BREAKDOWN'].includes(regime)
                ? ['LH', 'LL'].includes(label)
                : true,
          ).length / Math.max(1, labels.length),
    pivots: p,
    zones,
    trendlines,
    volumeProfile: profile,
    relativeVolume: rv,
    confluence,
  };
}
export function correlation(a: number[], b: number[]) {
  if (a.length < 20 || a.length !== b.length) return null;
  const ma = mean(a),
    mb = mean(b),
    den = Math.sqrt(
      a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0),
    );
  return den ? a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / den : null;
}
export function crossAsset(a: Candle[], b: Candle[]) {
  const map = new Map(b.map((v) => [v.timestamp, v]));
  const aligned = a.flatMap((v) =>
    map.has(v.timestamp) ? [{ a: v, b: map.get(v.timestamp)! }] : [],
  );
  const intervals = a
      .slice(1)
      .map((v, i) => v.timestamp - a[i].timestamp)
      .filter((v) => v > 0),
    interval = intervals.length ? Math.min(...intervals) : 0;
  let start = 0;
  for (let i = 1; i < aligned.length; i++)
    if (aligned[i].a.timestamp - aligned[i - 1].a.timestamp !== interval) start = i;
  const contiguous = aligned.slice(start);
  const ar = contiguous.slice(1).map((v, i) => v.a.close / contiguous[i].a.close - 1),
    br = contiguous.slice(1).map((v, i) => v.b.close / contiguous[i].b.close - 1);
  const rolling = (n: number) => (ar.length >= n ? correlation(ar.slice(-n), br.slice(-n)) : null);
  const normalized = aligned.map((v) => ({
    timestamp: v.a.timestamp,
    a: (v.a.close / aligned[0].a.close) * 100,
    b: (v.b.close / aligned[0].b.close) * 100,
  }));
  const latest = normalized.at(-1),
    diff = latest ? latest.a - latest.b : null;
  const lags = [];
  for (let lag = -3; lag <= 3; lag++) {
    const aa = ar.slice(Math.max(0, -lag), ar.length - Math.max(0, lag)).slice(-100),
      bb = br.slice(Math.max(0, lag), br.length - Math.max(0, -lag)).slice(-100);
    lags.push({ lagCandles: lag, correlation: correlation(aa, bb), sampleSize: aa.length });
  }
  const best =
    lags
      .filter((v) => v.correlation !== null && v.sampleSize >= 50)
      .sort((a, b) => Math.abs(b.correlation!) - Math.abs(a.correlation!))[0] ?? null;
  return {
    sampleSize: ar.length,
    correlation20: rolling(20),
    correlation50: rolling(50),
    correlation100: rolling(100),
    returnA: latest ? latest.a - 100 : null,
    returnB: latest ? latest.b - 100 : null,
    relativePerformance: diff,
    divergence: diff !== null && Math.abs(diff) > 2 && (rolling(20) ?? 0) > 0.3,
    volatilityA: ar.length >= 20 ? std(ar) * 100 : null,
    volatilityB: br.length >= 20 ? std(br) * 100 : null,
    leadLag: best,
    normalized,
  };
}
export function marketEvents(
  m: Market,
  t: ReturnType<typeof technical>,
  cross: ReturnType<typeof crossAsset>,
) {
  const types: string[] = [];
  if (t.regime === 'BREAKOUT' || t.regime === 'BREAKDOWN') types.push(t.regime);
  if ((t.relativeVolume ?? 0) > 2) types.push('VOLUME_SPIKE');
  if (t.trendlines.some((v) => v.broken)) types.push('TRENDLINE_BREAK');
  if (cross.divergence) types.push('CROSS_ASSET_DIVERGENCE');
  if (
    cross.correlation20 !== null &&
    cross.correlation50 !== null &&
    Math.abs(cross.correlation20 - cross.correlation50) > 0.35
  )
    types.push('CORRELATION_SHIFT');
  for (const type of ['SUPPORT', 'RESISTANCE'])
    if (t.zones.some((z) => z.type === type && Math.abs(z.price / (m.price ?? 1) - 1) < 0.003))
      types.push(`${type}_RETEST`);
  if (
    m.candles.length > 1 &&
    Math.abs(m.candles.at(-1)!.close / m.candles.at(-2)!.close - 1) > 0.02
  )
    types.push('LARGE_PRICE_MOVE');
  return types.map((type) => ({
    id: `${m.symbol}-${m.candles.at(-1)?.timestamp}-${type}`,
    timestamp: m.candles.at(-1)?.timestamp,
    type,
    asset: m.symbol,
    severity: type === 'CORRELATION_SHIFT' ? 'HIGH' : 'MEDIUM',
    evidence: {
      regime: t.regime,
      relativeVolume: t.relativeVolume,
      correlation20: cross.correlation20,
    },
  }));
}
export function reaction(event: MacroEvent, m: Market, now: number) {
  const at = event.timestamp ? Date.parse(event.timestamp) : null;
  const result: Record<string, number | null> = {};
  for (const minutes of [1, 5, 15, 30, 60, 240]) {
    result[`return${minutes}m`] = null;
    if (at === null || now < at + minutes * 60000 || timeframes[m.timeframe] > minutes * 60000)
      continue;
    const before = m.candles.filter((c) => c.timestamp + timeframes[m.timeframe] <= at).at(-1);
    const after = m.candles.find(
      (c) =>
        c.timestamp + timeframes[m.timeframe] >= at + minutes * 60000 &&
        c.timestamp + timeframes[m.timeframe] <= now,
    );
    if (
      before &&
      after &&
      at - (before.timestamp + timeframes[m.timeframe]) <= timeframes[m.timeframe]
    )
      result[`return${minutes}m`] = (after.close / before.close - 1) * 100;
  }
  return result;
}
export function context(a: Market, b: Market, macro: MacroEvent[], now = Date.now()) {
  const ta = technical(a.candles, a.timeframe),
    tb = technical(b.candles, b.timeframe),
    cross = crossAsset(a.candles, b.candles);
  const confluence =
    ta.confluence + (cross.correlation20 !== null && Math.abs(cross.correlation20) > 0.3 ? 15 : 0);
  const macroState = macroSignals(macro, [a, b], now);
  const events = marketEvents(a, ta, cross);
  const macroEvent =
    macroState.activeEvent ??
    macroState.upcomingEvents.find(
      (e) => e.importance === 'HIGH' && Date.parse(e.timestamp!) - now <= 3600000,
    );
  if (macroEvent)
    events.push({
      id: `macro-${macroEvent.id}-${a.symbol}`,
      timestamp: Date.parse(macroEvent.timestamp!),
      type: macroState.activeEvent ? 'MACRO_RELEASE' : 'SCHEDULED_MACRO_RISK',
      asset: a.symbol,
      severity: macroEvent.importance,
      evidence: {
        regime: ta.regime,
        relativeVolume: ta.relativeVolume,
        correlation20: cross.correlation20,
      },
    });
  if (ta.regime === tb.regime && ['BREAKOUT', 'BREAKDOWN'].includes(ta.regime))
    events.push({
      id: `sync-${a.symbol}-${b.symbol}-${a.candles.at(-1)?.timestamp}`,
      timestamp: a.candles.at(-1)?.timestamp,
      type: `SYNCHRONIZED_${ta.regime}`,
      asset: a.symbol,
      severity: 'MEDIUM',
      evidence: {
        regime: ta.regime,
        relativeVolume: ta.relativeVolume,
        correlation20: cross.correlation20,
      },
    });
  return {
    timestamp: now,
    assetA: { ...a, analysis: { ...ta, confluence } },
    assetB: { ...b, analysis: tb },
    crossAsset: cross,
    events,
    multiTimeframe: {} as Record<
      string,
      { status: string; analysis: ReturnType<typeof technical> }
    >,
    macro: {
      ...macroState,
      events: macro.filter(
        (e) => !e.timestamp || Date.parse(e.timestamp) <= now || e.status === 'UPCOMING',
      ),
      reactions: macro
        .filter((e) => e.timestamp && Date.parse(e.timestamp) <= now)
        .map((e) => ({
          event: e.id,
          [a.symbol]: reaction(e, a, now),
          [b.symbol]: reaction(e, b, now),
        })),
    },
  };
}
export type MarketContext = ReturnType<typeof context>;
