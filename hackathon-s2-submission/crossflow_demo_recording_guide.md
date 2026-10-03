# CrossFlow demo recording guide

Record a 2–4 minute run using Paper mode. Do not enable Bitget Demo or Live for the submission recording.

1. **0:00–0:20 — Product**: Introduce CrossFlow as a Qwen decision agent bounded by deterministic controls.
2. **0:20–0:50 — Evidence**: Show the selected market, candles, macro context, and portfolio state.
3. **0:50–1:20 — Decision**: Run the agent and open the structured Qwen decision. Point out LONG, REDUCE, CLOSE, or WAIT.
4. **1:20–1:50 — Risk**: Show the risk result and the fresh-evidence revalidation.
5. **1:50–2:20 — Execution**: In Paper mode, show an actually approved simulated fill if one occurs. There is no confirmation click. If the real run returns WAIT, show that honestly.
6. **2:20–2:50 — Ledger**: Show the journal, position/balance change, and decision trace.
7. **2:50–3:10 — Safety**: Show Agent operations paused/enabled state and explain that the server target is trusted configuration; Qwen cannot change it.

Narration: “CrossFlow receives current market and portfolio evidence. Qwen proposes a structured action, but the model does not authorize itself. Deterministic controls check freshness, sizing, exposure, loss limits, position state, and autonomy. In Paper mode, an approved decision executes automatically and is written to the journal. A WAIT, stale result, or failed risk check produces no order. The exchange remains authoritative for actual fills when an exchange target is explicitly configured.”
