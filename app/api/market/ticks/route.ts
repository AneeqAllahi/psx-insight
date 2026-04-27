import { NextRequest, NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';
import type { Tick } from '@/lib/types';

export const dynamic = 'force-dynamic';

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
  const symbols = (request.nextUrl.searchParams.get('symbols') ?? '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 60);

  if (!symbols.length) {
    return NextResponse.json({ ticks: [], updatedAt: Date.now() });
  }

  const ticks = await runLimited(symbols, 6, async (symbol): Promise<Tick | null> => {
    try {
      return await PSXApi.getTick('REG', symbol);
    } catch {
      return null;
    }
  });

  return NextResponse.json({
    ticks: ticks.filter(Boolean),
    updatedAt: Date.now(),
  });
}
