'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { performanceFrom } from '@/lib/performance';
type Status = {
  worker: {
    online: boolean;
    phase?: string;
    heartbeatAt?: number;
    lastCycle?: unknown;
    config: { enabled: boolean; assets: string[]; intervalSeconds: number };
  };
  performance: ReturnType<typeof performanceFrom>;
};
export default function AgentOperations() {
  const [status, setStatus] = useState<Status | null>(null),
    [assets, setAssets] = useState('RNVDAUSDT, BTCUSDT'),
    [interval, setIntervalValue] = useState(60),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/agent-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setStatus(d);
      if (!initialized.current) {
        initialized.current = true;
        setAssets(d.worker.config.assets.join(', '));
        setIntervalValue(d.worker.config.intervalSeconds);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status unavailable');
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [refresh]);
  async function act(action: string) {
    setBusy(true);
    setError('');
    try {
      const body =
        action === 'configure'
          ? {
              action,
              config: {
                enabled: true,
                assets: assets
                  .toUpperCase()
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                intervalSeconds: interval,
              },
            }
          : { action };
      const r = await fetch('/api/agent-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json();
        throw Error(d.error);
      }
      if (action === 'export') {
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = 'crossflow-paper-evidence.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        setStatus(await r.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  }
  const fmt = (n: number | null | undefined) => (n == null ? 'Insufficient data' : n.toFixed(2));
  return (
    <section className="panel operations-panel">
      <div className="panel-heading">
        <h3>Autonomous paper agent</h3>
        <span className="badge">{status?.worker.online ? 'WORKER ONLINE' : 'WORKER OFFLINE'}</span>
      </div>
      <p>
        The agent evaluates stocks and crypto sequentially against one shared paper portfolio.
        Approved decisions execute automatically after position, exposure, daily-loss, freshness,
        and portfolio risk checks; no per-trade confirmation is required. Bitget orders are never
        placed by this autonomous paper worker.
      </p>
      <p>
        Start the worker in a separate terminal with <code>npm run worker</code>, then enable it
        here. Keep the process running. Read-only mode blocks execution.
      </p>
      <div className="operations-form">
        <label>
          Assets (up to 8, comma-separated)
          <input
            value={assets}
            onChange={(e) => setAssets(e.target.value)}
            placeholder="RNVDAUSDT, BTCUSDT"
          />
        </label>
        <label>
          Seconds between completed cycles
          <input
            type="number"
            min={60}
            max={3600}
            value={interval}
            onChange={(e) => setIntervalValue(Number(e.target.value))}
          />
        </label>
      </div>
      <p>
        Saved: {status?.worker.config.assets.join(', ') ?? 'Loading…'} ·{' '}
        {status?.worker.config.enabled ? 'Enabled' : 'Paused'} ·{' '}
        {status?.worker.phase ?? 'Not started'}
      </p>
      <div className="exchange-tabs">
        <button disabled={busy} onClick={() => void act('configure')}>
          Enable / save paper agent
        </button>
        <button disabled={busy} onClick={() => void act('pause')}>
          Pause paper agent
        </button>
        <button disabled={busy} onClick={() => void act('export')}>
          Download evidence JSON
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p>
        Pausing blocks pending worker orders as well as the next cycle. Automatic protective paper
        stops may already have been processed during a running cycle.
      </p>
      <div className="exchange-table">
        <table>
          <tbody>
            <tr>
              <th>Observed equity snapshots</th>
              <td>{status?.performance.freshSnapshotCount ?? 0}</td>
            </tr>
            <tr>
              <th>Observed days / missing-date intervals</th>
              <td>
                {status?.performance.observedDays ?? 0} / {status?.performance.gaps ?? 0}
              </td>
            </tr>
            <tr>
              <th>Annualized daily Sharpe</th>
              <td>{fmt(status?.performance.annualizedSharpe)}</td>
            </tr>
            <tr>
              <th>Annualized daily Sortino</th>
              <td>{fmt(status?.performance.annualizedSortino)}</td>
            </tr>
            <tr>
              <th>Sampled mark-to-market drawdown (%)</th>
              <td>{fmt(status?.performance.sampledMarkToMarketDrawdownPercent)}</td>
            </tr>
            <tr>
              <th>Observed return / cash baseline (%)</th>
              <td>
                {fmt(status?.performance.observedReturnPercent)} /{' '}
                {fmt(status?.performance.cashBaselineReturnPercent)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>{status?.performance.methodology}</p>
      {status?.worker.lastCycle != null && (
        <details>
          <summary>Last worker cycle</summary>
          <pre>{JSON.stringify(status.worker.lastCycle, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
