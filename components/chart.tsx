'use client';
import { useEffect, useRef, memo } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  UTCTimestamp,
} from 'lightweight-charts';
import { MarketContext } from '@/lib/analysis';
function Chart({
  context,
  overlays,
  compare = false,
  levels = [],
}: {
  context: MarketContext;
  overlays: string[];
  compare?: boolean;
  levels?: { title: string; price: number }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#111817' },
        textColor: '#768a86',
        fontFamily: 'Arial',
        fontSize: 10,
      },
      grid: { vertLines: { color: '#1b2623' }, horzLines: { color: '#1b2623' } },
      rightPriceScale: { borderColor: '#24302c' },
      timeScale: { borderColor: '#24302c', timeVisible: true },
      crosshair: { vertLine: { color: '#648078' }, horzLine: { color: '#648078' } },
    });
    if (compare) {
      for (const [key, color] of [
        ['a', '#b9f46c'],
        ['b', '#729ff3'],
      ] as const) {
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData(
          context.crossAsset.normalized.map((v) => ({
            time: (v.timestamp / 1000) as UTCTimestamp,
            value: v[key],
          })),
        );
      }
    } else {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#b5e978',
        downColor: '#ee857e',
        borderVisible: false,
        wickUpColor: '#b5e978',
        wickDownColor: '#ee857e',
      });
      series.setData(
        context.assetA.candles.map((c) => ({
          time: (c.timestamp / 1000) as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      const t = context.assetA.analysis;
      if (overlays.includes('S/R'))
        for (const z of t.zones.slice(-5))
          series.createPriceLine({
            price: z.price,
            color: z.type === 'SUPPORT' ? '#69a68c' : '#a57b63',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: z.type === 'SUPPORT' ? 'S' : 'R',
          });
      if (overlays.includes('Volume profile') && t.volumeProfile.available)
        for (const [title, price] of [
          ['POC', t.volumeProfile.poc],
          ['VAH', t.volumeProfile.vah],
          ['VAL', t.volumeProfile.val],
        ] as const)
          series.createPriceLine({
            price,
            color: title === 'POC' ? '#e4c67f' : '#6b658b',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title,
          });
      if (overlays.includes('Trendlines'))
        for (const line of t.trendlines) {
          const s = chart.addSeries(LineSeries, {
            color: '#6f9edb',
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
          });
          s.setData([
            {
              time: (line.anchors[0].timestamp / 1000) as UTCTimestamp,
              value: line.anchors[0].price,
            },
            {
              time: (context.assetA.candles.at(-1)!.timestamp / 1000) as UTCTimestamp,
              value: line.currentProjectedLevel,
            },
          ]);
        }
      if (overlays.includes('Position'))
        for (const level of levels)
          series.createPriceLine({
            price: level.price,
            color: level.title === 'STOP' ? '#ee857e' : '#b9ef79',
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: level.title,
          });
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      volume.setData(
        context.assetA.candles
          .filter((c) => c.volume !== null)
          .map((c) => ({
            time: (c.timestamp / 1000) as UTCTimestamp,
            value: c.volume!,
            color: c.close >= c.open ? '#b5e97828' : '#ee857e28',
          })),
      );
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [context, overlays, compare, levels]);
  return (
    <div
      ref={ref}
      className={compare ? 'comparison-chart' : 'main-chart'}
      aria-label={compare ? 'Normalized asset performance chart' : 'Price candlestick chart'}
    />
  );
}

export default memo(
  Chart,
  (a, b) =>
    a.context === b.context &&
    a.compare === b.compare &&
    a.overlays.join() === b.overlays.join() &&
    JSON.stringify(a.levels) === JSON.stringify(b.levels),
);
