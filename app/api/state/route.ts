import { agentEvaluation } from '@/lib/evaluation';
import { riskConfig, operatingMode } from '@/lib/config';
import { macroFeedStatus } from '@/lib/macro/source';
import { NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { account, analytics, trades, strategyMemory } from '@/lib/portfolio';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json({
    evaluation: agentEvaluation(),
    mode: operatingMode(),
    riskConfig: riskConfig(),
    account: account(),
    analytics: analytics(),
    trades: trades(),
    decisions: all('TradeDecision'),
    macro: all<import('@/lib/types').MacroEvent>('MacroEvent').sort(
      (a, b) => Date.parse(a.timestamp ?? '') - Date.parse(b.timestamp ?? ''),
    ),
    macroFeed: macroFeedStatus(),
    strategy: strategyMemory(),
    agentConfigured: !!process.env.LLM_API_KEY,
    liveEnabled: process.env.ENABLE_LIVE_TRADING === 'true',
    autonomousLiveEnabled: false,
  });
}
