import { NextRequest, NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  try {
    const tick = await PSXApi.getTick('REG', symbol);

    return NextResponse.json({
      tick,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : `Unable to load ${symbol} tick`,
      },
      { status: 502 },
    );
  }
}
