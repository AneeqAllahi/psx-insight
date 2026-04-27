import { NextRequest, NextResponse } from 'next/server';
import { PSXApi } from '@/lib/psx-api';
import type { Dividend, Fundamentals, Tick } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PortfolioHoldingData {
  symbol: string;
  tick: Tick | null;
  fundamentals: Fundamentals | null;
  dividends: Dividend[];
  error?: string;
}

async function fetchHolding(symbol: string): Promise<PortfolioHoldingData> {
  try {
    const [tick, fundamentals, dividends] = await Promise.all([
      PSXApi.getTick('REG', symbol),
      PSXApi.getFundamentals(symbol),
      PSXApi.getDividends(symbol),
    ]);

    return { symbol, tick, fundamentals, dividends };
  } catch (error) {
    return {
      symbol,
      tick: null,
      fundamentals: null,
      dividends: [],
      error: error instanceof Error ? error.message : `Unable to load ${symbol}`,
    };
  }
}

async function runLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...(await Promise.all(chunk.map(worker))));
  }

  return results;
}

export async function GET(request: NextRequest) {
  const symbols = Array.from(
    new Set(
      (request.nextUrl.searchParams.get('symbols') ?? '')
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, 50);

  if (symbols.length === 0) {
    return NextResponse.json({ items: [], updatedAt: Date.now() });
  }

  const items = await runLimited(symbols, 5, fetchHolding);

  return NextResponse.json({
    items,
    updatedAt: Date.now(),
  });
}

