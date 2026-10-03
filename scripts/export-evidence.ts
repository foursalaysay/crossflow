import { mkdirSync, writeFileSync } from 'node:fs';
import { evidenceBundle } from '../lib/evidence';
mkdirSync('artifacts/submission', { recursive: true });
const data = evidenceBundle();
writeFileSync('artifacts/submission/paper-evidence.json', JSON.stringify(data, null, 2));
console.log(JSON.stringify(data.summary));
console.log(
  'Saved artifacts/submission/paper-evidence.json. Contains paper trading history; review before sharing. No environment credentials or private Bitget balances exported.',
);
