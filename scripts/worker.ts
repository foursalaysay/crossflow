import { syncMacro } from '../lib/macro/source';
import { paperCycle, autonomyConfig } from '../lib/autonomy';
import { db, transaction } from '../lib/db';
const owner = crypto.randomUUID();
transaction(() => {
  const r = db().prepare('SELECT payload FROM Settings WHERE id=?').get('worker-status') as
    { payload: string } | undefined;
  if (r && Date.now() - JSON.parse(r.payload).heartbeatAt < 45000)
    throw Error('A paper worker is already active');
  db()
    .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
    .run('worker-status', JSON.stringify({ owner, heartbeatAt: Date.now(), phase: 'starting' }));
});
let stopped = false,
  phase = 'idle';
let lastCycle: unknown = null;
function heartbeat() {
  db()
    .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
    .run(
      'worker-status',
      JSON.stringify({ owner, heartbeatAt: stopped ? 0 : Date.now(), phase, lastCycle }),
    );
}
const timer = setInterval(heartbeat, 10000);
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
console.log('CrossFlow paper worker. Enable or pause in Agent operations. No exchange orders.');
try {
  while (!stopped) {
    try {
      phase = 'syncing';
      heartbeat();
      await syncMacro();
      phase = 'analyzing';
      heartbeat();
      lastCycle = { at: Date.now(), results: await paperCycle(() => !stopped) };
    } catch (e) {
      lastCycle = { at: Date.now(), error: e instanceof Error ? e.message : 'Worker failed' };
    }
    phase = autonomyConfig().enabled ? 'waiting' : 'paused';
    heartbeat();
    for (let i = 0; i < autonomyConfig().intervalSeconds && !stopped; i++)
      await new Promise((r) => setTimeout(r, 1000));
  }
} finally {
  clearInterval(timer);
  phase = 'stopped';
  heartbeat();
}
