# Validation record

Date: 2026-09-22. Local Node.js 24.18.0.

## Automated checks

- 22 tests pass across engine, risk, auth, replay, agent failure, and persistent portfolio behavior.
- Strict TypeScript check passes.
- ESLint passes.
- Production Next.js webpack build passes. Turbopack CSS worker port binding is blocked in this environment; the build script uses webpack.

Tests deliberately use labeled deterministic fixtures where exact values are needed. They do not create successful market-performance claims. SQLite portfolio tests use isolated temporary databases.

## Integration checks

- Real Bitget v3 instruments endpoint succeeded; discovered BTC, ETH and RNVDA/RAAPL/RTSLA/RMSFT.
- Live `/api/market` returned VALID BTC and RNVDA contexts with 299 closed hourly candles each.
- Browser rendered candlesticks, normalized comparison, and calculated confluence/correlation.
- Browser Run agent persisted an explicit AGENT_UNCONFIGURED WAIT with original context and NO_ORDER.
- Replay excludes unfinished candles at capture time and never exposes future candles to a step.

## Limitations of this validation

No LLM key or exchange account was configured. Real provider structured output, actual trade profitability, exchange Demo orders, live orders, and broad macro/consensus ingestion were not tested. Paper fill arithmetic is verified through isolated fixture tests. There is no meaningful Sharpe/win-rate sample yet.

- Official Federal Reserve RSS synchronization returned VALID and persisted 15 events. Feed parsing is tested for source host, actual timestamp, unknown numeric values, future publication rejection, and forbidden XML entities.
- Pre/post-event classification and compression detection have fixture tests.

- An isolated end-to-end fixture test exercises fetched market data → structured LONG → hard risk approval → SQLite paper fill, followed by malformed-provider WAIT and server-enforced read-only rejection. Fixture trades are never added to the user’s paper account.
- Partial reductions are tested for quantity precision and below-minimum residual positions.

- Private integration tests verify exact HMAC bytes, environment routing, missing/malformed balances, price/size checks, explicit confirmation, concurrent duplicate requests, durable unknown outcomes and reconciliation. These use fake keys and temporary databases.
- Browser Connections screen shows missing credentials and disabled exchange controls. LLM connection testing reports a missing key without placing an order.

- Hackathon Qwen integration uses the documented gateway and qwen3.8-max through Responses. Fixture tests verify payload format, final output extraction, incomplete/refusal rejection and no provider fallback. Authentication remains unverified until LLM_API_KEY is filled locally.

## 2026-09-24 connection update

A small authenticated request to the hackathon Qwen gateway returned the requested JSON successfully. No market or account data was sent in this connection test. Bitget remains unconnected because its three Demo credentials are absent. The local configuration now enables Demo submissions independently while leaving real-money submission disabled.

The subsequent authenticated Bitget Demo account check succeeded but returned no assets and blank equity/exposure summaries. These are now represented as unavailable (null), not zero. Regression coverage checks that missing summaries block new buy previews while valid credentials can still be tested. No exchange order was placed.

2026-09-24: Exchange portfolio read verified against Bitget DEMO: account totals and spot open/history/fills endpoints loaded successfully. The API returned an empty fills list as `null`; normalization now handles that explicitly. Dashboard verified in the browser with demo account values and an empty trade-fill history. Unit suite: 26 passing tests, including partial exchange failures, missing-versus-zero values, and distinct Qwen timeout/network errors. Production build and lint passed. Qwen minimal authenticated JSON test passed; a full analysis exceeded 120 seconds before further prompt compaction.
The subsequent compact full-analysis request also reached the 120-second deadline (`LLM_TIMEOUT`), while the minimal Qwen request succeeded. Full-analysis latency remains unresolved at the gateway/model boundary; authentication succeeds, but an analysis response was not verified in this check. Both analysis checks used READ_ONLY and submitted no orders.

4 October follow-up: 28 tests, lint and production build passed. Added regression coverage for delayed-inference execution revalidation, pause rejection, missing-day performance gating and stale-mark exclusion. A real Qwen PAPER request initially failed numeric-claim validation; the validator now checks all supplied evidence (including risk state/memory), and the prompt explicitly requests qualitative narrative. A subsequent real Qwen request returned a valid WAIT. No actual model-generated trade was forced or claimed. The isolated fixture exercised an approved automatic local paper fill and rejection paths. The paused worker started and exposed its heartbeat; it was stopped after verification. Observed equity tracking starts prospectively, not backfilled.
