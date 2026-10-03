'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExchangePortfolio, RecordKind } from '@/lib/exchange-portfolio';
const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 8 });
async function read(body: object) {
  const response = await fetch('/api/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Bitget request failed');
  return data;
}
export function useExchangePortfolio() {
  const [data, setData] = useState<ExchangePortfolio | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      setData(await read({ action: 'portfolio' }));
      setError('');
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Exchange unavailable');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [refresh]);
  return { data, error, busy, refresh };
}
export default function ExchangeTrades({
  data,
  error,
  busy,
  refresh,
}: ReturnType<typeof useExchangePortfolio>) {
  const [tab, setTab] = useState<RecordKind | 'holdings'>('open');
  return (
    <section className="panel exchange-trades">
      <div className="panel-heading">
        <div>
          <h3>
            Exchange trades <small> · {data?.environment.toUpperCase() ?? 'BITGET'}</small>
          </h3>
          <p>Bitget spot orders and account holdings · refreshes every 30 seconds</p>
        </div>
        <button onClick={() => void refresh()} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh account'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data?.errors.account && <p role="alert">Account unavailable: {data.errors.account}</p>}
      {data?.account?.usdtEquity === null && (
        <p>Bitget returned no equity total. Missing values are shown as —.</p>
      )}
      <div className="exchange-tabs">
        {(['open', 'holdings', 'history', 'fills'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {
              {
                open: 'Current orders',
                holdings: 'Holdings',
                history: 'Order history',
                fills: 'Trade fills',
              }[t]
            }
          </button>
        ))}
      </div>
      {tab === 'holdings' ? (
        !data?.account ? (
          <p>Holdings unavailable.</p>
        ) : data.account.assets.length === 0 ? (
          <p>No account holdings returned by Bitget.</p>
        ) : (
          <div className="exchange-table">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Balance</th>
                  <th>Available</th>
                  <th>Locked</th>
                  <th>Debt</th>
                </tr>
              </thead>
              <tbody>
                {data.account.assets.map((a) => (
                  <tr key={a.coin}>
                    <td>{a.coin}</td>
                    <td>{fmt(a.balance)}</td>
                    <td>{fmt(a.available)}</td>
                    <td>{fmt(a.locked)}</td>
                    <td>{fmt(a.debt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Records
          key={`${tab}:${data?.checkedAt}`}
          kind={tab}
          page={data?.records[tab] ?? null}
          error={data?.errors[tab]}
        />
      )}
      <p className="exchange-note">
        {data ? `Last checked ${new Date(data.checkedAt).toLocaleString()}. ` : ''}Account totals
        come from Bitget. Paper trades remain in Trade journal and Performance.
      </p>
    </section>
  );
}
function Records({
  kind,
  page,
  error,
}: {
  kind: RecordKind;
  page: ExchangePortfolio['records'][RecordKind];
  error?: string;
}) {
  const [rows, setRows] = useState(page?.rows ?? []),
    [cursor, setCursor] = useState(page?.cursor ?? null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  async function more() {
    if (!page || !cursor || busy) return;
    setBusy(true);
    setFailure('');
    try {
      const next = await read({
        action: 'records',
        kind,
        cursor,
        startTime: page.startTime,
        endTime: page.endTime,
      });
      setRows((old) => Array.from(new Map([...old, ...next.rows].map((r) => [r.id, r])).values()));
      setCursor(next.cursor === cursor ? null : next.cursor);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not load records');
    } finally {
      setBusy(false);
    }
  }
  if (!page)
    return <p role={error ? 'alert' : undefined}>{error ?? 'Loading exchange records…'}</p>;
  return (
    <>
      {kind !== 'open' && <p>Last 30 days · spot {kind === 'fills' ? 'executions' : 'orders'}</p>}
      {rows.length === 0 ? (
        <p>
          No{' '}
          {kind === 'open'
            ? 'open spot orders'
            : kind === 'fills'
              ? 'trade fills in this period'
              : 'orders in this period'}{' '}
          returned by Bitget.
        </p>
      ) : (
        <div className="exchange-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Status</th>
                <th>Quantity</th>
                <th>Filled</th>
                <th>Price</th>
                <th>Average fill</th>
                {kind === 'fills' && <th>Fees</th>}
                <th>Order ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</td>
                  <td>{r.symbol}</td>
                  <td>{r.side}</td>
                  <td>{r.status.replaceAll('_', ' ')}</td>
                  <td>{fmt(r.quantity)}</td>
                  <td>{fmt(r.filled)}</td>
                  <td>{fmt(r.price)}</td>
                  <td>{fmt(r.average)}</td>
                  {kind === 'fills' && (
                    <td>
                      {r.fees.map((f) => `${fmt(f.amount)} ${f.coin ?? ''}`).join(', ') || '—'}
                    </td>
                  )}
                  <td>{r.orderId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {failure && <p role="alert">{failure}</p>}
      {cursor && (
        <button disabled={busy} onClick={() => void more()}>
          {busy ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
