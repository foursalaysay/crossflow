import { NextResponse } from 'next/server';
import { db, transaction } from '@/lib/db';
import { operatingMode } from '@/lib/config';
import { authorize } from '@/lib/auth';
import { advanceReplay, replayContext } from '@/lib/replay';
export async function GET(req: Request) {
  const raw = Number(new URL(req.url).searchParams.get('index') ?? 80);
  if (!Number.isInteger(raw) || raw < 40)
    return NextResponse.json({ error: 'Index must be an integer >= 40' }, { status: 400 });
  return NextResponse.json({ index: raw, context: replayContext(raw) });
}
export async function POST(req: Request) {
  try {
    authorize(req);
    if (operatingMode() === 'READ_ONLY')
      throw Error('Read only: switch to paper mode to run execution replay');
    const { id } = await req.json();
    if (id !== undefined && typeof id !== 'string') throw Error('Invalid session');
    const lock = `replay-lock-${id ?? crypto.randomUUID()}`;
    transaction(() => {
      db().prepare('DELETE FROM RunLock WHERE expires < ?').run(Date.now());
      if (db().prepare('SELECT id FROM RunLock WHERE id=?').get(lock))
        throw Error('Replay step already running');
      db()
        .prepare('INSERT INTO RunLock VALUES(?,?)')
        .run(lock, Date.now() + 60000);
    });
    try {
      return NextResponse.json(await advanceReplay(id));
    } finally {
      db().prepare('DELETE FROM RunLock WHERE id=?').run(lock);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Replay failed' },
      { status: 400 },
    );
  }
}
