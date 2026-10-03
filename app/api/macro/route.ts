import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { macroSchema } from '@/lib/types';
import { transaction } from '@/lib/db';
import { saveMacro } from '@/lib/macro/source';
export async function POST(req: Request) {
  try {
    authorize(req);
    const event = macroSchema.parse(await req.json());
    if (event.status === 'UPCOMING' && event.actual !== null)
      throw Error('Upcoming events cannot have released actuals');
    if (event.status !== 'UPCOMING' && event.timestamp && Date.parse(event.timestamp) > Date.now())
      throw Error('A released event cannot be in the future');
    const value = {
      ...event,
      surprise:
        event.actual !== null && event.forecast !== null ? event.actual - event.forecast : null,
    };
    transaction(() => saveMacro(value));
    return NextResponse.json(value);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid event' },
      { status: 400 },
    );
  }
}
