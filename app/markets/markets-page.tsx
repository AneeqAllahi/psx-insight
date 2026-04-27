'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMarketStatus } from '@/hooks/useMarketStatus';

interface MarketRow {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  value: number | null;
  sector: string;
  isKSE100?: boolean;
}

interface MarketsResponse {
  rows: MarketRow[];
  scope: MarketScope;
  updatedAt: number;
}

interface TickRow {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  value: number;
}

interface TicksResponse {
  ticks: TickRow[];
  updatedAt: number;
}

type MarketScope = 'kse100' | 'all';
type SortKey = keyof MarketRow;

const pageSize = 50;

function compactNumber(value: number | null) {
  if (value === null) return '--';

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null) {
  if (value === null) return '--';
  return value.toFixed(2);
}

function signedPercent(value: number | null) {
  if (value === null) return '--';

  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    style: 'percent',
  }).format(value);

  return value > 0 ? `+${formatted}` : formatted;
}

async function fetchMarkets(scope: MarketScope): Promise<MarketsResponse> {
  const res = await fetch(`/api/markets?scope=${scope}`, { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Unable to load markets');
  }

  return res.json();
}

async function fetchVisibleTicks(symbols: string[]): Promise<TicksResponse> {
  const params = new URLSearchParams({ symbols: symbols.join(',') });
  const res = await fetch(`/api/market/ticks?${params.toString()}`, { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Unable to load live prices');
  }

  return res.json();
}

function compareValues(current: MarketRow, next: MarketRow, key: SortKey) {
  const currentValue = current[key];
  const nextValue = next[key];

  if (typeof currentValue === 'number' || typeof nextValue === 'number') {
    const currentNumber = typeof currentValue === 'number' ? currentValue : Number.NEGATIVE_INFINITY;
    const nextNumber = typeof nextValue === 'number' ? nextValue : Number.NEGATIVE_INFINITY;

    return currentNumber - nextNumber;
  }

  return String(currentValue ?? '').localeCompare(String(nextValue ?? ''));
}

export function MarketsPage() {
  const router = useRouter();
  const marketStatusQuery = useMarketStatus();
  const isMarketOpen = marketStatusQuery.data?.isOpen ?? false;
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('All');
  const [scope, setScope] = useState<MarketScope>('kse100');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'symbol',
    direction: 'asc',
  });
  const { data, error, isFetching, isLoading } = useQuery({
    queryKey: ['markets', scope],
    queryFn: () => fetchMarkets(scope),
    refetchInterval: isMarketOpen ? 60_000 : false,
    refetchOnWindowFocus: isMarketOpen,
  });

  const sectors = useMemo(
    () => ['All', ...Array.from(new Set((data?.rows ?? []).map((row) => row.sector))).sort()],
    [data?.rows],
  );
  const filteredRows = useMemo(() => {
    const query = search.trim().toUpperCase();

    return (data?.rows ?? [])
      .filter((row) => (query ? row.symbol.toUpperCase().includes(query) : true))
      .filter((row) => (sector === 'All' ? true : row.sector === sector))
      .sort((current, next) => {
        const value = compareValues(current, next, sort.key);
        return sort.direction === 'asc' ? value : -value;
      });
  }, [data?.rows, search, sector, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page],
  );
  const visibleSymbols = useMemo(() => visibleRows.map((row) => row.symbol), [visibleRows]);
  const {
    data: tickData,
    error: tickError,
    isFetching: isFetchingTicks,
  } = useQuery({
    queryKey: ['visible-market-ticks', visibleSymbols],
    queryFn: () => fetchVisibleTicks(visibleSymbols),
    enabled: visibleSymbols.length > 0,
    refetchInterval: isMarketOpen ? 10_000 : false,
    refetchOnWindowFocus: isMarketOpen,
  });
  const tickLookup = useMemo(
    () => new Map((tickData?.ticks ?? []).map((tick) => [tick.symbol, tick])),
    [tickData?.ticks],
  );
  const enrichedVisibleRows = useMemo(
    () =>
      visibleRows.map((row) => {
        const tick = tickLookup.get(row.symbol);

        return tick
          ? {
              ...row,
              price: tick.price,
              change: tick.change,
              changePercent: tick.changePercent,
              volume: tick.volume,
              value: tick.value,
            }
          : row;
      }),
    [tickLookup, visibleRows],
  );
  const scopeLabel = scope === 'kse100' ? 'KSE-100' : 'All Listed';

  function updateSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateSector(value: string) {
    setSector(value);
    setPage(1);
  }

  function updateScope(value: MarketScope) {
    setScope(value);
    setSector('All');
    setPage(1);
  }

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-gray-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase text-cyan-300">Markets</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{scopeLabel} Symbols</h1>
            <p className="mt-3 text-sm text-gray-400">
              When the market is open, the base list refreshes every minute and visible rows refresh every 10 seconds.
            </p>
          </div>
          <div
            className={`rounded border px-4 py-2 text-sm font-medium ${
              isMarketOpen
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
            }`}
          >
            {marketStatusQuery.isFetching
              ? 'Checking status'
              : isFetching || isFetchingTicks
                ? 'Refreshing'
                : marketStatusQuery.data?.label
                  ? `${marketStatusQuery.data.label}${
                      tickData
                        ? ` - Live ${new Date(tickData.updatedAt).toLocaleTimeString()}`
                        : data
                          ? ` - Updated ${new Date(data.updatedAt).toLocaleTimeString()}`
                          : ''
                    }`
                  : 'Loading'}
          </div>
        </header>

        {error ? (
          <div className="rounded border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {error instanceof Error ? error.message : 'Unable to load markets'}
          </div>
        ) : null}

        {tickError ? (
          <div className="rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            {tickError instanceof Error ? tickError.message : 'Some live prices could not be refreshed.'}
          </div>
        ) : null}

        <section className="rounded border border-line bg-panel p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <input
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Search symbol"
              className="h-11 rounded border border-line bg-black/20 px-4 text-sm text-white outline-none placeholder:text-gray-600 focus:border-cyan-300/70 lg:w-80"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={scope}
                onChange={(event) => updateScope(event.target.value as MarketScope)}
                className="h-11 rounded border border-line bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/70"
              >
                <option value="kse100">KSE-100</option>
                <option value="all">All symbols</option>
              </select>
              <select
                value={sector}
                onChange={(event) => updateSector(event.target.value)}
                className="h-11 rounded border border-line bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/70"
              >
                {sectors.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-gray-500">
                  {[
                    ['symbol', 'Symbol'],
                    ['price', 'Price'],
                    ['change', 'Change'],
                    ['changePercent', 'Change%'],
                    ['volume', 'Volume'],
                    ['value', 'Value'],
                    ['sector', 'Sector'],
                  ].map(([key, label]) => (
                    <th key={key} className="px-4 py-3 font-medium first:pl-0 last:pr-0">
                      <button
                        type="button"
                        onClick={() => updateSort(key as SortKey)}
                        className="text-left hover:text-cyan-200"
                      >
                        {label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrichedVisibleRows.length > 0 ? (
                  enrichedVisibleRows.map((row) => {
                    const positive = (row.changePercent ?? 0) >= 0;
                    const toneClass = positive ? 'text-emerald-300' : 'text-rose-300';

                    return (
                      <tr
                        key={row.symbol}
                        onClick={() => router.push(`/stock?symbol=${encodeURIComponent(row.symbol)}`)}
                        className="cursor-pointer border-b border-line/80 transition hover:bg-white/[0.04]"
                      >
                        <td className="py-3 pl-0 pr-4 font-medium text-white">
                          <Link href={`/stock?symbol=${encodeURIComponent(row.symbol)}`} className="hover:underline">
                            {row.symbol}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{formatNumber(row.price)}</td>
                        <td className={`px-4 py-3 font-medium ${row.change === null ? 'text-gray-500' : toneClass}`}>
                          {formatNumber(row.change)}
                        </td>
                        <td className={`px-4 py-3 font-medium ${row.changePercent === null ? 'text-gray-500' : toneClass}`}>
                          {signedPercent(row.changePercent)}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{compactNumber(row.volume)}</td>
                        <td className="px-4 py-3 text-gray-300">{compactNumber(row.value)}</td>
                        <td className="py-3 pl-4 pr-0 text-gray-400">{row.sector}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={7}>
                      {isLoading ? 'Loading markets' : 'No symbols match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between text-sm text-gray-400">
            <span>
              Page {page} of {pageCount} - {filteredRows.length} symbols
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded border border-line px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page === pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                className="rounded border border-line px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
