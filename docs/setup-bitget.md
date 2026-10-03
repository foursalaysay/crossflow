# Connect a Bitget account and submit a confirmed order

CrossFlow implements authenticated Bitget UTA v3 account reads, spot order placement and order reconciliation. **No private account or real-money order has been verified without your credentials.** Public market data already works without a key. Exchange orders require exact confirmation by default; autonomous submission is available only when the environment-specific autonomy flag is explicitly enabled, and validation is repeated immediately before submission.

## 1. Configure credentials locally

Use a dedicated, funded UTA spot account. Create an HMAC API key with account-read and UTA trade read/write permissions. Keep withdrawal permission disabled and restrict the key to your server IP where practical. Do not paste secrets into chat.

For exchange Demo, create a separate Demo key from Bitget's Demo account API management. The adapter adds `paptrading: 1` and never falls back to live when Demo fails. Demo availability varies by instrument/product; do not assume tokenized stocks are supported. See [Bitget Demo setup](https://www.bitget.com/docs/uta/demo-trading/rest-api).

The project .env is already prepared. Only the Bitget key, secret and passphrase are missing for account access. For a Demo account use the following configuration; use live for your live key:

```dotenv
BITGET_ENV=demo
BITGET_API_KEY=your_key
BITGET_API_SECRET=your_secret
BITGET_PASSPHRASE=the_passphrase_you_created_with_the_key
BITGET_MAX_ORDER_USDT=10
ENABLE_LIVE_TRADING=false
ENABLE_DEMO_TRADING=true
ENABLE_LIVE_AUTONOMY=false
ENABLE_DEMO_AUTONOMY=false
```

The environment must be exactly `demo` or `live`. For actual funds, use a live key and explicitly set `BITGET_ENV=live`. The provided .env targets Demo. Demo submission has its own gate; real-money submission remains disabled. Change it to demo when using a Demo key. If the variable is absent, the adapter defaults to Demo. Never put secrets in `NEXT_PUBLIC_*` variables.

Restart `npm run dev`, open **Connections**, and click **Test Bitget connection**. It reads actual UTA balances; it does not trade, transfer or withdraw. Successful account access does not establish trade permission. The app signs exact request bytes with HMAC-SHA256 per [Bitget authentication](https://www.bitget.com/docs/uta/quick-start) and reads [UTA account assets](https://www.bitget.com/docs/catalog/account/assets-balance).

## 2. Preview and confirm

1. For Demo, set `BITGET_ENV=demo` and `ENABLE_DEMO_TRADING=true`, leaving `ENABLE_LIVE_TRADING=false`. For autonomous Demo execution, also explicitly set `ENABLE_DEMO_AUTONOMY=true`. For real-money orders, set `BITGET_ENV=live`, `ENABLE_LIVE_TRADING=true`, and only after review explicitly set `ENABLE_LIVE_AUTONOMY=true`. Restart after changes. Each environment has independent trading and autonomy gates.
2. Select the asset and comparison pair in Overview, then return to Connections. Read-only mode must be off.
3. Enter a base-asset quantity. For buys, enter a stop below actual nearby support and a target above entry. Use the instrument's price precision.
4. Preview. The server obtains fresh quotes and actual exchange balances, checks risk, and stores an immutable ticket with a 30-second confirmation deadline.
5. Review environment, symbol, side, quantity, limit, stop, target and maximum principal. Type the displayed confirmation phrase and press Submit. This action sends an actual exchange order when the environment is LIVE.
6. Click **Reconcile status**. Exchange acknowledgement is not a fill. Inspect order status, executed quantity and average fill price; verify protective orders directly in Bitget.

The ticket uses the regular UTA order endpoint with SPOT, IOC limit execution and borrowing disabled. Quantity is in the base coin. Buy requests include preset market TP/SL. Unsupported orders are rejected without removing protection or switching endpoints. The autonomous execute route never skips the same fresh quote, account, exposure, loss, precision, ledger, and connectivity checks. The [order documentation](https://www.bitget.com/docs/catalog/trading/order-management) describes these fields and order lookup. The regular UTA route supports discovered rTokens according to the [Reality guide](https://www.bitget.com/docs/uta/reality-trading-guide); your account eligibility and actual exchange response remain authoritative.

## Limits in this MVP

- Only USDT-quoted spot buys and sells of owned assets. No futures, leverage, borrowing, automatic live decisions or continuous live position manager.
- Per-order principal cap defaults to 10 USDT and is configurable up to 1,000 USDT. Exchange minimums still apply.
- Buys also cap **the entire principal plus a 0.3% fee allowance** at the risk percentage of the smaller of exchange cash balance and equity. This is intentionally stricter than sizing only for a stop loss. A 10 USDT buy needs slightly more than 1,000 USDT cash at a 1% cap. Smaller funded accounts may be unable to meet the exchange minimum. No funding or transfer is performed by the app.
- Daily gross buy submissions, including uncertain and canceled requests, consume a conservative budget equal to the daily loss percentage. The app also blocks buys after an observed equity drawdown reaches that percentage. This is not a complete midnight-to-now exchange P&L calculation: the equity high starts at the first observation that UTC day. External trading, deposits and withdrawals affect equity. Use a dedicated account.
- Existing non-USDT holdings conservatively count toward the position cap. Derivatives exposure or debt blocks new buys. Macro and structural risk rules apply.
- Limit price bounds entry execution, but IOC can partially fill. Requested TP/SL is not proof of active protection. Reconciliation reports whether preset fields are returned; monitor and manage filled holdings and actual protective orders in Bitget. This app does not automatically replace missing stops or guarantee execution at a stop price.
- A timeout, interrupted process or ambiguous response locks new submissions until the existing client order ID is reconciled. No automatic order retries. If lookup continues to fail, inspect Bitget and resolve the recorded request before submitting again; do not delete the SQLite ledger to bypass the lock.
- Switching off the environment flag blocks new app submissions, but does not cancel existing exchange orders, close holdings, or remove existing TP/SL. Reconciliation remains available. Use Bitget for cancellation and emergency position management.
- Exchange audit entries are separate from paper performance and journal statistics. Keep `data/crossflow.sqlite`; backups and account/key rotation need care. This local ledger is scoped by API key and environment, not a complete exchange account history.

## Troubleshooting

Missing credentials: fill all three key fields and restart. Authentication error: check passphrase, HMAC key type, IP restrictions, local clock synchronization and Demo/live key match. Account read failure: check UTA upgrade/access and read permissions. Trade rejection: check instrument eligibility, trading permission, size/precision and TP/SL support. The app reports Bitget error codes without echoing secrets or raw upstream bodies. Look up codes in the official Bitget documentation.

Keep the server bound to loopback. This is a single-user local MVP. Do not expose a live-key installation to the public internet without adding proper user authentication, secret management and deployment controls.

The dashboard cards read equity, unrealized P&L, open spot orders, and available USDT from the configured Bitget account every 30 seconds. **Exchange trades** shows current spot orders, account holdings, order history and fills for the last 30 days, with cursor pagination. These are authenticated read-only requests. Missing values appear as `—`; a failed request is reported separately from an empty result. Demo and live accounts are explicitly labeled. The local paper simulator remains separate in **Trade journal** and **Performance**.
