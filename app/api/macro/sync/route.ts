import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { syncMacro } from '@/lib/macro/source';
export async function POST(req: Request) {
  try {
    authorize(req);
    const result = await syncMacro(true);
    return NextResponse.json(result, { status: result.status === 'ERROR' ? 502 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 400 },
    );
  }
}
