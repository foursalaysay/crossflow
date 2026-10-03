import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { riskSchema } from '@/lib/config';
import { db } from '@/lib/db';
export async function POST(req: Request) {
  try {
    authorize(req);
    const body = await req.json();
    if (body.mode === 'PAPER' || body.mode === 'READ_ONLY') {
      db().prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)').run('mode', body.mode);
      return NextResponse.json({ mode: body.mode });
    }
    const config = riskSchema.parse(body);
    db().prepare('INSERT OR REPLACE INTO Settings VALUES(?,?)').run('risk', JSON.stringify(config));
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid risk configuration' },
      { status: 400 },
    );
  }
}
