import { NextResponse } from 'next/server';
import { instruments, watchlistQuotes } from '@/lib/bitget';
import { getContext } from '@/lib/service';
import { timeframes, Timeframe } from '@/lib/types';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    if (q.has('quotes'))
      return NextResponse.json(await watchlistQuotes(), {
        headers: { 'Cache-Control': 'no-store' },
      });
    if (q.has('instruments')) return NextResponse.json(await instruments());
    const timeframe = q.get('timeframe') ?? '1H';
    if (!(timeframe in timeframes))
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 });
    return NextResponse.json(
      await getContext(
        q.get('asset') ?? 'RNVDAUSDT',
        q.get('pair') ?? 'BTCUSDT',
        timeframe as Timeframe,
      ),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unavailable' },
      { status: 502 },
    );
  }
}
