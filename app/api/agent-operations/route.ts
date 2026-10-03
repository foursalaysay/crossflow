import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { autonomyConfig, autonomySchema, workerStatus } from '@/lib/autonomy';
import { evidenceBundle } from '@/lib/evidence';
import { equityHistory, performanceFrom } from '@/lib/performance';
import { db } from '@/lib/db';
import { instruments } from '@/lib/bitget';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    authorize(req);
    const body = await req.json();
    if (body.action === 'export')
      return NextResponse.json(evidenceBundle(), {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="crossflow-paper-evidence.json"',
        },
      });
    if (body.action === 'configure') {
      const config = autonomySchema.parse(body.config);
      const universe = await instruments();
      if (config.assets.some((s) => !universe.some((i) => i.symbol === s && i.status === 'online')))
        throw Error('An asset is not currently available on Bitget');
      db()
        .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
        .run('autonomy', JSON.stringify({ ...config, assets: [...new Set(config.assets)] }));
    } else if (body.action === 'pause') {
      db()
        .prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)')
        .run('autonomy', JSON.stringify({ ...autonomyConfig(), enabled: false }));
    } else if (body.action !== 'status') throw Error('Unknown action');
    return NextResponse.json(
      { worker: workerStatus(), performance: performanceFrom(equityHistory()) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Agent operation failed' },
      { status: 400 },
    );
  }
}
