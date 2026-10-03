# Add an LLM to CrossFlow

CrossFlow already has server-side Responses and Chat Completions adapters. You only need a provider API key and an accessible model. The connection test costs a small API request; running agent cycles sends market evidence and selected journal context to your configured provider.

## Hackathon Qwen setup

The [Bitget hackathon guide](https://bitget-ai.gitbook.io/bitgetai_hackathons2#qwen-token-subsidy-during-the-hackathon) specifies the gateway `https://hackathon.bitgetops.com/v1` and recommends `qwen3.8-max`. Its Codex configuration uses the Responses API. CrossFlow now uses the same gateway/model/protocol by default.

1. Use the Qwen API key supplied by the hackathon. A direct Alibaba Cloud key belongs to a different endpoint; do not interchange them.
2. Put the key in the existing project `.env`. The remaining settings are already configured:

```dotenv
LLM_API_KEY=your_hackathon_qwen_key
LLM_BASE_URL=https://hackathon.bitgetops.com/v1
LLM_MODEL=qwen3.8-max
LLM_API=responses
```

CrossFlow stores its key in `LLM_API_KEY`. The guide's `BITGET_QWEN_API_KEY` variable is for its Codex configuration example; you do not need to change Codex settings to run this application.

Agent decisions, reflections and connection tests share one transport. Responses requests use `input` and `text.format`, parse completed assistant text from `output`, and reject refusals, incomplete output and invalid JSON. The app sends no Alibaba-specific `enable_thinking` override to the hackathon gateway. It never silently retries through another provider.

The guide documents coding-agent setup, not every app-level JSON option. A successful **Test LLM connection** is still needed to verify the issued key and gateway compatibility. On 2026-09-24, the locally configured key passed an authenticated JSON connection test against the hackathon gateway. This verifies connectivity, not trading quality.

3. Restart `npm run dev` and any separately running worker.
4. Open **Connections → Test LLM connection**. This checks authentication and JSON output without requesting a trade.
5. Choose **Read only**, then **Run agent**, and inspect Decision history. Use **Paper trading** when ready to simulate entries. A valid WAIT is a legitimate decision.

For the Qwen usage form, select **Trading-signal reasoning**, **Sentiment and event analysis**, and **Agent planning and task orchestration**. Add **Market / news summarization** if your submitted scope includes summaries of the ingested macro/news events. The current app does not have a general research chat or a financial-report extraction pipeline.

Suggested project description: “CrossFlow uses Qwen to interpret cross-asset market and macro-event evidence, evaluate trading setups, and generate structured decisions and post-trade reflections. In Paper mode, approved decisions execute simulated trades automatically after deterministic risk controls pass. Exchange orders remain a separate, explicitly confirmed path.”

## Direct Alibaba Cloud or other compatible providers

For a direct Singapore Model Studio key, set `LLM_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, `LLM_MODEL=qwen-plus`, and `LLM_API=chat_completions`. Use your console's region/workspace endpoint where applicable. For other gateways, use their documented base URL, model and protocol. Do not switch endpoints while retaining a key issued for a different provider.

Chat Completions uses `messages`, `response_format: {"type":"json_object"}` and temperature. Only supported older direct Alibaba Qwen chat models receive `enable_thinking:false`. Responses uses its own request/response structure. Both paths apply the same application-level decision validation.

## Troubleshooting

| Result | Check |
|---|---|
| `LLM_API_KEY_MISSING` / `AGENT_UNCONFIGURED` | Correct `.env` location and server restart. Variable name is `LLM_API_KEY`, not `NEXT_PUBLIC_*`. |
| `LLM_HTTP_401` | Key validity and provider/base URL match. |
| `LLM_HTTP_403` / `404` | Project access, endpoint path and model availability. |
| `LLM_HTTP_429` | Provider quota, billing and rate limits. Stop the worker while troubleshooting. |
| `LLM_HTTP_400` | Gateway support for the selected protocol and JSON format. Check endpoint/model against the issued credentials. |
| Connection/JSON validation failure | Network, timeout, or provider response compatibility. |
| `AGENT_VALIDATION_FAILURE` | Inspect the decision error: invalid schema, wrong asset, unsupported numerical claims, timeout, or provider error. |

The connection test is not proof of trading quality. The agent must pass a stricter decision schema and deterministic risk checks. Missing data or invalid output produces WAIT. The LLM never receives Bitget credentials, sets live quantity, or submits exchange orders. In Paper mode, the server executes approved simulated entries, reductions, and closes without per-trade confirmation. Bitget demo/live tickets require a separate human confirmation.

`npm run worker` runs repeated paper cycles and may incur continuing model costs; keep it stopped until you want that behavior. Reflection can make an additional call after a paper trade closes. There is no built-in provider spend meter.

Analysis requests allow up to 120 seconds for Qwen. `LLM_TIMEOUT` means that deadline expired; `LLM_NETWORK_ERROR` means the connection failed before a complete response. Neither causes a trade or an automatic retry. Request fresh analysis with **Run agent**. A successful connection test confirms authentication and a short JSON response; full market analysis can take longer. Market freshness checks still apply after analysis, so a slow result cannot bypass stale-data protection.
