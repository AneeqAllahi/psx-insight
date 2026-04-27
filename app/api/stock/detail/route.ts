import { NextRequest, NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';
import type { Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';

const timeframes = new Set<Timeframe>(['1m', '5m', '15m', '1h', '4h', '1d']);

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  const requestedTimeframe = request.nextUrl.searchParams.get('timeframe') ?? '1d';
  const timeframe = timeframes.has(requestedTimeframe as Timeframe)
    ? (requestedTimeframe as Timeframe)
    : '1d';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  try {
    const [tick, fundamentals, company, dividends, klines] = await Promise.all([
      PSXApi.getTick('REG', symbol),
      PSXApi.getFundamentals(symbol),
      PSXApi.getCompany(symbol),
      PSXApi.getDividends(symbol),
      PSXApi.getKlines(symbol, timeframe, { limit: 100 }),
    ]);

    return NextResponse.json({
      tick,
      fundamentals,
      company,
      dividends,
      klines,
      timeframe,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : `Unable to load ${symbol}`,
      },
      { status: 502 },
    );
  }
}
