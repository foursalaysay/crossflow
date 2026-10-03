import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { run } from '@/lib/service';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    authorize(req);
    const v = z
      .object({
        asset: z.string().regex(/^[A-Za-z0-9]+$/),
        pair: z.string().regex(/^[A-Za-z0-9]+$/),
        timeframe: z.enum(['5m', '15m', '1H', '4H', '1D']),
        mode: z.enum(['PAPER', 'READ_ONLY']),
      })
      .parse(await req.json());
    if (v.asset === v.pair) throw Error('Select two different assets');
    return NextResponse.json(await run(v.asset, v.pair, v.timeframe, v.mode));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 });
  }
}
