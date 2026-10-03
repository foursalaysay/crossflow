'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FlaskConical,
  Globe2,
  Layers3,
  LayoutDashboard,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import Chart from './chart';
import Watchlist from './watchlist';
import AgentOperations from './agent-operations';
import Analytics from './analytics';
import Connections from './connections';
import ExchangeTrades, { useExchangePortfolio } from './exchange-trades';
import { MarketContext } from '@/lib/analysis';
import { Instrument, MacroEvent, Timeframe, RiskConfig } from '@/lib/types';
import type { ReplaySession } from '@/lib/replay';
import type { Trace } from '@/lib/service';
import type { Trade } from '@/lib/portfolio';
type State = {
  mode: 'PAPER' | 'READ_ONLY';
  riskConfig: RiskConfig;
  account: {
    balance: number;
    equity: number;
    unrealized: number;
    openPositions: number;
    dailyPnl: number;
  };
  analytics: Record<string, number | null | unknown>;
  trades: Trade[];
  decisions: Trace[];
  macro: MacroEvent[];
  macroFeed: {
    status: string;
    lastSuccessAt: number | null;
    error: string | null;
    scheduledVerifiedAt?: string;
  };
  strategy: unknown[];
  evaluation: {
    riskViolationAttempts: number;
    humanInterventions: number;
    decisionConsistency: number | null;
    averageConfluenceAtEntry: number | null;
    averageRealizedR: number | null;
    validationFailures: number;
  };
  agentConfigured: boolean;
};
const number = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const nav = [
  ['Overview', LayoutDashboard],
  ['Agent operations', Play],
  ['Decision history', Layers3],
  ['Exchange trades', Activity],
  ['Trade journal', BookOpen],
  ['Performance', TrendingUp],
  ['Macro calendar', Globe2],
  ['Risk controls', ShieldCheck],
  ['Connections', Settings2],
  ['Demo lab', FlaskConical],
] as const;
export default function Terminal({ initialView = 'Overview' }: { initialView?: string }) {
  const exchange = useExchangePortfolio();
  const [replaySession, setReplaySession] = useState<ReplaySession | null>(null);
  const [view, setView] = useState(initialView),
    [ctx, setCtx] = useState<MarketContext | null>(null),
    [state, setState] = useState<State | null>(null),
    [universe, setUniverse] = useState<Instrument[]>([]),
    [asset, setAsset] = useState('RNVDAUSDT'),
    [pair, setPair] = useState('BTCUSDT'),
    [tf, setTf] = useState<Timeframe>('1H'),
    [mode, setMode] = useState<'PAPER' | 'READ_ONLY'>('PAPER'),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [overlays, setOverlays] = useState(['S/R']),
    [trace, setTrace] = useState<Trace | null>(null),
    [macroText, setMacroText] = useState(''),
    [showImport, setShowImport] = useState(false),
    [clock, setClock] = useState(''),
    [replayIndex, setReplayIndex] = useState(80),
    [replay, setReplay] = useState<MarketContext | null>(null);
  const refreshState = useCallback(async () => {
    const r = await fetch('/api/state');
    if (r.ok) {
      const data = await r.json();
      setState(data);
      setMode(data.mode);
    }
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/market?asset=${asset}&pair=${pair}&timeframe=${tf}`);
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setCtx(data);
    } catch (e) {
      setCtx(null);
      setError(e instanceof Error ? e.message : 'Data unavailable');
    } finally {
      setLoading(false);
    }
  }, [asset, pair, tf]);
  useEffect(() => {
    let active = true;
    fetch('/api/market?instruments=1')
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data)) setUniverse(data);
      })
      .catch(() => {});
    const timer = setInterval(() => {
      setClock(new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour12: false }));
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const start = setTimeout(() => {
      void refresh();
      void refreshState();
    }, 0);
    const id = setInterval(() => {
      void refresh();
      void refreshState();
    }, 30000);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [refresh, refreshState]);
  async function runAgent() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, pair, timeframe: tf, mode }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      setTrace(result);
      setCtx(result.context);
      await refreshState();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  }
  async function updateMode(next: 'PAPER' | 'READ_ONLY') {
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    });
    if (!r.ok) setError('Failed to update operating mode');
    await refreshState();
  }
  async function updateRisk(config: RiskConfig) {
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await r.json();
    if (!r.ok) setError(data.error);
    await refreshState();
  }
  async function syncMacroEvents() {
    setBusy(true);
    try {
      const r = await fetch('/api/macro/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      await refreshState();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Macro sync failed');
    } finally {
      setBusy(false);
    }
  }
  async function importMacro() {
    try {
      const value = JSON.parse(macroText);
      const r = await fetch('/api/macro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setShowImport(false);
      await refreshState();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid event');
    }
  }
  async function close(id: string) {
    if (mode !== 'PAPER') {
      setError('Read only: switch to paper mode before closing.');
      return;
    }
    const r = await fetch('/api/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await r.json();
    if (!r.ok) setError(data.error);
    await refreshState();
  }
  async function replayStep(reset = false) {
    setBusy(true);
    try {
      const r = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? {} : { id: replaySession?.id }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setReplay(data.context);
      setReplaySession(data.session);
      setReplayIndex(data.session.index);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay unavailable');
    } finally {
      setBusy(false);
    }
  }
  const latestTrace = [trace, ...(state?.decisions ?? [])]
    .filter(
      (d): d is Trace =>
        !!d &&
        d.context.assetA.symbol === asset &&
        d.context.assetB.symbol === pair &&
        d.context.assetA.timeframe === tf,
    )
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  const selectedTrace = view === 'Overview' ? latestTrace : (trace ?? latestTrace),
    decision = selectedTrace?.agent.decision,
    t = ctx?.assetA.analysis,
    cross = ctx?.crossAsset;
  const online = ctx?.assetA.status === 'VALID' && ctx?.assetB.status === 'VALID';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Activity size={24} />
          </span>
          CrossFlow<span className="brand-dot">•</span>
        </Link>
        <div className="workspace">
          <div className="avatar">CF</div>
          <div>
            Research workspace<small>Hackathon S2 · Bitget</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="section-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              onClick={() => {
                setView(label);
                setSearch('');
              }}
              className={view === label ? 'nav-item active' : 'nav-item'}
            >
              <Icon size={17} />
              {label}
              {label === 'Demo lab' && <span className="tiny-label">NEW</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="safe-icon">
            <ShieldCheck size={18} />
          </div>
          <b>Built with boundaries.</b>
          <p>
            Your agent reasons.
            <br />
            Your risk rules decide.
          </p>
          <span className="badge">LIVE: MANUAL CONFIRMATION</span>
        </div>
        <div className="user">
          <span className="avatar">PH</span>
          <div>
            Asia / Manila<small>{clock || '--:--:--'} PHT</small>
          </div>
          <Settings2 size={17} />
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} /> <span>{view}</span>
          </div>
          <div className="header-right">
            <span className={'status ' + (online ? 'good' : '')}>
              ● {loading ? 'SYNCING' : online ? 'BITGET MARKET DATA' : 'DATA CHECK'}
            </span>
            <span className="divider" />
            <select
              aria-label="Operating mode"
              value={mode}
              onChange={(e) => void updateMode(e.target.value as typeof mode)}
            >
              <option value="PAPER">◈ Paper trading</option>
              <option value="READ_ONLY">Read only</option>
              <option disabled value="LIVE">
                Live ticket → Connections
              </option>
            </select>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ALWAYS WATCHING. NEVER ASSUMING.</div>
              <h1>{view === 'Overview' ? 'The bigger picture.' : view}</h1>
              <p>Cross-market evidence. Independent reasoning. Controlled execution.</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={() => {
                  void refresh();
                  void refreshState();
                }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                Refresh
              </button>
              <button className="button primary" disabled={busy || loading} onClick={runAgent}>
                <Sparkles size={15} />
                {busy ? 'Analyzing…' : 'Run agent'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner">
              {error}
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          <div className="stats-row">
            <Stat
              label={`BITGET ${exchange.data?.environment.toUpperCase() ?? ''} EQUITY`}
              value={
                exchange.data?.account?.usdtEquity == null
                  ? '—'
                  : `$${number(exchange.data.account.usdtEquity)}`
              }
              detail={
                exchange.data?.checkedAt
                  ? `Updated ${new Date(exchange.data.checkedAt).toLocaleTimeString()}`
                  : 'Connecting to Bitget'
              }
              icon={<Layers3 size={15} />}
            />
            <Stat
              label="UNREALIZED P&L"
              value={
                exchange.data?.account?.usdtUnrealisedPnl == null
                  ? '—'
                  : `$${number(exchange.data.account.usdtUnrealisedPnl)}`
              }
              detail="Exchange-reported account P&L"
              icon={<TrendingUp size={15} />}
            />
            <Stat
              label="OPEN SPOT ORDERS"
              value={
                exchange.data?.records.open
                  ? `${exchange.data.records.open.rows.length}${exchange.data.records.open.cursor ? '+' : ''}`
                  : '—'
              }
              detail="Active orders on Bitget"
              icon={<Activity size={15} />}
            />
            <Stat
              label="AVAILABLE USDT"
              value={number(
                exchange.data?.account?.assets.find((a) => a.coin === 'USDT')?.available,
              )}
              detail="Exchange available balance"
              icon={<ShieldCheck size={15} />}
            />
          </div>
          {(view === 'Overview' || view === 'Exchange trades') && <ExchangeTrades {...exchange} />}
          {view === 'Agent operations' && <AgentOperations />}
          {view === 'Overview' && (
            <>
              <div className="market-layout">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div className="symbol-heading">
                      <span className="coin coin-2">
                        {asset.startsWith('R') ? asset[1] : asset[0]}
                      </span>
                      <div>
                        <select
                          aria-label="Traded asset"
                          value={asset}
                          onChange={(e) => setAsset(e.target.value)}
                        >
                          {[
                            ...new Set([
                              asset,
                              ...universe
                                .filter((i) => i.status === 'online' && i.symbol.endsWith('USDT'))
                                .map((i) => i.symbol),
                            ]),
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <small>
                          {ctx?.assetA.instrument?.reality ? 'Tokenized US stock' : 'Spot market'}{' '}
                          <span> / USDT</span>
                        </small>
                      </div>
                      <div className="asset-price">
                        ${number(ctx?.assetA.price)}
                        <small className="lime">{t?.regime ?? 'LOADING'}</small>
                      </div>
                    </div>
                    <span className="data-label">● {ctx?.assetA.status ?? 'LOADING'}</span>
                  </div>
                  <div className="chart-controls">
                    <div className="timeframes">
                      {(['5m', '15m', '1H', '4H', '1D'] as Timeframe[]).map((v) => (
                        <button
                          key={v}
                          className={tf === v ? 'chosen' : ''}
                          onClick={() => setTf(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className="overlay-controls">
                      {['S/R', 'Trendlines', 'Volume profile', 'Position'].map((v) => (
                        <button
                          key={v}
                          className={overlays.includes(v) ? 'on' : ''}
                          onClick={() =>
                            setOverlays(
                              overlays.includes(v)
                                ? overlays.filter((x) => x !== v)
                                : [...overlays, v],
                            )
                          }
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  {ctx?.assetA.candles.length ? (
                    <Chart
                      context={ctx}
                      overlays={overlays}
                      levels={
                        state?.trades
                          .filter((t) => t.status === 'OPEN' && t.asset === asset)
                          .flatMap((t) => [
                            { title: 'ENTRY', price: t.entry },
                            { title: 'STOP', price: t.stop },
                            ...t.targets.map((p, i) => ({ title: `TP${i + 1}`, price: p })),
                          ]) ?? []
                      }
                    />
                  ) : (
                    <div className="chart-empty">
                      <Activity size={32} />
                      <b>{loading ? 'Connecting to Bitget' : 'Market data unavailable'}</b>
                      <p>
                        {ctx?.assetA.error ?? 'Waiting for verified OHLCV. No simulated prices.'}
                      </p>
                    </div>
                  )}
                  <div className="chart-footer">
                    <span>
                      BITGET <span className="muted">/ REST · 30s polling</span>
                    </span>
                    <span>
                      Closed candles only ·{' '}
                      {ctx
                        ? new Date(ctx.assetA.timestamp).toLocaleTimeString('en-PH', {
                            timeZone: 'Asia/Manila',
                          })
                        : '—'}{' '}
                      PHT
                    </span>
                  </div>
                </section>
                <section className="panel agent-panel">
                  <div className="panel-heading">
                    <span className="panel-title">
                      <Sparkles size={16} className="lime" /> CrossFlow Agent
                    </span>
                    <span className={'status ' + (state?.agentConfigured ? 'good' : '')}>
                      ●{' '}
                      {busy
                        ? 'RUNNING'
                        : !state?.agentConfigured
                          ? 'SETUP NEEDED'
                          : selectedTrace?.agent.provider === 'failed'
                            ? 'LAST RUN FAILED'
                            : 'READY'}
                    </span>
                  </div>
                  <div className="agent-body">
                    <div className="agent-topline">
                      <span className="eyebrow">LATEST DECISION</span>
                      <span className="muted">
                        {selectedTrace
                          ? new Date(selectedTrace.timestamp).toLocaleString('en-PH', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Not run yet'}
                      </span>
                    </div>
                    <div className="decision">
                      <span>{decision?.decision ?? 'STANDBY'}</span>
                      <span className="decision-icon">
                        <Clock size={22} />
                      </span>
                    </div>
                    <p className="agent-summary">
                      {selectedTrace?.agent.provider === 'unconfigured' && state?.agentConfigured
                        ? 'This saved decision predates your API key. Run the agent again for a new analysis.'
                        : (decision?.reasoningSummary[0] ??
                          'Evidence first. Run the agent to evaluate this pair within your risk boundaries.')}
                    </p>
                    {selectedTrace?.agent.error && (
                      <p className="agent-summary" role="alert">
                        {selectedTrace.agent.error === 'LLM_TIMEOUT'
                          ? 'Qwen exceeded the two-minute response limit. Run the agent again to request fresh analysis. No order was submitted.'
                          : selectedTrace.agent.error === 'LLM_NETWORK_ERROR'
                            ? 'The connection to Qwen failed. Check your network and try again. No order was submitted.'
                            : selectedTrace.agent.error === 'LLM_NETWORK_OR_TIMEOUT'
                              ? 'Qwen could not finish the request within the time limit, or the network connection failed. No order was submitted.'
                              : selectedTrace.agent.error}
                      </p>
                    )}
                    <div className="confluence">
                      <div>
                        <span>Technical confluence</span>
                        <b>
                          {t?.confluence ?? '—'} <span>/ 100</span>
                        </b>
                      </div>
                      <div className="meter">
                        <span style={{ width: `${t?.confluence ?? 0}%` }} />
                      </div>
                      <small>Evidence strength, not win probability</small>
                    </div>
                    <div className="evidence-row">
                      <span>Market structure</span>
                      <b>{t?.regime ?? '—'}</b>
                    </div>
                    <div className="evidence-row">
                      <span>Relative volume</span>
                      <b>{number(t?.relativeVolume)}×</b>
                    </div>
                    <div className="evidence-row">
                      <span>20-period correlation</span>
                      <b>{number(cross?.correlation20)}</b>
                    </div>
                    <div className="evidence-row">
                      <span>Macro phase</span>
                      <b>{ctx?.macro.phase ?? '—'}</b>
                    </div>
                    <div className="agent-reasoning">
                      <span className="eyebrow">WHAT THE AGENT SAW</span>
                      {decision ? (
                        decision.reasoningSummary.slice(1, 4).map((r, i) => (
                          <p key={i}>
                            <span>↳</span>
                            {r}
                          </p>
                        ))
                      ) : (
                        <p>
                          <span>↳</span>Calculated market context is ready when both feeds are
                          valid.
                        </p>
                      )}
                    </div>
                    <div className="reconsider">
                      <Zap size={15} />
                      <div>
                        <b>Reconsider when</b>
                        <p>
                          {decision?.conditionsToReevaluate[0] ??
                            'Fresh evidence and a configured LLM are available.'}
                        </p>
                      </div>
                    </div>
                    <div className="memory-mini">
                      <span className="eyebrow">PAST SIMILAR TRADES</span>
                      <p>
                        {selectedTrace?.similarTrades.length ?? 0} comparable trades retrieved ·{' '}
                        {state?.strategy.length ?? 0} aggregate observations
                      </p>
                    </div>
                    <button
                      className="text-button"
                      disabled={!selectedTrace}
                      onClick={() => {
                        setTrace(selectedTrace ?? null);
                        setView('Decision history');
                      }}
                    >
                      Inspect full decision trace <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
              </div>
              <div className="lower-layout">
                <section className="panel cross-panel">
                  <div className="panel-heading">
                    <span className="panel-title">
                      <Activity size={16} /> Cross-asset relationship
                    </span>
                    <select
                      aria-label="Comparison asset"
                      value={pair}
                      onChange={(e) => setPair(e.target.value)}
                    >
                      {[
                        ...new Set([
                          pair,
                          ...universe
                            .filter(
                              (i) =>
                                i.status === 'online' &&
                                i.symbol.endsWith('USDT') &&
                                (i.reality || ['BTCUSDT', 'ETHUSDT'].includes(i.symbol)),
                            )
                            .map((i) => i.symbol),
                        ]),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="comparison-legend">
                    <span>
                      <i className="dot lime-bg" />
                      {asset.replace('USDT', '')} <b>{number(cross?.normalized.at(-1)?.a)}</b>
                    </span>
                    <span>
                      <i className="dot blue-bg" />
                      {pair.replace('USDT', '')} <b>{number(cross?.normalized.at(-1)?.b)}</b>
                    </span>
                    <small>Normalized to 100</small>
                  </div>
                  {ctx && <Chart context={ctx} overlays={[]} compare />}
                  <div className="cross-metrics">
                    <div>
                      <small>CORRELATION · 20</small>
                      <b>{number(cross?.correlation20)}</b>
                    </div>
                    <div>
                      <small>CORRELATION · 50</small>
                      <b>{number(cross?.correlation50)}</b>
                    </div>
                    <div>
                      <small>CORRELATION · 100</small>
                      <b>{number(cross?.correlation100)}</b>
                    </div>
                    <div>
                      <small>OBSERVED LAG</small>
                      <b>{cross?.leadLag ? `${cross.leadLag.lagCandles} candles` : '—'}</b>
                    </div>
                  </div>
                  <div className="panel-note">
                    Historical relationship. Not proof of causation or future movement.
                  </div>
                </section>
                <section className="panel macro-panel">
                  <div className="panel-heading">
                    <span className="panel-title">
                      <Globe2 size={16} /> Macro radar
                    </span>
                    <button
                      className="icon-button"
                      onClick={() => setView('Macro calendar')}
                      aria-label="Open macro calendar"
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="macro-description">
                    The catalyst is context.
                    <br />
                    <b>The reaction is evidence.</b>
                  </div>
                  {state?.macro.length ? (
                    [
                      ...state.macro.filter(
                        (e) => e.timestamp && Date.parse(e.timestamp) > (ctx?.timestamp ?? 0),
                      ),
                      ...state.macro.filter((e) => e.status === 'RELEASED').reverse(),
                    ]
                      .slice(0, 3)
                      .map((e) => (
                        <div className="macro-card" key={e.id}>
                          <span className="badge">{e.importance}</span>
                          <b>{e.title}</b>
                          <small>
                            {e.timestamp
                              ? new Date(e.timestamp).toLocaleString('en-PH', {
                                  timeZone: 'Asia/Manila',
                                })
                              : 'Timestamp unavailable'}{' '}
                            PHT
                          </small>
                        </div>
                      ))
                  ) : (
                    <div className="empty-macro">
                      <Radio size={22} />
                      <b>No verified events imported</b>
                      <p>
                        Add a sourced release or calendar event. Actual and forecast values stay
                        empty until known.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setView('Macro calendar');
                          setShowImport(true);
                        }}
                      >
                        Import macro event <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                  <div className="risk-note">
                    <ShieldCheck size={15} />
                    <span>
                      High-impact window:{' '}
                      <b>
                        {state?.riskConfig.beforeMinutes ?? 60}m before /{' '}
                        {state?.riskConfig.afterMinutes ?? 30}m after
                      </b>
                      <br />
                      Event policy: {state?.riskConfig.eventPolicy ?? 'BLOCK'}
                    </span>
                  </div>
                </section>
              </div>
              <section className="panel positions">
                <div className="panel-heading">
                  <span className="panel-title">
                    Paper positions{' '}
                    <span className="count">{state?.account.openPositions ?? 0}</span>
                  </span>
                  <span className="muted">Local simulator · fees 0.10% · slippage 0.05%</span>
                </div>
                <TradeTable
                  trades={state?.trades.filter((t) => t.status === 'OPEN') ?? []}
                  onClose={(id) => void close(id)}
                />
              </section>
            </>
          )}
          {view === 'Decision history' && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <span className="panel-title">Every action has a paper trail.</span>
                <div className="search">
                  <Search size={14} />
                  <input
                    placeholder="Search asset or decision"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="history-grid">
                <div>
                  {state?.decisions
                    .filter((d) =>
                      JSON.stringify([d.agent.decision.asset, d.agent.decision.decision])
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((d) => (
                      <button
                        className={'history-item ' + (selectedTrace?.id === d.id ? 'chosen' : '')}
                        key={d.id}
                        onClick={() => setTrace(d)}
                      >
                        <span>
                          <b>{d.agent.decision.asset}</b>
                          <small>{new Date(d.timestamp).toLocaleString()}</small>
                        </span>
                        <span className="badge">{d.agent.decision.decision}</span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  {!state?.decisions.length && (
                    <Empty
                      title="No decisions yet"
                      text="Run the agent from Overview. WAIT and validation failures are recorded too."
                    />
                  )}
                </div>
                <div className="trace">
                  {selectedTrace ? (
                    <>
                      <h2>Event → decision → execution</h2>
                      {[
                        [
                          '01 · EVENT',
                          selectedTrace.context.events.length
                            ? selectedTrace.context.events.map((e) => e.type).join(' · ')
                            : 'Scheduled market observation',
                        ],
                        [
                          '02 · PERCEPTION',
                          `${selectedTrace.context.assetA.analysis.regime} · ${selectedTrace.context.assetA.analysis.confluence}/100 confluence · ${selectedTrace.context.assetA.status}`,
                        ],
                        [
                          '03 · AGENT',
                          `${selectedTrace.agent.decision.decision} — ${selectedTrace.agent.decision.reasoningSummary.join(' ')}`,
                        ],
                        [
                          '04 · RISK',
                          `${selectedTrace.risk.status} — ${selectedTrace.risk.reasons.join(' ')}`,
                        ],
                        [
                          '05 · EXECUTION',
                          selectedTrace.execution
                            ? 'Paper execution stored with original context'
                            : 'No order executed',
                        ],
                        [
                          '06 · MEMORY',
                          `${selectedTrace.similarTrades.length} comparable past trades retrieved`,
                        ],
                      ].map(([label, value]) => (
                        <div className="trace-step" key={label}>
                          <span className="eyebrow">{label}</span>
                          <p>{value}</p>
                        </div>
                      ))}
                      <details>
                        <summary>Inspect complete evidence JSON</summary>
                        <pre>{JSON.stringify(selectedTrace, null, 2)}</pre>
                      </details>
                    </>
                  ) : (
                    <Empty
                      title="Select a decision"
                      text="Inspect its original evidence, risk result, and execution."
                    />
                  )}
                </div>
              </div>
            </section>
          )}
          {view === 'Trade journal' && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <span className="panel-title">Original thesis. Observed outcome.</span>
                <select
                  aria-label="Journal filter"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                >
                  {['', 'OPEN', 'CLOSED', 'WIN', 'LOSS', 'HIGH_VOLUME', 'BREAKOUT', 'MACRO_'].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s || 'ALL TRADES'}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <TradeTable
                trades={
                  state?.trades.filter(
                    (t) =>
                      !search ||
                      [t.status, t.outcomeQuality, ...t.tags].some((v) => v.includes(search)),
                  ) ?? []
                }
                onClose={(id) => void close(id)}
              />
              {state?.trades.map((t) => (
                <details className="journal-detail" key={t.id}>
                  <summary>
                    {t.asset} · {t.status} · {number(t.rMultiple)}R — inspect thesis & review
                  </summary>
                  <p>{t.agentDecision.reasoningSummary.join(' ')}</p>
                  <p>
                    Invalidation: {number(t.stop)} · MAE: {number(t.mae)}% · MFE: {number(t.mfe)}%
                  </p>
                  <div className="tag-list">
                    {t.tags.map((v, i) => (
                      <span className="badge" key={i}>
                        {v}
                      </span>
                    ))}
                  </div>
                  {t.lessons.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                  <pre>{JSON.stringify(t, null, 2)}</pre>
                </details>
              ))}
            </section>
          )}
          {view === 'Performance' && (
            <>
              <Analytics trades={state?.trades ?? []} />
              <div className="performance-grid">
                {[
                  ['Closed trades', 'totalTrades'],
                  ['Net P&L', 'netPnl'],
                  ['Return %', 'returnPercent'],
                  ['Win rate %', 'winRate'],
                  ['Profit factor', 'profitFactor'],
                  ['Trade-return ratio', 'sharpe'],
                  ['Max drawdown %', 'maxDrawdown'],
                  ['Turnover', 'turnover'],
                  ['Fees', 'fees'],
                  ['Estimated slippage', 'slippage'],
                  ['Average winner', 'averageWinner'],
                  ['Average loser', 'averageLoser'],
                ].map(([l, k]) => (
                  <section className="panel metric-card" key={k}>
                    <small>{l}</small>
                    <h2>
                      {typeof state?.analytics[k] === 'number'
                        ? number(state.analytics[k] as number)
                        : 'INSUFFICIENT DATA'}
                    </h2>
                  </section>
                ))}
              </div>
              <div className="panel full-panel">
                <h2>Agent evaluation</h2>
                <div className="cross-metrics">
                  {['LONG', 'SHORT', 'WAIT', 'REDUCE', 'CLOSE'].map((d) => (
                    <div key={d}>
                      <small>{d}</small>
                      <b>
                        {state?.decisions.filter((v) => v.agent.decision.decision === d).length ??
                          0}
                      </b>
                    </div>
                  ))}
                  <div>
                    <small>RISK REJECTIONS</small>
                    <b>{state?.decisions.filter((v) => v.risk.status === 'REJECT').length ?? 0}</b>
                  </div>
                </div>
                <div className="cross-metrics">
                  {[
                    ['Risk violation attempts', state?.evaluation.riskViolationAttempts],
                    ['Human interventions', state?.evaluation.humanInterventions],
                    ['Consistency', state?.evaluation.decisionConsistency],
                    ['Entry confluence', state?.evaluation.averageConfluenceAtEntry],
                    ['Average realized R', state?.evaluation.averageRealizedR],
                    ['Validation failures', state?.evaluation.validationFailures],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <small>{label}</small>
                      <b>{number(typeof value === 'number' ? value : null)}</b>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Win rate and profit factor require 10 closed trades. The non-annualized
                  trade-return ratio requires 30. Strategy memory requires at least 10 comparable
                  trades.
                </p>
              </div>
            </>
          )}
          {view === 'Connections' && (
            <Connections
              key={asset + pair}
              symbol={asset}
              pair={pair}
              readOnly={mode === 'READ_ONLY'}
            />
          )}
          {view === 'Risk controls' && (
            <section className="panel full-panel risk-settings">
              <h2>Deterministic boundaries</h2>
              <p>
                The LLM cannot change these limits. Lower limits are allowed; the MVP caps risk at
                1% per trade, 3% daily loss, and 3 simultaneous positions.
              </p>
              {state && (
                <>
                  <label>
                    High-impact event policy
                    <select
                      value={state.riskConfig.eventPolicy}
                      onChange={(e) =>
                        void updateRisk({
                          ...state.riskConfig,
                          eventPolicy: e.target.value as RiskConfig['eventPolicy'],
                        })
                      }
                    >
                      <option value="BLOCK">Block new entries</option>
                      <option value="REDUCE">Reduce risk budget by 50%</option>
                      <option value="ALLOW">Allow within standard risk limits</option>
                    </select>
                  </label>
                  {(
                    [
                      ['Risk per trade (%)', 'riskPercent', 0.1, 1, 0.1],
                      ['Daily loss limit (%)', 'dailyLossPercent', 0.5, 3, 0.5],
                      ['Maximum positions', 'maxPositions', 1, 3, 1],
                      ['Maximum spread (%)', 'maxSpreadPercent', 0.01, 0.5, 0.01],
                      ['Minutes before event', 'beforeMinutes', 0, 240, 15],
                      ['Minutes after event', 'afterMinutes', 0, 240, 15],
                    ] as const
                  ).map(([label, key, min, max, step]) => (
                    <label key={key}>
                      {label}
                      <input
                        aria-label={label}
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        defaultValue={state.riskConfig[key]}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= min && n <= max)
                            void updateRisk({ ...state.riskConfig, [key]: n });
                          else e.target.value = String(state.riskConfig[key]);
                        }}
                      />
                    </label>
                  ))}
                  <p className="muted">
                    Live execution is locked. Paper positions use spot instruments, no borrowing,
                    and no leverage. SHORT proposals are recorded and rejected because spot shorting
                    is unsupported.
                  </p>
                </>
              )}
            </section>
          )}
          {view === 'Macro calendar' && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <span className="panel-title">
                  Economic calendar <span className="muted">Asia / Manila</span>
                </span>
                <button className="button secondary" onClick={() => setShowImport(!showImport)}>
                  + Import sourced event
                </button>
                <button className="button primary" disabled={busy} onClick={syncMacroEvents}>
                  <RefreshCw size={14} />
                  Sync official sources
                </button>
              </div>
              <div className="source-status">
                <span className="badge">FED RSS · {state?.macroFeed.status ?? 'UNAVAILABLE'}</span>
                <span>
                  {state?.macroFeed.lastSuccessAt
                    ? `Last sync ${new Date(state.macroFeed.lastSuccessAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT`
                    : 'Sync official monetary-policy announcements.'}
                </span>
                <p>
                  BLS upcoming dates: verified schedule snapshot, 22 Sep 2026. Automated BLS
                  calendar refresh is unavailable (HTTP 403). Release values and consensus forecasts
                  are not supplied by these sources.
                </p>
                {state?.macroFeed.error && <p>{state.macroFeed.error}</p>}
              </div>
              {showImport && (
                <div className="import-form">
                  <p>
                    Paste a sourced event as JSON. Unknown actual, forecast, previous, or timestamp
                    values must be null.
                  </p>
                  <textarea
                    aria-label="Macro event JSON"
                    value={macroText}
                    onChange={(e) => setMacroText(e.target.value)}
                    placeholder={
                      '{"id":"source-event-id","timestamp":null,"eventType":"CPI","title":"US CPI","country":"US","importance":"HIGH","actual":null,"forecast":null,"previous":null,"source":"Source URL","affectedAssets":[],"status":"UPCOMING"}'
                    }
                  />
                  <button className="button primary" onClick={importMacro}>
                    Validate & save event
                  </button>
                </div>
              )}
              {!state?.macro.length ? (
                <Empty
                  title="A calendar built on verified data"
                  text="Sync official Federal Reserve announcements and the verified BLS schedule snapshot, or import a sourced event."
                />
              ) : (
                [
                  ...state.macro.filter(
                    (e) => e.timestamp && Date.parse(e.timestamp) > (ctx?.timestamp ?? 0),
                  ),
                  ...state.macro
                    .filter((e) => !e.timestamp || Date.parse(e.timestamp) <= (ctx?.timestamp ?? 0))
                    .reverse(),
                ].map((e) => (
                  <div className="calendar-row" key={e.id}>
                    <Globe2 size={19} />
                    <div>
                      <b>{e.title}</b>
                      <small>
                        {e.timestamp
                          ? new Date(e.timestamp).toLocaleString('en-PH', {
                              timeZone: 'Asia/Manila',
                            })
                          : 'Time unavailable'}
                      </small>
                    </div>
                    <span className="badge">{e.importance}</span>
                    <span>
                      Actual {number(e.actual)} / Forecast {number(e.forecast)}
                    </span>
                    <span>Surprise {number(e.surprise)}</span>
                    <small>
                      {e.source.startsWith('https://') ? (
                        <a href={e.source} target="_blank" rel="noreferrer">
                          View source ↗
                        </a>
                      ) : (
                        e.source
                      )}
                      <br />
                      {e.status === 'UPCOMING' ? 'Scheduled · release unverified' : e.status}
                    </small>
                  </div>
                ))
              )}
            </section>
          )}
          {view === 'Demo lab' && (
            <section className="panel full-panel demo">
              <span className="badge">HISTORICAL REPLAY · ISOLATED FROM PAPER ACCOUNT</span>
              <h2>Follow the evidence, one candle at a time.</h2>
              <p>
                Replay a captured Bitget market window. Future candles are withheld from analysis.
                No synthetic market prices or prewritten LLM decisions.
              </p>
              <div className="heading-actions">
                <button className="button primary" disabled={busy} onClick={() => replayStep(true)}>
                  <Play size={14} />
                  Load replay
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !replay || replaySession?.done}
                  onClick={() => replayStep()}
                >
                  Next candle <ArrowRight size={14} />
                </button>
              </div>
              {replay && (
                <>
                  <div className="replay-meta">
                    REPLAY · {new Date(replay.timestamp).toISOString()} · {replay.assetA.symbol} /{' '}
                    {replay.assetB.symbol} · candle {replayIndex}
                  </div>
                  <Chart context={replay} overlays={overlays} />
                  <div className="cross-metrics">
                    <div>
                      <small>STRUCTURE</small>
                      <b>{replay.assetA.analysis.regime}</b>
                    </div>
                    <div>
                      <small>CONFLUENCE</small>
                      <b>{replay.assetA.analysis.confluence}/100</b>
                    </div>
                    <div>
                      <small>EVENTS</small>
                      <b>{replay.events.map((e) => e.type).join(', ') || 'None'}</b>
                    </div>
                  </div>
                </>
              )}
              {replaySession && (
                <div className="replay-result">
                  <h2>Replay account ${number(replaySession.balance)}</h2>
                  <p>
                    {replaySession.logs.at(-1)?.decision.decision} ·{' '}
                    {replaySession.logs.at(-1)?.risk.status} ·{' '}
                    {replaySession.logs.at(-1)?.execution}
                  </p>
                  <p>{replaySession.logs.at(-1)?.decision.reasoningSummary.join(' ')}</p>
                  <p>
                    {replaySession.closed.length} closed trades ·{' '}
                    {replaySession.position ? 'Position open' : 'No position'} ·{' '}
                    {replaySession.pending ? 'Entry pending next candle' : 'No pending entry'}
                  </p>
                  <details>
                    <summary>Inspect replay trace</summary>
                    <pre>{JSON.stringify(replaySession.logs.at(-1), null, 2)}</pre>
                  </details>
                </div>
              )}
              <div className="demo-steps">
                {[
                  'Discover the crypto + rToken pair',
                  'Inspect structure, volume, and macro reaction',
                  'Ask the configured LLM for a decision',
                  'Apply deterministic risk boundaries',
                  'Store paper execution and review the journal',
                ].map((s, i) => (
                  <div key={s}>
                    <span>0{i + 1}</span>
                    {s}
                  </div>
                ))}
              </div>
              <p className="muted">
                Replay runs the same LLM and hard risk checks in an isolated account. Approved
                entries fill at the next candle open with estimated 2 bps spread, 5 bps slippage,
                and 10 bps fees. Without an LLM key, each step records WAIT. No replay results enter
                live paper performance.
              </p>
            </section>
          )}
          <footer>
            <span>
              <Activity size={12} /> CrossFlow{' '}
              <span className="muted">24/7 cross-asset intelligence</span>
            </span>
            <span>
              Research & paper trading · Correlation ≠ causation{' '}
              <span className="footer-dot">●</span>
            </span>
          </footer>
        </main>
      </div>
      <aside className="pairs-rail" aria-label="Market pairs watchlist">
        <Watchlist universe={universe} asset={asset} onSelect={setAsset} />
      </aside>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  green = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  green?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className={'stat-value ' + (green ? 'lime' : '')}>{value}</div>
      <small>
        {green && <ArrowUpRight size={12} />} {detail}
      </small>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Layers3 size={25} />
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
function TradeTable({ trades, onClose }: { trades: Trade[]; onClose: (id: string) => void }) {
  return trades.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {['Asset / pair', 'Side', 'Entry', 'Quantity', 'Stop', 'P&L', 'Status', ''].map(
              (v, i) => (
                <th key={i}>{v}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td>
                <b>{t.asset}</b>
                <small>{t.pairedAsset}</small>
              </td>
              <td className="lime">{t.direction}</td>
              <td>{number(t.entry)}</td>
              <td>{number(t.quantity, 5)}</td>
              <td>{number(t.stop)}</td>
              <td>
                {number(
                  t.status === 'OPEN'
                    ? (t.mark - t.entry) * t.quantity
                    : t.realizedPnL - t.entryFee,
                )}
              </td>
              <td>{t.status}</td>
              <td>
                {t.status === 'OPEN' && (
                  <button className="button secondary" onClick={() => onClose(t.id)}>
                    Close
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="positions-empty">
      <ShieldCheck size={18} />
      <span>No positions. Waiting is a decision, too.</span>
      <span className="muted">Capital preserved.</span>
    </div>
  );
}
