# CrossFlow — Agentic Trading readiness review

Reviewed 4 October 2026 against the [official S2 handbook, Chapter IV](https://bitget-ai.gitbook.io/bitgetai_hackathons2#iv.-tracks-submission-and-judging).

## Verdict

The architecture fits Agentic Trading through autonomous **local paper execution**, but the available evidence does not establish a complete, submission-ready entry. Organizer acceptance cannot be guaranteed. Manual exchange ticket confirmation does not prevent the paper path from demonstrating autonomy.

The handbook accepts simulated execution and asks for a runnable demo, event-to-execution demonstration, competition-period paper logs and a compliant promotional post. Two weeks of logs is recommended. Its published submission deadline is September 27, 2026; this review is after that deadline. Whether an already submitted entry may update materials must be confirmed with the organizer.

## Verified implementation

| Capability | Evidence and limits |
|---|---|
| Sensing | `lib/bitget.ts`, `lib/analysis.ts`, `lib/macro/`: actual market feeds, calculated structure/volume/correlation, sourced macro context. Macro calendar includes a dated snapshot, not a fully live consensus feed. |
| LLM judgment | `lib/agent.ts`: Qwen proposes actions and levels; technical confluence does not select trades. Invalid output fails closed. |
| Autonomous execution | `lib/service.ts`: approved LONG proposals execute through PaperOrderExecutor without per-order approval. CLOSE/REDUCE operate on existing paper positions. Bitget exchange tickets remain a separate manual path. |
| Risk controls | `lib/risk.ts`: position sizing, loss and position limits, spread, data freshness, structural stops, macro windows, instrument constraints. |
| Recurring operation | `scripts/worker.ts`: explicit foreground worker, repeated cycles, monitoring of open paper positions. No installed always-on service; UI polling does not run the agent. Default watched pair is ETH/BTC, so set WORKER_ASSET to an rToken for a stock-centered demonstration. |
| Audit | SQLite stores decisions, market snapshots, events, execution results and journals. |
| Validation | 26 tests passed; ESLint and production build including TypeScript passed on review date. Fixture pipeline proves execution plumbing with mocked market/model responses, not real Qwen trading performance. |

## Observed local evidence

Read-only inspection of `data/crossflow.sqlite` found:

- 10 decisions, all within the competition window, spanning three UTC calendar dates: September 22–24.
- 6 PAPER decisions and 4 READ_ONLY decisions.
- 2 valid `qwen3.8-max` responses: one READ_ONLY and one PAPER; both WAIT.
- 6 provider failures and 2 pre-configuration decisions.
- 0 executed decisions and 0 paper trades.

The latest stored Qwen response succeeded on September 24. It is therefore inaccurate to say the integration never works. Historical timeouts remain a reliability concern; no new provider request was made during this audit. These 10 records do not demonstrate continuous operation. Current profitability, win rate, Sharpe and drawdown performance cannot be established from executed trades.

## Material gaps

1. **Execution evidence:** A real model-generated trade has not been recorded in this ledger. Preserve legitimate WAIT decisions; do not force a LONG or relabel fixture/replay output as observed trading. Provide a separately labeled fixture demonstration if used to explain the full execution path.
2. **Freshness after slow inference:** The model may take up to 120 seconds, but risk checks reject market snapshots older than 60 seconds. A valid delayed proposal can therefore be rejected. A future fix should reacquire and revalidate current market evidence before execution, without relaxing freshness or blindly executing an old proposal.
3. **Sub-theme claim:** Cross-asset analysis is implemented, but the agent chooses one traded asset per decision. The comparison asset is contextual; no joint rToken/crypto allocation or hedge planner exists. Open Theme is a more defensible current label than claiming demonstrated simultaneous cross-asset portfolio execution. Event-Driven Agent is another potential fit if an actual macro-event-to-execution case is evidenced.
4. **Metrics:** Current analytics labels its Sharpe field as a non-annualized trade-return ratio, and drawdown uses closed-trade equity. Do not present these as annualized daily-return Sharpe or full marked-to-market portfolio drawdown. Sortino and a fixed-rule comparison are not implemented.
5. **Accessible evidence package:** Local docs contain no verified public demo, published repository, video or promotional-post link. These may exist elsewhere, but were not supplied or verified. Exported competition logs and an accessible demo are needed for review; localhost alone is not an accessible judge URL.
6. **Submission timing:** New October runs cannot establish September competition-period activity. Preserve original timestamps. Confirm whether a timely entry already exists and whether updates are accepted.

## Demonstration sequence

Show the selected tokenized stock and crypto reference; identify a timestamped event and market evidence; inspect the actual Qwen output; show the deterministic risk outcome and automatic paper execution when approved; then show the stored trace and paper ledger. Distinguish local paper fills from Bitget demo exchange orders throughout. Display an unsuccessful or WAIT decision honestly alongside successful execution evidence if available.

No trading mode, credentials, risk limits or existing trading records were changed by this review. No worker was started and no order was submitted.

## Implementation follow-up — 4 October 2026

The original review above is retained as an audit of the earlier build. The follow-up adds fresh pre-execution revalidation (including additional timeframes), a renewable decision lock, stock/crypto paper-worker configuration and heartbeat status, pending-order pause checks, marked-equity observations, coverage-gated daily Sharpe/Sortino, observed-log export and a separate synthetic execution demonstration. See `docs/website-functions.md` for the current behavior and limitations.

The synthetic demonstration uses an isolated temporary database and proves software flow only. It does not fill missing September trading history. Public hosting, a compliant owner-authored promotional post and organizer acceptance remain external requirements. The configurable multi-asset worker is sequential, not an atomic cross-market hedge optimizer. The old realized-trade analytics remain labeled separately from the new observed-equity metrics.
