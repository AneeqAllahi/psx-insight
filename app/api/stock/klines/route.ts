import { NextRequest, NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';
import type { Timeframe } from '@/lib/types';

export const dynamic = 'force-dynamic';

const timeframes = new Set<Timeframe>(['1m', '5m', '15m', '1h', '4h', '1d']);

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  const requestedTimeframe = request.nextUrl.searchParams.get('timeframe') ?? '1d';
  const timeframe = requestedTimeframe as Timeframe;

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  if (!timeframes.has(timeframe)) {
    return NextResponse.json({ error: 'Unsupported timeframe' }, { status: 400 });
  }

  try {
    const klines = await PSXApi.getKlines(symbol, timeframe, { limit: 100 });

    return NextResponse.json({
      klines,
      timeframe,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : `Unable to load ${symbol} klines`,
      },
      { status: 502 },
    );
  }
}
