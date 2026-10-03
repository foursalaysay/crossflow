'use client';
import { useEffect, useState } from 'react';
import type { LiveOrder } from '@/lib/live';
import type { ExchangeAccount } from '@/lib/bitget-private';
type Order = Omit<LiveOrder, 'scope'>;
type Status = {
  configured: boolean;
  enabled: boolean;
  environment: 'demo' | 'live';
  maxOrderUSDT: number;
  orders: Order[];
};
async function api(action: string, data: Record<string, unknown> = {}) {
  const r = await fetch('/api/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error);
  return result;
}
export default function Connections({
  symbol,
  pair,
  readOnly,
}: {
  symbol: string;
  pair: string;
  readOnly: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [account, setAccount] = useState<ExchangeAccount | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [preview, setPreview] = useState<Order | null>(null),
    [confirmation, setConfirmation] = useState('');
  const [side, setSide] = useState('buy'),
    [quantity, setQuantity] = useState(''),
    [stop, setStop] = useState(''),
    [target, setTarget] = useState('');
  useEffect(() => {
    let active = true;
    api('status')
      .then((v) => {
        if (active) setStatus(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setStatus(await api('status'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connections">
      <section className="panel full-panel">
        <h2>
          Bitget account connection{' '}
          <span className="badge">{status?.environment.toUpperCase() ?? 'CHECKING'} EXCHANGE</span>
        </h2>
        <p>
          Market prices are public. Account access uses server-side credentials. Agent runs and
          performance remain paper-only.
        </p>
        <div className="connection-stats">
          <b>{status?.configured ? 'Credentials configured' : 'Credentials missing'}</b>
          <b>{status?.enabled ? 'Order submission enabled' : 'Order submission locked'}</b>
          <b>Order cap: {status?.maxOrderUSDT ?? '—'} USDT</b>
        </div>
        <p>
          Add BITGET_API_KEY, BITGET_API_SECRET and BITGET_PASSPHRASE to .env, then restart. Use a
          dedicated UTA spot account with read/trade permissions and no withdrawal permission.
          Choose BITGET_ENV=demo or live explicitly.
        </p>
        <button
          disabled={busy || !status?.configured}
          onClick={() =>
            void perform(async () => {
              const v = await api('connect');
              setAccount(v.account);
              setMessage(
                `Authenticated ${v.environment} account checked at ${new Date(v.checkedAt).toLocaleTimeString()}. Trade permission is verified only on submission.`,
              );
            })
          }
        >
          Test Bitget connection
        </button>
        {account && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Available</th>
                  <th>Balance</th>
                  <th>Locked</th>
                </tr>
              </thead>
              <tbody>
                {account.assets.map((a) => (
                  <tr key={a.coin}>
                    <td>{a.coin}</td>
                    <td>{a.available}</td>
                    <td>{a.balance}</td>
                    <td>{a.locked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Exchange equity:{' '}
              {account.usdtEquity === null
                ? 'Not supplied by Bitget'
                : `${account.usdtEquity} USDT`}
              . Separate from paper funds.
            </p>
            {(account.usdtEquity === null || account.positionValue === null) && (
              <p role="alert">
                Connection authenticated, but Bitget did not supply account equity or position
                exposure. Check your Demo account funding and UTA availability in Bitget. New buys
                remain blocked until these values are available.
              </p>
            )}
          </div>
        )}
      </section>
      <section className="panel full-panel">
        <h2>Confirmed spot order</h2>
        <p>
          Trade <b>{symbol}</b> against <b>{pair}</b> evidence. Select assets in Overview. IOC limit
          orders can fill partially; the remainder cancels. Buys request exchange TP/SL and require
          structural support. Verify active protection in Bitget after a fill.
        </p>
        <p>
          Full buy principal is capped at your risk percentage of exchange cash. Daily gross buys
          are capped by the daily loss percentage. Sell only owned assets. No borrowing.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              setPreview(null);
              setConfirmation('');
              setPreview(
                await api('preview', {
                  ticket: {
                    symbol,
                    pair,
                    side,
                    quantity: Number(quantity),
                    ...(side === 'buy' ? { stop: Number(stop), target: Number(target) } : {}),
                  },
                }),
              );
            });
          }}
        >
          <div className="connection-form">
            <label>
              Side
              <select
                value={side}
                onChange={(e) => {
                  setSide(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="buy">Buy / long</option>
                <option value="sell">Sell owned assets</option>
              </select>
            </label>
            <label>
              Base asset quantity
              <input
                required
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            {side === 'buy' && (
              <>
                <label>
                  Stop price (USDT)
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    value={stop}
                    onChange={(e) => {
                      setStop(e.target.value);
                      setPreview(null);
                    }}
                  />
                </label>
                <label>
                  Target price (USDT)
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setPreview(null);
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <button
            disabled={busy || readOnly || !status?.configured || !status.enabled}
            type="submit"
          >
            Preview exchange order
          </button>
        </form>
        {readOnly && <p>Read-only mode blocks order submission.</p>}
        {!status?.enabled && (
          <p>
            After setup, set{' '}
            {status?.environment === 'demo' ? 'ENABLE_DEMO_TRADING' : 'ENABLE_LIVE_TRADING'}=true in
            .env and restart to unlock this ticket. Autonomous live trading remains disabled.
          </p>
        )}
        {preview && preview.status === 'PREVIEW' && (
          <div className="order-preview">
            <h3>
              {preview.environment === 'live' ? 'REAL MONEY' : 'EXCHANGE DEMO'} · Review order
            </h3>
            <p>
              {preview.request.side.toUpperCase()} {preview.request.qty} {preview.input.symbol} ·
              limit {preview.request.price} USDT · maximum principal {preview.notional.toFixed(4)}{' '}
              USDT, plus fees.
            </p>
            <p>
              Stop: {preview.request.stopLoss ?? '—'} · Target: {preview.request.takeProfit ?? '—'}{' '}
              · Expires: {new Date(preview.expiresAt).toLocaleTimeString()}
            </p>
            <ul>
              {preview.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <label>
              Type <strong>{preview.confirmation}</strong> to confirm
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={
                busy || readOnly || confirmation !== preview.confirmation || now > preview.expiresAt
              }
              onClick={() =>
                void perform(async () => {
                  const order = await api('confirm', { id: preview.id, confirmation });
                  setPreview(null);
                  setConfirmation('');
                  setMessage(
                    `${order.status}: ${order.error ?? 'Exchange acknowledgement is not a verified fill. Reconcile below.'}`,
                  );
                })
              }
            >
              Submit {preview.environment === 'live' ? 'real-money' : 'demo'} order
            </button>
          </div>
        )}
      </section>
      <section className="panel full-panel">
        <h2>Exchange order audit</h2>
        <p>
          Reconcile after submission. Unknown outcomes block further orders; never retry with a new
          ID. Use Bitget to inspect fills, manage exits and verify active TP/SL. Preset fields alone
          do not prove that protection remains active.
        </p>
        {!status?.orders.length && (
          <p className="muted">No exchange orders submitted from this app.</p>
        )}
        {status?.orders.map((o) => (
          <div className="exchange-order" key={o.id}>
            <b>
              {o.environment.toUpperCase()} · {o.input.side.toUpperCase()} {o.request.qty}{' '}
              {o.input.symbol}
            </b>
            <p>
              {o.status} · Exchange: {o.exchange?.orderStatus ?? 'not reconciled'} · Filled:{' '}
              {o.exchange?.cumExecQty ?? 'unknown'} · Average: {o.exchange?.avgPrice ?? 'unknown'}
            </p>
            <p>
              {o.protection ?? 'Protection not verified'} {o.error}
            </p>
            <code>{o.id}</code>
            {o.status !== 'REJECTED' && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const v = await api('reconcile', { id: o.id });
                    setMessage(`Exchange status: ${v.exchange.orderStatus}. ${v.protection}`);
                  })
                }
              >
                Reconcile status
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="panel full-panel">
        <h2>Add your LLM</h2>
        <ol>
          <li>Save your hackathon Qwen API key as LLM_API_KEY in .env.</li>
          <li>
            Set LLM_API_KEY, LLM_BASE_URL=https://hackathon.bitgetops.com/v1 and
            LLM_MODEL=qwen3.8-max and LLM_API=responses.
          </li>
          <li>Restart npm run dev. Test below, then run the agent in Paper or Read only.</li>
        </ol>
        <p>
          The hackathon integration uses /responses with validated JSON output. Never paste keys
          into chat or browser inputs. Missing or invalid model output produces WAIT.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const r = await fetch('/api/llm', { method: 'POST' });
              const v = await r.json();
              if (!r.ok) throw Error(v.error);
              setMessage(`${v.model}: ${v.message}`);
            })
          }
        >
          Test LLM connection (small API call)
        </button>
        <p>Detailed setup: docs/setup-bitget.md and docs/setup-llm.md in the project.</p>
      </section>
      {error && (
        <div className="connection-feedback error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="connection-feedback" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
