# Development notes

The repository began empty. The implementation followed working vertical slices: live Bitget data and terminal, deterministic evidence, persisted decision/risk/paper loop, macro controls and memory, replay and evaluation. Native SQLite avoids an additional database service and ORM while preserving relational foreign keys and atomic execution/log writes.

## Main files

- `lib/bitget.ts`: documented UTA v3, normalized and validated data.
- `lib/analysis.ts`: technical, cross-asset, event and macro reaction engines.
- `lib/agent.ts`: model proposal and fail-closed validation.
- `lib/risk.ts`, `lib/config.ts`: deterministic risk and bounded settings.
- `lib/service.ts`: synchronized decision cycle with SQLite run lease.
- `lib/portfolio.ts`: paper execution, cashflows, journal, review, memory, analytics.
- `lib/replay.ts`: isolated historical clock and next-bar simulated fills.
- `lib/reflection.ts`: optional model review of closed-trade evidence.
- `components/terminal.tsx`: terminal views and controls.

## Operation

SQLite files persist locally across restart. Back up the database with SQLite's backup API or while the application and worker are stopped; WAL mode uses companion files. Never publish a local journal by committing data files. Replay captures contain only public OHLCV.

The local worker does not provide managed hosting, restart supervision, or execution during device sleep. Run continuously only after configuring the provider and checking paper behavior. The web process alone polls charts but does not autonomously trade.

## Priorities for subsequent validation

1. Configure an LLM and collect both successful and failed paper decisions; inspect contradictions and reflection hallucinations.
2. Extend the working Federal Reserve RSS and macro revision store with an automatically refreshable economic calendar and sourced consensus values. The initial BLS snapshot must be reverified when schedules change.
3. Run longer out-of-sample paper/replay periods; collect 20+ comparable trades before evaluating patterns.
4. Adopt official Agent Hub Demo execution behind the existing risk boundary after account authorization.
5. Add finer-grained execution observations before using MAE/MFE to judge stop quality.
