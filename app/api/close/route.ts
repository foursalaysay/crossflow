import { operatingMode } from '@/lib/config';
import { reflect } from '@/lib/reflection';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { trades, closeTrade } from '@/lib/portfolio';
import { market } from '@/lib/bitget';
import { transaction } from '@/lib/db';
export async function POST(req: Request) {
  try {
    authorize(req);
    if (operatingMode() !== 'PAPER') throw Error('READ_ONLY');
    const { id } = await req.json();
    const t = trades().find((t) => t.id === id && t.status === 'OPEN');
    if (!t) throw Error('Open trade not found');
    const m = await market(t.asset, '5m');
    if (m.status !== 'VALID' || !m.bid) throw Error('Fresh executable quote required');
    const closed = transaction(() => {
      if (operatingMode() !== 'PAPER') throw Error('READ_ONLY');
      const current = trades().find((t) => t.id === id && t.status === 'OPEN');
      if (!current) throw Error('Already closed');
      return closeTrade(current, m.bid!, Date.now(), 1, 'Human intervention');
    });
    await reflect(closed);
    return NextResponse.json(closed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Close failed' },
      { status: 400 },
    );
  }
}
