import { exchangePortfolio, exchangeRecords, recordKinds } from '@/lib/exchange-portfolio';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize } from '@/lib/auth';
import { connectionConfig, exchangeAccount } from '@/lib/bitget-private';
import { previewOrder, confirmOrder, executeAutonomousOrder, reconcileOrder, orderHistory } from '@/lib/live';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    authorize(req);
    const body = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('status') }),
        z.object({ action: z.literal('portfolio') }),
        z.object({
          action: z.literal('records'),
          kind: z.enum(recordKinds),
          cursor: z.string().max(128).optional(),
          startTime: z.number().optional(),
          endTime: z.number().optional(),
        }),
        z.object({ action: z.literal('connect') }),
        z.object({ action: z.literal('preview'), ticket: z.unknown() }),
        z.object({ action: z.literal('confirm'), id: z.string(), confirmation: z.string() }),
        z.object({ action: z.literal('execute'), id: z.string() }),
        z.object({ action: z.literal('reconcile'), id: z.string() }),
      ])
      .parse(await req.json());
    if (body.action === 'portfolio')
      return NextResponse.json(await exchangePortfolio(), {
        headers: { 'Cache-Control': 'no-store' },
      });
    if (body.action === 'records')
      return NextResponse.json(
        await exchangeRecords(body.kind, body.cursor, body.startTime, body.endTime),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    const result =
      body.action === 'status'
        ? { ...connectionConfig(), orders: orderHistory() }
        : body.action === 'connect'
          ? { ...connectionConfig(), account: await exchangeAccount(), checkedAt: Date.now() }
          : body.action === 'preview'
            ? await previewOrder(body.ticket)
            : body.action === 'confirm'
              ? await confirmOrder(body.id, body.confirmation)
              : body.action === 'execute'
                ? await executeAutonomousOrder(body.id)
              : await reconcileOrder(body.id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? 'EXCHANGE_DATA_INVALID: Bitget returned incomplete or invalid account/order data. No order was submitted by this validation step.'
            : e instanceof Error
              ? e.message
              : 'EXCHANGE_FAILED',
      },
      { status: 400 },
    );
  }
}
