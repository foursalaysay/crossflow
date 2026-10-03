'use client';
import type { Trade } from '@/lib/portfolio';
export default function Analytics({ trades }: { trades: Trade[] }) {
  const closed = trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => a.closedAt! - b.closedAt!);
  const values = closed.reduce<number[]>(
    (a, t) => [...a, a.at(-1)! + t.realizedPnL - t.entryFee],
    [10000],
  );
  const low = Math.min(...values) * 0.999,
    high = Math.max(...values) * 1.001;
  const points = values
    .map(
      (v, i) =>
        `${20 + (i / Math.max(1, values.length - 1)) * 760},${155 - ((v - low) / (high - low)) * 130}`,
    )
    .join(' ');
  const bins = [-3, -2, -1, 0, 1, 2, 3].map((r) => ({
    r,
    count: closed.filter((t) => Math.floor(Math.max(-3, Math.min(3, t.rMultiple ?? 0))) === r)
      .length,
  }));
  const max = Math.max(1, ...bins.map((b) => b.count));
  const groups = new Map<string, Trade[]>();
  for (const t of closed)
    for (const key of [
      `ASSET · ${t.asset}`,
      `PAIR · ${t.asset}/${t.pairedAsset}`,
      `SETUP · ${t.context.assetA.analysis.regime}`,
      `TIMEFRAME · ${t.timeframe}`,
      ...t.tags.filter((t) => t.startsWith('MACRO_')),
    ])
      groups.set(key, [...(groups.get(key) ?? []), t]);
  return (
    <>
      <div className="analytics-charts">
        <section className="panel">
          <div className="panel-heading">
            <span className="panel-title">Realized equity curve</span>
            <small className="muted">Closed trades · USDT</small>
          </div>
          {closed.length ? (
            <svg viewBox="0 0 800 180" role="img" aria-label="Realized paper account equity">
              <line x1="20" x2="780" y1="155" y2="155" stroke="#33432e" />
              <polyline points={points} fill="none" stroke="#b9ef79" strokeWidth="2" />
              <text x="20" y="20" fill="#8b9f80" fontSize="11">
                {Math.max(...values).toFixed(2)}
              </text>
            </svg>
          ) : (
            <div className="chart-no-data">No closed trades. Equity starts at 10,000 USDT.</div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <span className="panel-title">Realized R distribution</span>
            <small className="muted">Outcome, not decision quality</small>
          </div>
          <svg viewBox="0 0 400 180" role="img" aria-label="Trade return distribution">
            {bins.map((b, i) => (
              <g key={b.r}>
                <rect
                  x={25 + i * 52}
                  y={140 - (b.count / max) * 105}
                  width="28"
                  height={(b.count / max) * 105}
                  fill={b.r < 0 ? '#d18579' : '#a5ce76'}
                />
                <text x={27 + i * 52} y="162" fill="#809773" fontSize="11">
                  {b.r}R
                </text>
                <text x={32 + i * 52} y={128 - (b.count / max) * 105} fill="#a9b89b" fontSize="10">
                  {b.count}
                </text>
              </g>
            ))}
          </svg>
        </section>
      </div>
      <section className="panel full-panel">
        <div className="panel-heading">
          <span className="panel-title">Performance by context</span>
          <small className="muted">Descriptive only · minimum 10 comparable trades</small>
        </div>
        {groups.size ? (
          <table>
            <thead>
              <tr>
                <th>Context</th>
                <th>Trades</th>
                <th>Average R</th>
                <th>Win rate</th>
                <th>Sample quality</th>
              </tr>
            </thead>
            <tbody>
              {[...groups].map(([key, ts]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{ts.length}</td>
                  <td>{(ts.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / ts.length).toFixed(2)}</td>
                  <td>
                    {ts.length >= 10
                      ? `${((ts.filter((t) => (t.rMultiple ?? 0) > 0).length / ts.length) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td>
                    {ts.length < 10
                      ? 'INSUFFICIENT DATA'
                      : ts.length < 20
                        ? 'SMALL SAMPLE'
                        : 'OBSERVED'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="chart-no-data">
            Asset, pair, setup, timeframe, and macro-event cohorts appear after trades close.
          </div>
        )}
      </section>
      <section className="panel full-panel">
        <div className="panel-heading">
          <span className="panel-title">MAE vs MFE</span>
          <small className="muted">
            Observed excursion · incomplete between market observations
          </small>
        </div>
        {closed.length ? (
          <svg
            viewBox="0 0 800 200"
            role="img"
            aria-label="Adverse and favorable excursion scatterplot"
          >
            {closed.map((t) => (
              <circle
                key={t.id}
                cx={
                  50 + (Math.abs(t.mae) / Math.max(1, ...closed.map((v) => Math.abs(v.mae)))) * 680
                }
                cy={165 - (t.mfe / Math.max(1, ...closed.map((v) => v.mfe))) * 140}
                r="5"
                fill={(t.rMultiple ?? 0) > 0 ? '#b9ef79' : '#e38f7c'}
              >
                <title>
                  {t.asset} · MAE {t.mae.toFixed(2)}% · MFE {t.mfe.toFixed(2)}%
                </title>
              </circle>
            ))}
            <text x="40" y="190" fontSize="11" fill="#809773">
              Greater adverse excursion →
            </text>
          </svg>
        ) : (
          <div className="chart-no-data">
            Excursion measurements appear after the first closed trade.
          </div>
        )}
      </section>
    </>
  );
}
