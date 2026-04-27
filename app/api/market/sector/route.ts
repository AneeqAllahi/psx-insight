import { NextRequest, NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';
import type { SectorData, Tick } from '@/lib/types';

export const dynamic = 'force-dynamic';

function isSectorMap(data: Awaited<ReturnType<typeof PSXApi.getStats>>): data is Record<string, SectorData> {
  return !('totalVolume' in data) && !('advances' in data);
}

function normalizeSector(value: string) {
  return value.replace(/\s+/g, '_').toUpperCase();
}

async function runLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      results.push(await task(item));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(request: NextRequest) {
  try {
    const requestedSector = request.nextUrl.searchParams.get('name') ?? '';

    if (!requestedSector) {
      return NextResponse.json({ error: 'Missing sector name' }, { status: 400 });
    }

    const sectors = await PSXApi.getStats('sectors');

    if (!isSectorMap(sectors)) {
      return NextResponse.json({ error: 'Unexpected sector stats response' }, { status: 502 });
    }

    const match = Object.entries(sectors).find(([sector]) => normalizeSector(sector) === normalizeSector(requestedSector));

    if (!match) {
      return NextResponse.json({ error: `Sector not found: ${requestedSector}` }, { status: 404 });
    }

    const [sector, summary] = match;
    const ticks = await runLimited(summary.symbols, 6, async (symbol): Promise<Tick | null> => {
      try {
        return await PSXApi.getTick('REG', symbol);
      } catch {
        return null;
      }
    });
    const rows = ticks
      .filter((tick): tick is Tick => Boolean(tick))
      .map((tick) => ({
        symbol: tick.symbol,
        price: tick.price,
        change: tick.change,
        changePercent: tick.changePercent,
        volume: tick.volume,
        value: tick.value,
        state: tick.change > 0 ? 'up' : tick.change < 0 ? 'down' : 'unchanged',
      }))
      .sort((current, next) => next.changePercent - current.changePercent);

    return NextResponse.json({
      sector,
      summary,
      rows,
      missingSymbols: summary.symbols.filter((symbol) => !rows.some((row) => row.symbol === symbol)),
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to load sector detail',
      },
      { status: 502 },
    );
  }
}
