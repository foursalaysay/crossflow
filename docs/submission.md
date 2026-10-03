# CrossFlow — Agentic Trading submission draft

Track: **Agentic Trading**. Proposed sub-theme: **Open Theme**, for an auditable cross-asset-informed paper trading agent. This is a draft description, not proof of submission or organizer acceptance.

## Thesis

CrossFlow lets Qwen interpret tokenized-stock, crypto and macro evidence, choose an independent trading action, and automatically execute approved local paper trades. Its hypothesis is that contextual cross-market reasoning can be evaluated transparently when model judgments, deterministic risk decisions and execution outcomes are stored separately. Correlation and confluence are evidence, not guaranteed alpha.

## Target user and value

Active retail crypto/tokenized-stock traders outside US market time zones, initially Philippines-based users who need explainable monitoring while away. The intended user prefers a capped paper portfolio before committing capital. The value is an inspectable event → reasoning → risk → execution trail, including WAIT, failure and rejection outcomes.

## Validation

Observed evidence is exported from the local ledger with original timestamps. Before the October follow-up, it contained 10 September 22–24 decisions, two valid Qwen WAIT responses and no executed paper trades. Use the attached current `paper-evidence.json` for up-to-date counts. October checks are explicitly post-competition evidence.

A separate `fixture-flow.json` demonstrates automatic paper entry, malformed-model rejection and read-only protection with mocked market/model responses. It is not observed agent performance. No profitability is claimed. Historical gaps are not backfilled.

Fees/slippage are simulator assumptions (10/5 bps per side). New equity measurements include open-position marks; stale marks are excluded. Daily Sharpe/Sortino require at least 30 valid daily return observations with no missing dates. Drawdown is sampled rather than tick-complete. Until sufficient data exists, metrics remain unavailable. A zero-return cash reference is included; no fixed-rule trading-agent superiority is claimed.

Validation plan: maintain timestamped prospective paper runs, record coverage and provider failures, report costs and observed equity returns, and recruit an initial pilot cohort of retail users. Cohort size, retention, AUM and trading volume are not yet observed claims.

## Progress and architecture

Built: Next.js application; Bitget public-market discovery and quotes; Qwen Responses adapter; technical/macro/cross-asset context; strict output validation; independent risk layer; fresh evidence revalidation; automatic paper entry/reduction/close; configurable multi-asset worker with pause and heartbeat; decision/journal storage; sampled equity analytics; replay; authenticated Bitget account/history reads; manually confirmed demo/live ticket path; evidence export and portable fixture viewer.

The paper worker considers a shared portfolio and evaluates up to eight assets sequentially. It is not an atomic hedge planner. Real-money autonomous execution is not enabled. Broad live earnings/news/consensus coverage and production hosting/authentication remain outside the local deployment.

## Deliverables

- Source archive and setup instructions.
- Portable HTML evidence viewer (`index.html`).
- Original observed paper logs (`paper-evidence.json`).
- Clearly labeled synthetic engine demonstration (`fixture-flow.json`).
- Full feature guide, readiness review and LLM role description.
- Public demo URL: not yet supplied/published.
- Promotional X post: owner link required; not posted by the application.

The handbook lists September 27, 2026 as the submission deadline. Confirm that a timely entry exists and that updated materials are accepted. A fresh October package does not establish timely submission.

## LLM role

Qwen proposes actions and structural levels from supplied evidence. It can select WAIT and disagree with technical confluence. It does not control sizing limits, credentials or execution gates. Closed-trade reflections are labeled model interpretations. Provider or validation failure never invokes a deterministic fallback trade.
