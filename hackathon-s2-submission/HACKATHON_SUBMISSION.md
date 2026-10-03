# CrossFlow — Hackathon S2 Submission

**Track:** Agentic Trading

## Problem
Traders need explainable automation that can evaluate changing market context while preserving strict control over execution risk.

## Final solution
CrossFlow uses Qwen to analyze market, macro, cross-asset, and portfolio evidence. It returns LONG, REDUCE, CLOSE, or WAIT. A deterministic execution layer independently validates the proposal, resolves the trusted server execution target, and executes approved Paper trades automatically.

## How Qwen is used
Qwen produces structured decisions and rationale. It never receives exchange credentials, enables autonomy, selects Paper/Demo/Live, or submits orders directly.

## Autonomous execution
The flow is Market Data / Portfolio State → Qwen Decision → Deterministic Risk Validation → Trusted Execution Target → Final Validation → Execution → Reconciliation → Audit Trace. Paper is the demonstrated submission environment.

## Controls and fail-closed behavior
CrossFlow checks position sizing, exposure, daily loss, open positions, market freshness, portfolio and position state, autonomy, trading status, environment match, connectivity, and reconciliation. Failed checks produce WAIT or REJECT and no order.

## Evidence
See crossflow_paper_trading_log.csv, crossflow_paper_trading_log.json, and crossflow_decision_log.json. The exports contain only actual local ledger records. The current export contains 0 executed paper trades and 14 decisions (2026-09-22T04:16:05.030Z → 2026-10-03T18:12:43.261Z). No synthetic trade is included.

## Demo
Follow crossflow_demo_recording_guide.md. The reviewer can run the app in Paper mode and inspect the journal and audit trace.

## Source verification
- Qwen adapter and schema: lib/agent.ts
- Decision/risk/execution orchestration: lib/service.ts
- Deterministic risk layer: lib/risk.ts
- Paper portfolio and fills: lib/portfolio.ts
- Trusted target and worker: lib/autonomy.ts, lib/bitget-private.ts
- Bitget preview, autonomous execute, confirmation, and reconciliation: lib/live.ts, app/api/exchange/route.ts
- Evidence export: lib/evidence.ts

## Reproduce locally
1. Copy .env.example to .env; keep CROSSFLOW_EXECUTION_TARGET=PAPER, ENABLE_LIVE_AUTONOMY=false, and ENABLE_DEMO_AUTONOMY=false.
2. Run npm install, then npm run dev.
3. Configure the Qwen key in the server-only LLM_API_KEY variable.
4. Select Paper mode and use Run agent, or run npm run worker after enabling the Paper agent in Agent operations.
5. Export evidence with npm run export:evidence; this writes the observed JSON under artifacts/submission.

## Backtest status
No backtest results, return curves, win-rate claims, or profitability claims are submitted. The repository does not contain a real backtesting engine for this package.

## Limitations
This package reports local Paper evidence, not live performance. Actual Bitget fills and positions remain exchange-authoritative. A WAIT-only or zero-trade period is reported as-is.
