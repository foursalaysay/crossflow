import { llmConfig } from '../lib/llm-config';
import { connectionConfig } from '../lib/bitget-private';
const required = ['BITGET_API_KEY', 'BITGET_API_SECRET', 'BITGET_PASSPHRASE', 'LLM_API_KEY'];
const missing = required.filter((key) => !process.env[key]?.trim());
try {
  const config = connectionConfig();
  console.log('Configuration file: .env');
  console.log(`LLM protocol: ${llmConfig().api}`);
  console.log(`Bitget environment: ${config.environment}; order cap: ${config.maxOrderUSDT} USDT`);
  console.log(
    `${config.environment.toUpperCase()} submission: ${config.enabled ? 'enabled with per-order confirmation' : 'locked'}`,
  );
  console.log(
    `Real-money trading: ${process.env.ENABLE_LIVE_TRADING === 'true' ? 'enabled' : 'disabled'}`,
  );
  console.log(`LLM model: ${llmConfig().model}`);
  console.log(
    missing.length
      ? `Missing credentials only: ${missing.join(', ')}`
      : 'All required credentials are present. Test both connections in the app.',
  );
  console.log(
    'No credentials are printed. This checks configuration, not network access or account permissions.',
  );
  process.exitCode = missing.length ? 1 : 0;
} catch {
  console.error('Invalid Bitget environment or order cap. Check .env against .env.example.');
  process.exitCode = 1;
}
