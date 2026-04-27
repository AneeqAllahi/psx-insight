import { NextRequest, NextResponse } from 'next/server';
import { getIndexConstituents } from '@/lib/psx-index';
import { PSXApi } from '@/lib/psx-api';
import type { MarketStats, SectorData, TopMover } from '@/lib/types';

export const dynamic = 'force-dynamic';

function isMarketStats(data: Awaited<ReturnType<typeof PSXApi.getStats>>): data is MarketStats {
  return 'totalVolume' in data && 'topGainers' in data && 'topLosers' in data;
}

function isSectorMap(data: Awaited<ReturnType<typeof PSXApi.getStats>>): data is Record<string, SectorData> {
  return !('totalVolume' in data) && !('advances' in data);
}

function makeSectorLookup(sectors: Record<string, SectorData>) {
  const lookup = new Map<string, string>();

  for (const [sector, data] of Object.entries(sectors)) {
    for (const symbol of data.symbols) {
      lookup.set(symbol, sector.replace(/_/g, ' '));
    }
  }

  return lookup;
}

function makeMoverLookup(stats: MarketStats) {
  const lookup = new Map<string, TopMover>();

  for (const mover of [...stats.topGainers, ...stats.topLosers]) {
    lookup.set(mover.symbol, mover);
  }

  return lookup;
}

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope') === 'kse100' ? 'kse100' : 'all';
    const [symbols, statsResult, sectorsResult] = await Promise.all([
      PSXApi.getSymbols(),
      PSXApi.getStats('REG'),
      PSXApi.getStats('sectors'),
    ]);

    if (!isMarketStats(statsResult) || !isSectorMap(sectorsResult)) {
      return NextResponse.json({ error: 'Unexpected market response' }, { status: 502 });
    }

    const moverLookup = makeMoverLookup(statsResult);
    const sectorLookup = makeSectorLookup(sectorsResult);
    const kse100Rows = await getIndexConstituents('KSE100');
    const kse100Lookup = new Map(kse100Rows.map((row) => [row.symbol, row]));
    const sourceSymbols = scope === 'kse100' ? kse100Rows.map((row) => row.symbol) : symbols;

    return NextResponse.json({
      rows: sourceSymbols.map((symbol) => {
        const mover = moverLookup.get(symbol);
        const indexRow = kse100Lookup.get(symbol);
        const price = indexRow?.price ?? mover?.price ?? null;
        const volume = indexRow?.volume ?? mover?.volume ?? null;

        return {
          symbol,
          price,
          change: indexRow?.change ?? mover?.change ?? null,
          changePercent: indexRow?.changePercent ?? mover?.changePercent ?? null,
          volume,
          value: mover?.value ?? (price !== null && volume !== null ? price * volume : null),
          sector: sectorLookup.get(symbol) ?? 'Unclassified',
          isKSE100: kse100Lookup.has(symbol),
        };
      }),
      scope,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load markets',
      },
      { status: 502 },
    );
  }
}
