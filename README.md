# CrossFlow

**24/7 cross-asset evidence → independent agent decisions → bounded paper execution.**

CrossFlow is a Bitget AI Hackathon S2 MVP for **Agentic Trading / Cross-Asset Execution Agent**. It is built for active retail crypto and tokenized-stock traders outside US time zones, including the Philippines. A local worker can monitor markets while the trader is away.

The hypothesis is that cross-market information can improve decisions when combined with actual technical confirmation. Correlation is supporting evidence, never causation or a promise that a lagging asset will catch up.

## Run in two minutes

Requires **Node.js 24+** (native SQLite), npm, and internet access to Bitget.

```sh
npm install
cp -n .env.example .env
npm run dev
```

Open [CrossFlow](http://127.0.0.1:3000) or [Demo lab](http://127.0.0.1:3000/demo).

No exchange credentials are needed for public data or the local paper simulator. Add `LLM_API_KEY`, `LLM_MODEL`, and, if needed, `LLM_BASE_URL` to `.env` to enable the configured hackathon Qwen Responses integration (or a compatible Chat Completions provider). Restart after changing environment variables. With no key, **Run agent records an explicit WAIT**, not a simulated LLM decision.

For continuous paper monitoring in a second terminal:

```sh
npm run worker
```

The worker must remain running, with the computer awake and connected. It is not an installed background service. Stop with Ctrl+C. The web UI polls data every 30 seconds; it does not secretly start the agent worker or incur LLM charges. Configure up to eight assets in **Agent operations**, then enable the paper agent. Defaults are RNVDAUSDT and BTCUSDT. The worker starts paused; saved settings determine subsequent runs. Each asset is evaluated sequentially against the shared portfolio. Each worker cycle can call the configured model and incur provider costs.

## Connect your accounts

The local `.env` is prepared with defaults. Fill the four empty credential fields: `BITGET_API_KEY`, `BITGET_API_SECRET`, `BITGET_PASSPHRASE`, and `LLM_API_KEY`. Run `npm run check:setup` to list missing fields without showing their values. No additional database, service account, or localhost auth token is required. Live submission remains explicitly gated.


Open **Connections** for the Bitget account check, confirmed exchange order ticket, order reconciliation and LLM connection test. Follow the [Bitget guide](docs/setup-bitget.md) and [LLM guide](docs/setup-llm.md). Credentials stay in `.env`; no key is needed to keep using the paper simulator.

## Judge walkthrough

1. Overview discovers actual instruments from Bitget. Select `RNVDAUSDT` and `BTCUSDT`; unavailable instruments are never invented.
2. Inspect closed candles, pivot structure, zones, trendlines, estimated volume profile, relative volume, and normalized performance.
3. Macro calendar synchronizes official Federal Reserve monetary-policy RSS and loads a clearly labeled BLS schedule snapshot verified on 22 Sep 2026. It also imports source-attributed events. Unknown values remain null. The default risk window blocks entries 60 minutes before and 30 minutes after a high-impact event.
4. Run agent. The server supplies calculated evidence, 4H/1H/15m context where available, comparable trades, strategy aggregates, and account risk state.
5. Decision history shows **event → perception → LLM → deterministic risk → execution → memory**. Every WAIT and validation failure is retained.
6. Approved LONG proposals open a local paper position with fees and slippage. CLOSE/REDUCE may reduce existing positions. SPOT SHORT proposals are rejected because this MVP does not borrow stock or crypto.
7. Trade journal keeps the original thesis and context, stop, targets, fees, realized result, observed MAE/MFE, and review. Performance suppresses statistical metrics with insufficient samples.
8. Demo lab steps captured historical Bitget BTC/rNVDA candles through the same LLM and risk checks. Replay accounts and logs are isolated from paper performance. Approved entries fill at the **next** candle open with explicitly estimated costs.

## Architecture

```text
Bitget public REST v3 + Federal Reserve RSS + sourced macro events
  → validated normalized closed OHLCV
  → pivots / structure / zones / trendlines / volume
  → timestamp-aligned returns / correlation / divergence / lag
  → similar-trade retrieval + strategy aggregates
  → LLM decides LONG / SHORT / WAIT / REDUCE / CLOSE
  → hard risk checks
  → local paper execution
  → SQLite decision trace + journal
  → evidence review / optional LLM reflection
  → future memory retrieval
```

Next.js 16 App Router, TypeScript, React, Tailwind CSS 4, Lightweight Charts, Zod, and native SQLite. SQLite is used directly rather than adding an ORM for this local MVP. Tables include Trade, TradeDecision, TradeEvent, TradeJournal, MacroEvent, MarketSnapshot, StrategyMemory, Cashflow, Settings, and RunLock.

## Hard boundaries

- Paper account begins at 10,000 USDT. Default risk 1%, daily loss 3%, maximum 3 positions; configurable limits cannot exceed these caps.
- Position size includes modeled entry/exit fees and stop slippage, rounds quantity down, checks available cash and minimum notional, and requires structural invalidation.
- Critical data must be VALID, with a ticker age under 60 seconds. Missing bid/ask and wide spreads block entry. Incomplete candles are excluded.
- Macro policy may BLOCK, REDUCE risk by half, or ALLOW within ordinary limits. Memory cannot change these settings.
- Exchange orders use the separate **Connections** ticket: authenticated account reads, expiring previews, explicit confirmation, spending caps and reconciliation. Disabled by default. Agent execution remains paper-only. See [Bitget setup](docs/setup-bitget.md) and [LLM setup](docs/setup-llm.md).
- Local mutation routes require a matching localhost Origin/Host. Remote mutations require `APP_AUTH_TOKEN`. This is a single-user local application, not a public multi-user deployment. Keep it bound to loopback.
- LLM output is strictly schema validated, asset checked, and numeric assertions screened. This is not proof that natural-language reasoning is correct; hard execution checks remain authoritative.

## Data and execution honesty

Public requests were verified against Bitget on **2026-09-22**. Live availability may change. rToken identifiers are discovered through `isReality`, not assumed from sample names. Missing volume is null. Volume profile uses an **OHLCV range-allocation estimate**, not trade-at-price data. Correlations use returns over contiguous aligned timestamps. Lead/lag requires at least 50 return observations.

Paper fees are estimated at **10 bps per side**, slippage **5 bps per side**, and fills use current executable quotes. Replay additionally estimates a **2 bps spread**, uses captured instrument specifications, and has conservative stop-first ordering if both stop and target occur within one candle. Fees and spreads are not asserted to be the user's actual Bitget rates. Stop gaps can exceed modeled risk.

Paper position management runs during agent cycles; a stopped worker cannot continuously observe stops. MAE/MFE are limited to observed prices and completed post-entry candles, not tick-perfect paths. The simulator closes the full remainder at TP1; additional targets are retained as thesis evidence. Replay has no historical macro feed or original historical spread/specification archive. Replay loss budgeting conservatively includes all session losses, rather than resetting each historical day.

## Official Bitget ecosystem evaluation

Current documentation was inspected before implementation. Old `/api-doc` links now redirect; the app uses documented **UTA v3** public market endpoints:

- [Market data: instruments, tickers, candles](https://www.bitget.com/docs/catalog/market/market-data)
- [Reality/rToken guide](https://www.bitget.com/docs/uta/reality-trading-guide)
- [Agent Hub](https://www.bitget.com/docs/uta/agent-hub)
- [Official Agent Hub repository](https://github.com/Bitget-AI/agent_hub)
- [Official bitget-signal](https://github.com/Bitget-AI/bitget-signal)

Agent Hub provides SDK/CLI/MCP operations and Demo-Key paper routing; Agentic Account provides isolated OAuth-authorized funds. Those are evaluated integration paths, **not connected accounts in this build**. The local simulator deliberately requires no exchange account. Direct documented public REST is sufficient for this vertical slice. `bitget-signal` and the stock MCP can supply further context, but their remote providers are not yet integrated; Federal Reserve RSS and explicit source imports provide initial macro coverage. Do not replace the working REST/data normalization layer merely to add a tool logo.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tests cover pivots, structure, zone clustering, trendlines, profile/value area, missing volume, returns, correlation/lag sample handling, macro reaction windows, position sizing, stale data, event risk, malformed/timed-out LLMs, auth boundaries, replay look-ahead, paper fees, persistence, duplicate close, and memory cutoff.

See [submission](docs/submission.md), [LLM role](docs/llm-role.md), [validation](docs/validation.md), and [development notes](docs/development.md). No profitability claim is made: there is not yet a statistically meaningful paper-trading record.

## Remaining integrations

- Automatic refresh of the BLS schedule (the official ICS endpoint returned HTTP 403), broader macro/consensus sources, and signal/MCP connectivity. Federal Reserve RSS ingestion and macro revision history are implemented.
- Credentialed acceptance testing of the implemented Demo/live spot ticket, Agentic Account OAuth, and supervised autonomous live position management. No account credentials or real-money order were used during development.
- WebSocket transport (UI truthfully says REST polling), deployment supervision, tick-accurate excursion tracking, short/margin simulation, and baseline comparison.
- Broader historical testing and evidence-grounded validation of LLM reflection quality. Reflection is labeled an interpretation, not a verified causal explanation.

Research / educational Hackathon project. Not financial advice. Historical relationships do not guarantee future relationships.

## Macro source coverage

Use **Macro calendar → Sync official sources**. The [Federal Reserve monetary-policy feed](https://www.federalreserve.gov/feeds/feeds.htm) supplies actual publication timestamps and source links; numerical release and consensus values remain null. The local worker refreshes it at most hourly. The BLS upcoming schedule is a versioned, explicitly labeled snapshot from the [official 2026 release schedule](https://www.bls.gov/schedule/2026/), verified on 22 Sep 2026. It is not an automatically refreshed feed; verify schedule revisions before relying on it. The app retains previous macro versions when imported events change. Pre-event compression, liquidity sweeps, and post-event phase are calculated observations without a hardcoded bullish/bearish interpretation.

## Agent operations and submission package

Open **Agent operations** to configure up to eight paper assets, enable/pause the worker, inspect heartbeat status and download observed evidence. Start `npm run worker` in a separate terminal; enabling the saved configuration alone does not start a process. Paper orders are automatic after risk checks; Bitget exchange tickets still require manual confirmation.

Run `npm run package:submission` for a portable evidence viewer plus separate observed and synthetic JSON logs. The fixture uses a temporary database and never becomes claimed market performance. Read [the complete function guide](docs/website-functions.md) for every screen, metrics methodology and deployment requirements. Generated private paper-history exports are ignored by git; review before publishing.
