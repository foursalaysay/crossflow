import { requestLLM } from '@/lib/llm';
import { llmConfig } from '@/lib/llm-config';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    authorize(req);
    if (!process.env.LLM_API_KEY) throw Error('LLM_API_KEY_MISSING');
    const model = llmConfig().model;
    z.object({ connected: z.literal(true) })
      .strict()
      .parse(
        await requestLLM([
          { role: 'user', content: 'Return only this JSON object: {"connected":true}' },
        ]),
      );
    return NextResponse.json({
      connected: true,
      model,
      message: 'Authenticated JSON response verified. No trade was requested.',
    });
  } catch (e) {
    const message =
      e instanceof Error && /^(LLM_|Unauthorized)/.test(e.message)
        ? e.message
        : 'LLM_CONNECTION_OR_JSON_VALIDATION_FAILED';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
