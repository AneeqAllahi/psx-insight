import { NextRequest, NextResponse } from 'next/server';
import { getIndexConstituents } from '@/lib/psx-index';
import { PSXApi } from '@/lib/psx-api';
import type { MarketStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

function isMarketStats(data: Awaited<ReturnType<typeof PSXApi.getStats>>): data is MarketStats {
  return 'totalVolume' in data && 'topGainers' in data && 'topLosers' in data;
}

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') === 'kse100' ? 'kse100' : 'all';
    const [stats, symbols] = await Promise.all([
      PSXApi.getStats('REG'),
      PSXApi.getSymbols(),
    ]);

    if (!isMarketStats(stats)) {
      return NextResponse.json({ error: 'Unexpected market stats response' }, { status: 502 });
    }

    if (scope === 'kse100') {
      const rows = await getIndexConstituents('KSE100');
      const movers = rows
        .map((row) => ({
          symbol: row.symbol,
          change: row.change,
          changePercent: row.changePercent,
          price: row.price,
          volume: row.volume,
          value: row.price * row.volume,
        }))
        .sort((current, next) => next.changePercent - current.changePercent);
      const gainers = rows.filter((row) => row.change > 0).length;
      const losers = rows.filter((row) => row.change < 0).length;
      const unchanged = rows.length - gainers - losers;

      return NextResponse.json({
        stats: {
          totalVolume: rows.reduce((total, row) => total + row.volume, 0),
          totalValue: rows.reduce((total, row) => total + row.price * row.volume, 0),
          totalTrades: 0,
          symbolCount: rows.length,
          gainers,
          losers,
          unchanged,
          topGainers: movers.slice(0, 10),
          topLosers: movers.slice(-10).reverse(),
        },
        symbolsCount: rows.length,
        scope,
        updatedAt: Date.now(),
      });
    }

    return NextResponse.json({
      stats,
      symbolsCount: symbols.length,
      scope,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load market overview',
      },
      { status: 502 },
    );
  }
}
