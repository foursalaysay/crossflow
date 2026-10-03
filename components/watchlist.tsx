'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Instrument } from '@/lib/types';
export default function Watchlist({
  universe,
  asset,
  onSelect,
}: {
  universe: Instrument[];
  asset: string;
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const [quotes, setQuotes] = useState<Record<string, { price: number; timestamp: number }>>({});
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(0);
  useEffect(() => {
    let active = true,
      pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const r = await fetch('/api/market?quotes=1', { signal: controller.signal });
        const data = await r.json();
        if (!r.ok) throw Error('Quotes unavailable');
        if (active) {
          setQuotes(data);
          setChecked(Date.now());
          setError('');
        }
      } catch {
        if (active) {
          setQuotes({});
          setError('Quotes unavailable');
        }
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  const watch = useMemo(
    () =>
      universe
        .filter(
          (i) =>
            i.status === 'online' &&
            i.symbol.endsWith('USDT') &&
            (i.reality || ['BTCUSDT', 'ETHUSDT'].includes(i.symbol)),
        )
        .sort((a, b) => Number(a.reality) - Number(b.reality) || a.symbol.localeCompare(b.symbol)),
    [universe],
  );
  const filtered = watch.filter((i) => i.symbol.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 40));
  const current = Math.min(page, pages - 1);
  return (
    <div className="sidebar-watch">
      <div className="section-label">
        YOUR WATCHLIST <span>{watch.length.toLocaleString()}</span>
      </div>
      <p className="watch-caption">All Bitget US stocks / ETFs + BTC & ETH</p>
      <input
        className="watch-search"
        aria-label="Search watchlist"
        placeholder="Search ticker, e.g. AAPL"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      <div className="watch-scroll">
        {filtered.slice(current * 40, (current + 1) * 40).map((i, index) => {
          const quote = quotes[i.symbol];
          const fresh =
            quote && checked - quote.timestamp <= 60000 && checked >= quote.timestamp - 5000;
          return (
            <button
              key={i.symbol}
              className={'watch-item ' + (asset === i.symbol ? 'selected' : '')}
              onClick={() => onSelect(i.symbol)}
              aria-pressed={asset === i.symbol}
            >
              <span className={'coin coin-' + (index % 6)}>
                {i.symbol === 'BTCUSDT' ? '₿' : i.symbol === 'ETHUSDT' ? 'Ξ' : i.symbol.slice(1, 2)}
              </span>
              <span>
                {i.symbol.replace(/USDT$/, '')}
                <small>{i.reality ? 'Stock / ETF' : 'Crypto'}</small>
              </span>
              <span
                className="watch-price"
                title={
                  fresh
                    ? `Bitget · ${new Date(quote.timestamp).toLocaleTimeString()}`
                    : 'Quote unavailable or stale'
                }
              >
                {fresh
                  ? quote.price.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '—'}
              </span>
            </button>
          );
        })}
        {!filtered.length && (
          <p className="muted compact">
            {universe.length ? 'No matching instruments.' : 'Loading Bitget instruments…'}
          </p>
        )}
      </div>
      <div className="watch-pages">
        <button
          aria-label="Previous watchlist page"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          ‹
        </button>
        <span>
          {current + 1} / {pages} · {filtered.length.toLocaleString()} pairs
        </span>
        <button
          aria-label="Next watchlist page"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          ›
        </button>
      </div>
      <p className="watch-caption" role={error ? 'status' : undefined}>
        {error || 'Bitget quotes · refresh every 30s'}
      </p>
    </div>
  );
}
