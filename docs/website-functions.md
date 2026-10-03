# CrossFlow — complete website function guide

CrossFlow is a local agentic paper-trading application for tokenized US stocks and crypto. Qwen selects actions; deterministic rules control whether and how those actions become simulated orders. Approved paper trades execute automatically without per-trade confirmation. The Bitget exchange connection is a separate, manually confirmed execution path.

## Navigation and market workspace

- **Overview:** selected-asset candlestick chart, technical analysis, cross-asset comparison, macro context, latest selected-pair decision, paper positions and Bitget account summary.
- **Watchlist:** Bitget-listed online Reality stock/ETF pairs plus BTC and ETH, discovered from the instrument API. Search, pagination and selection; bulk quotes refresh every 30 seconds. Stale/missing quotes show a dash. The list appears on the right on desktop and below the workspace on narrow screens.
- **Charts:** 5m, 15m, 1H, 4H and 1D; closed candles; support/resistance, trendline and estimated volume-profile overlays. Indicators include confirmed pivots, market regime, relative volume and confluence.
- **Cross-asset context:** aligned-return correlations over 20/50/100 samples, normalized prices and observational lead/lag. These are evidence, not predictions or proof of causation.

## Agent operations

1. Start the app: `npm run dev`.
2. In another terminal, start `npm run worker`.
3. Open **Agent operations**, enter up to eight Bitget USDT symbols, choose a cycle interval of 60–3600 seconds and select **Enable / save paper agent**.
4. Keep global operating mode set to **Paper trading** for automatic simulated execution. **Read only** prevents execution.
5. Use **Pause paper agent** to stop subsequent worker decisions and block pending worker proposals from opening/closing trades. Already processed protective paper stops are not undone. Ctrl+C stops the worker after current work unwinds.

Default configured assets are RNVDAUSDT and BTCUSDT, initially paused. Saved settings persist across restarts. The worker evaluates assets sequentially with shared capital and risk limits, and includes already-open positions in its monitoring set. Each prompt includes current open positions. This permits holdings in stock and crypto assets; it is not an atomic hedge or portfolio weight optimizer. The comparison asset supplies context and does not automatically receive an order.

The worker status shows whether its heartbeat is recent, its phase and last cycle. Browser refresh alone never starts autonomous analysis. A terminal worker is required; keeping a laptop awake is not equivalent to an always-on deployment. Qwen usage can incur provider charges. The interval starts after a cycle completes, not at a guaranteed wall-clock frequency.

## Decision and execution sequence

1. Fetch public Bitget market evidence and source-attributed macro context.
2. Calculate technical/cross-asset evidence and additional timeframes.
3. Check existing paper positions for observed stop/target conditions.
4. Retrieve relevant closed-trade memory and shared portfolio state.
5. Ask Qwen for LONG, SHORT, WAIT, REDUCE or CLOSE with structured rationale and levels.
6. Validate the model response. Missing credentials, malformed responses and provider failures produce no order.
7. For actionable proposals, reacquire market/macro/multiple-timeframe evidence. If closed-bar or macro evidence changed, reject the old proposal and wait for a new decision. Quotes may move only within the proposed entry geometry and risk constraints.
8. Recheck operating mode, pause state, freshness, instrument constraints, spread, structural stop, position/risk budgets and macro windows.
9. Execute an approved paper LONG or reduction/close automatically; persist the original evidence, execution evidence, revalidation result, decision, risk outcome and simulated fill.
10. Record equity observations. Review at most one unreviewed closed trade with Qwen per cycle.

Spot SHORT proposals are rejected. WAIT is an ordinary decision, never converted into a trade to fill the history. A lock with heartbeat prevents overlapping decision cycles.

## Risk controls

Configurable maximum risk per trade (up to 1%), daily loss budget (up to 3%), open-position cap (up to 3), spread tolerance, and macro-event policy/window. These limits cannot be overridden by model confidence. Mode changes are checked again at execution. New evidence or stale prices cannot silently pass through an old approval.

Paper fills estimate fees at 10 bps and slippage at 5 bps per side. Stops and targets are evaluated only when the application runs a relevant cycle; gaps and outages reduce observation coverage. When a completed bar touches both, the simulator chooses the stop first. The simulator closes the remaining position at the first target. It does not reproduce an exchange order book or guarantee attainable fills.

## Decisions, journal and performance

- **Decision history:** persisted action, rationale, context, risk decision and execution trace; failures and WAIT decisions are retained.
- **Trade journal:** paper entries, reductions, exits, thesis, fees, slippage, excursion observations and optional model reflections. Manual paper close is recorded as human intervention.
- **Performance:** existing trade statistics and realized-equity visualizations. The legacy trade-return ratio is not annualized daily Sharpe.
- **Agent operations metrics:** timestamped equity observations including open-position marks, sampled mark-to-market drawdown, annualized daily Sharpe/Sortino and observed return versus a zero-return cash reference. Ratios require at least 30 observed daily returns without missing dates. Stale portfolio observations are excluded. The cash reference is not a fixed-rule trading-agent benchmark.
- No historical equity series is invented or backfilled. Ratios remain unavailable until adequate observations accumulate. Sampled drawdown can miss intraday extremes.

## Bitget exchange functions

- Server-only `.env` credentials and distinct demo/live gates.
- Account equity, exchange-reported unrealized P&L, available USDT and open spot orders refresh every 30 seconds.
- **Exchange trades:** current spot orders, account holdings, order history and fills; 30-day history with cursor pagination and explicit unavailable/empty states.
- **Connections:** authenticated connection check, small capped order preview, exact per-order confirmation, audit and reconciliation. No automatic retries of ambiguous order submissions.
- The autonomous worker never invokes Bitget order submission. Local paper history and Bitget demo history are separate. Real-money execution remains gated and manually confirmed.

## Macro calendar and memory

Official Federal Reserve RSS plus dated BLS schedule snapshots and manual source-attributed event import. Unknown actual/forecast/previous values remain null. The system retains revisions and computes surprise/reaction observations where evidence exists. It does not provide complete live news, earnings or consensus coverage.

Closed-trade retrieval uses context similarity, not profit ranking. Aggregate strategy observations require sufficient comparable samples. Reflections are labeled model interpretation; the agent does not rewrite strategy code or relax risk settings from its own reflections.

## Demo and submission tools

- **Demo lab:** captured public-market replay, isolated from the live paper ledger; no lookahead into unobserved bars. Replay assumptions remain explicit.
- `npm run demo:flow`: isolated synthetic market/model fixture through the real risk and paper execution engine. Demonstrates automatic fill, malformed-model WAIT and read-only rejection. Does not consume API credits or place exchange orders.
- `npm run export:evidence`: exports authentic local paper records and current metrics with original timestamps; no `.env` secrets or private Bitget account balances.
- **Download evidence JSON** in Agent operations offers the same observed-log export.
- `npm run package:submission`: generates a portable HTML evidence viewer and supporting JSON/docs in `artifacts/submission`. The fixture is labeled synthetic and never merged with observed performance.

## Deployment and competition limits

The full app uses Node.js and persistent writable SQLite storage. Use a persistent Node host with a supervised worker, durable volume, and authentication in front of the app. The current interactive mutation policy accepts same-origin localhost or a server bearer token; public frontend authentication and hosting are not preconfigured. Do not put server credentials or bearer secrets into client bundles.

The portable evidence viewer has no keys, backend or trading controls and can be served by a static host after review. Hosting it is not the same as deploying the autonomous backend. A public URL, actual promotional post and organizer acceptance require the owner's destination/account and timely submission. October evidence must not be represented as September competition logs.
