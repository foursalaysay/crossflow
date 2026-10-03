# LLM role

## Actual integration

`lib/agent.ts` calls a server-side, configurable chat-completions endpoint. Default model setting is `gpt-4.1-mini`; `LLM_MODEL` and `LLM_BASE_URL` can select another compatible provider. No provider was configured during local validation, so no real model output or model performance is claimed. Tests inject malformed responses and transport failures.

The model receives normalized market context (no future replay bars), technical engines, 4H/1H/15m evidence when available during live runs, macro releases/calendar entries and measurable reactions, cross-asset returns, similar historical trades, sample-gated strategy memory, and account/risk state. No Bitget API keys are sent to it.

The LLM is the independent final proposal generator. No deterministic fallback proposes trades when it fails. It can disagree with confluence and choose WAIT. LONG/SHORT/WAIT/REDUCE/CLOSE are validated by `decisionSchema` in `lib/types.ts`.

Output fields: decision, asset, reasoningSummary, entryZone, invalidation, targets, confidence, riskNotes, conditionsToReevaluate. Confidence is internal consistency, never probability of winning. Malformed JSON, invalid action, invalid symbol, unverified numeric prose, and timeouts become WAIT / AGENT_VALIDATION_FAILURE and are logged. An absent API key becomes WAIT / AGENT_UNCONFIGURED.

The model cannot control account sizing, maximum risk, daily loss, instrument availability, precision, spread, freshness, operating mode, or live execution. The risk engine independently validates proposed geometry and structural stops, then computes quantity. Spot SHORT is unsupported and rejected.

`lib/reflection.ts` optionally reviews closed trades using stored evidence. The returned reflection is schema and trade-ID checked, but natural-language causal claims are not independently proven. UI/database label it as LLM interpretation. Failed reflection preserves the deterministic evidence summary and UNREVIEWED decision quality. Outcomes do not automatically imply good or poor decision quality.

Memory retrieval ranks context overlap, never profit. Strategy aggregates require 10 comparable trades, prefer 20+, and do not alter risk or strategy code. These are descriptive observations, not learned guarantees.
