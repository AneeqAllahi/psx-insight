'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, LineChart, RadioTower } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import type { MarketStats, SectorData, TopMover } from '@/lib/types';

interface MarketOverviewResponse {
  stats: MarketStats;
  symbolsCount: number;
  scope: MarketScope;
  updatedAt: number;
}

interface SectorStatsResponse {
  sectors: Record<string, SectorData>;
  updatedAt: number;
}

interface SectorDetailRow {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  value: number;
  state: 'up' | 'down' | 'unchanged';
}

interface SectorDetailResponse {
  sector: string;
  summary: SectorData;
  rows: SectorDetailRow[];
  missingSymbols: string[];
  updatedAt: number;
}

type MarketScope = 'all' | 'kse100';

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
    style: 'currency',
    currency: 'PKR',
  }).format(value);
}

function percent(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    style: 'percent',
  }).format(value);
}

function signedPercent(value: number) {
  const formatted = percent(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function titleCaseSector(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function fetchMarketOverview(scope: MarketScope): Promise<MarketOverviewResponse> {
  const res = await fetch(`/api/market/overview?scope=${scope}`, { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Unable to load market overview');
  }

  return res.json();
}

async function fetchSectorStats(): Promise<SectorStatsResponse> {
  const res = await fetch('/api/market/sectors', { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Unable to load sector stats');
  }

  return res.json();
}

async function fetchSectorDetail(sector: string): Promise<SectorDetailResponse> {
  const res = await fetch(`/api/market/sector?name=${encodeURIComponent(sector)}`, { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Unable to load sector detail');
  }

  return res.json();
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded border border-line bg-panel p-5 shadow-sm shadow-black/20">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-400">{label}</p>
        <Icon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-black/10 p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-100">{value}</p>
    </div>
  );
}

function MoverRow({ mover, tone }: { mover: TopMover; tone: 'up' | 'down' }) {
  const Icon = tone === 'up' ? ArrowUpRight : ArrowDownRight;
  const toneClass = tone === 'up' ? 'text-emerald-300' : 'text-rose-300';

  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-line py-3 last:border-b-0">
      <div>
        <Link
          href={`/stock?symbol=${encodeURIComponent(mover.symbol)}`}
          className="cursor-pointer font-medium text-white hover:underline"
        >
          {mover.symbol}
        </Link>
        <p className="mt-1 text-xs text-gray-500">Vol {compactNumber(mover.volume)}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-gray-200">{mover.price.toFixed(2)}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-xs font-medium ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {percent(mover.changePercent)}
        </p>
      </div>
    </div>
  );
}

function sectorBackground(changePercent: number) {
  if (changePercent > 0.02) return '#16a34a';
  if (changePercent > 0) return 'rgba(74, 222, 128, 0.25)';
  if (changePercent === 0) return '#1e293b';
  if (changePercent >= -0.02) return 'rgba(248, 113, 113, 0.25)';
  return '#dc2626';
}

function SectorHeatmap({
  sectors,
  isLoading,
  error,
  isMarketOpen,
}: {
  sectors?: Record<string, SectorData>;
  isLoading: boolean;
  error: unknown;
  isMarketOpen: boolean;
}) {
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const sectorEntries = useMemo(
    () =>
      Object.entries(sectors ?? {}).sort(
        ([, current], [, next]) => next.avgChangePercent - current.avgChangePercent,
      ),
    [sectors],
  );
  const {
    data: sectorDetail,
    error: sectorDetailError,
    isFetching: isSectorDetailFetching,
  } = useQuery({
    queryKey: ['sector-detail', selectedSector],
    queryFn: () => fetchSectorDetail(selectedSector as string),
    enabled: Boolean(selectedSector),
    refetchInterval: isMarketOpen ? 15_000 : false,
    refetchOnWindowFocus: isMarketOpen,
  });

  return (
    <section className="rounded border border-line bg-panel p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Sector Performance</h2>
        <p className="text-sm text-gray-500">
          {isMarketOpen ? 'refreshes every 15s' : 'market closed - refresh paused'}
        </p>
      </div>

      {error ? (
        <div className="mt-5 rounded border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
          {error instanceof Error ? error.message : 'Unable to load sector performance'}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sectorEntries.length > 0
          ? sectorEntries.map(([sector, data]) => (
              <button
                type="button"
                key={sector}
                onClick={() => setSelectedSector(sector)}
                className="min-h-36 rounded border border-white/10 p-4 text-left shadow-sm shadow-black/20 transition hover:border-cyan-200/70 hover:brightness-110"
                style={{ backgroundColor: sectorBackground(data.avgChangePercent) }}
              >
                <p className="text-sm font-medium text-white">{titleCaseSector(sector)}</p>
                <p className="mt-4 text-3xl font-semibold text-white">{signedPercent(data.avgChangePercent)}</p>
                <p className="mt-2 text-sm text-gray-100">
                  ▲ {data.gainers}  ▼ {data.losers}
                </p>
                <p className="mt-3 text-sm text-gray-200">Vol {compactNumber(data.totalVolume)}</p>
              </button>
            ))
          : Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="min-h-36 rounded border border-line bg-black/10 p-4">
                <p className="text-sm text-gray-500">{isLoading ? 'Loading sector' : 'No sector data'}</p>
              </div>
            ))}
      </div>

      {selectedSector ? (
        <div className="mt-6 rounded border border-line bg-black/20 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">{titleCaseSector(selectedSector)}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {isSectorDetailFetching
                  ? 'Refreshing sector stocks'
                  : sectorDetail
                    ? `Updated ${new Date(sectorDetail.updatedAt).toLocaleTimeString()}`
                    : 'Loading sector stocks'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSector(null)}
              className="rounded border border-line px-3 py-2 text-sm text-gray-300 transition hover:border-cyan-300/70 hover:text-cyan-200"
            >
              Close
            </button>
          </div>

          {sectorDetailError ? (
            <div className="mt-4 rounded border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
              {sectorDetailError instanceof Error ? sectorDetailError.message : 'Unable to load sector stocks'}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Up" value={String(sectorDetail?.summary.gainers ?? '--')} />
            <MiniMetric label="Down" value={String(sectorDetail?.summary.losers ?? '--')} />
            <MiniMetric label="Unchanged" value={String(sectorDetail?.summary.unchanged ?? '--')} />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-gray-500">
                  <th className="py-3 pr-4 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Change</th>
                  <th className="px-4 py-3 font-medium">Change %</th>
                  <th className="px-4 py-3 font-medium">Volume</th>
                  <th className="py-3 pl-4 font-medium">Direction</th>
                </tr>
              </thead>
              <tbody>
                {sectorDetail?.rows.length ? (
                  sectorDetail.rows.map((row) => {
                    const toneClass =
                      row.state === 'up'
                        ? 'text-emerald-300'
                        : row.state === 'down'
                          ? 'text-rose-300'
                          : 'text-gray-300';

                    return (
                      <tr key={row.symbol} className="border-b border-line/80 transition hover:bg-white/[0.04]">
                        <td className="py-3 pr-4 font-medium text-white">
                          <Link href={`/stock?symbol=${encodeURIComponent(row.symbol)}`} className="hover:underline">
                            {row.symbol}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-200">{row.price.toFixed(2)}</td>
                        <td className={`px-4 py-3 font-medium ${toneClass}`}>{row.change.toFixed(2)}</td>
                        <td className={`px-4 py-3 font-medium ${toneClass}`}>{signedPercent(row.changePercent)}</td>
                        <td className="px-4 py-3 text-gray-300">{compactNumber(row.volume)}</td>
                        <td className={`py-3 pl-4 font-medium capitalize ${toneClass}`}>{row.state}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="py-6 text-gray-500" colSpan={6}>
                      {isSectorDetailFetching ? 'Loading sector stocks' : 'No live stock rows available for this sector.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LiveSymbolsTable({ stats, updatedAt }: { stats?: MarketStats; updatedAt: string | null }) {
  const [activeTab, setActiveTab] = useState<'gainers' | 'losers'>('gainers');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const source = activeTab === 'gainers' ? stats?.topGainers : stats?.topLosers;
    const query = search.trim().toUpperCase();

    return (source ?? [])
      .filter((mover) => (query ? mover.symbol.toUpperCase().includes(query) : true))
      .slice(0, 15);
  }, [activeTab, search, stats]);

  return (
    <section className="rounded border border-line bg-panel p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Symbols</h2>
          <p className="mt-1 text-sm text-gray-500">Last updated: {updatedAt ?? '--:--:--'}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex rounded border border-line bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('gainers')}
              className={`rounded px-4 py-2 text-sm font-medium transition ${
                activeTab === 'gainers' ? 'bg-cyan-400/15 text-cyan-200' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Top Gainers
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('losers')}
              className={`rounded px-4 py-2 text-sm font-medium transition ${
                activeTab === 'losers' ? 'bg-cyan-400/15 text-cyan-200' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Top Losers
            </button>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter symbol"
            className="h-11 rounded border border-line bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/70"
          />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-gray-500">
              <th className="py-3 pr-4 font-medium">Symbol</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Change</th>
              <th className="px-4 py-3 font-medium">Change %</th>
              <th className="px-4 py-3 font-medium">Volume</th>
              <th className="py-3 pl-4 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((mover) => {
                const isPositive = mover.change >= 0;
                const toneClass = isPositive ? 'text-emerald-300' : 'text-rose-300';
                const arrow = isPositive ? '↑' : '↓';

                return (
                  <tr key={`${activeTab}-${mover.symbol}`} className="border-b border-line/80 transition hover:bg-white/[0.04]">
                    <td className="py-3 pr-4 font-medium text-white">
                      <Link
                        href={`/stock?symbol=${encodeURIComponent(mover.symbol)}`}
                        className="cursor-pointer hover:underline"
                      >
                        {mover.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-200">{mover.price.toFixed(2)}</td>
                    <td className={`px-4 py-3 font-medium ${toneClass}`}>
                      {arrow} {mover.change.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 font-medium ${toneClass}`}>
                      {arrow} {signedPercent(mover.changePercent)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{compactNumber(mover.volume)}</td>
                    <td className="py-3 pl-4 text-gray-300">{compactNumber(mover.value)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="py-6 text-sm text-gray-500" colSpan={6}>
                  {stats ? 'No symbols match the current filter.' : 'Loading symbols'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MarketDashboard() {
  const [scope, setScope] = useState<MarketScope>('all');
  const marketStatusQuery = useMarketStatus();
  const isMarketOpen = marketStatusQuery.data?.isOpen ?? false;
  const { data, error, isLoading } = useQuery({
    queryKey: ['market-overview', scope],
    queryFn: () => fetchMarketOverview(scope),
    refetchInterval: isMarketOpen ? 30_000 : false,
    refetchOnWindowFocus: isMarketOpen,
  });
  const {
    data: sectorData,
    error: sectorError,
    isLoading: isSectorLoading,
  } = useQuery({
    queryKey: ['sector-stats'],
    queryFn: fetchSectorStats,
    refetchInterval: isMarketOpen ? 15_000 : false,
    refetchOnWindowFocus: isMarketOpen,
  });

  const stats = data?.stats;
  const updatedAt = data ? new Date(data.updatedAt).toLocaleTimeString() : null;
  const scopeLabel = scope === 'kse100' ? 'KSE-100' : 'Regular market';
  const marketStatusLabel = marketStatusQuery.data?.label ?? 'Checking market status';

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-gray-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-line pb-6">
          <p className="text-sm font-medium uppercase text-cyan-300">PSX Insight</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-white md:text-5xl">Market Dashboard</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-gray-400">
                Track Pakistan Stock Exchange momentum, breadth, movers, and turnover from a focused dark workspace.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as MarketScope)}
                className="h-11 rounded border border-line bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/70"
              >
                <option value="all">All market</option>
                <option value="kse100">KSE-100</option>
              </select>
              <div
                className={`rounded border px-4 py-2 text-sm font-medium ${
                  isMarketOpen
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                }`}
              >
                {marketStatusQuery.isFetching
                  ? 'Checking status'
                  : `${marketStatusLabel}${updatedAt ? ` - Updated ${updatedAt}` : ''}`}
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-100">
            {error instanceof Error ? error.message : 'Unable to load market data'}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Volume"
            value={stats ? compactNumber(stats.totalVolume) : isLoading ? 'Loading' : '--'}
            detail={stats ? `${stats.symbolCount} active symbols` : scopeLabel}
            icon={Activity}
          />
          <StatCard
            label="Total Value"
            value={stats ? money(stats.totalValue) : isLoading ? 'Loading' : '--'}
            detail="Traded value"
            icon={BarChart3}
          />
          <StatCard
            label="Total Trades"
            value={stats ? compactNumber(stats.totalTrades) : isLoading ? 'Loading' : '--'}
            detail={stats ? `${data?.symbolsCount ?? stats.symbolCount} symbols tracked` : 'Order activity'}
            icon={LineChart}
          />
          <StatCard
            label="Market Breadth"
            value={stats ? `${stats.gainers}/${stats.losers}` : isLoading ? 'Loading' : '--'}
            detail={stats ? `${stats.unchanged} unchanged` : 'Gainers vs losers'}
            icon={RadioTower}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded border border-line bg-panel p-6">
            <h2 className="text-lg font-semibold text-white">Market Overview</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded border border-line bg-black/10 p-4">
                <p className="text-sm text-gray-400">Gainers</p>
                <p className="mt-3 text-3xl font-semibold text-emerald-300">{stats?.gainers ?? '--'}</p>
              </div>
              <div className="rounded border border-line bg-black/10 p-4">
                <p className="text-sm text-gray-400">Losers</p>
                <p className="mt-3 text-3xl font-semibold text-rose-300">{stats?.losers ?? '--'}</p>
              </div>
              <div className="rounded border border-line bg-black/10 p-4">
                <p className="text-sm text-gray-400">Unchanged</p>
                <p className="mt-3 text-3xl font-semibold text-gray-200">{stats?.unchanged ?? '--'}</p>
              </div>
            </div>
            <div className="mt-5 min-h-48 rounded border border-dashed border-gray-700 bg-black/10 p-5">
              <p className="text-sm font-medium text-gray-300">{scopeLabel} summary</p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
                Showing {scopeLabel.toLowerCase()} data from the PSX API and refreshing automatically.
              </p>
            </div>
          </div>

          <aside className="rounded border border-line bg-panel p-6">
            <h2 className="text-lg font-semibold text-white">Top Movers</h2>
            <div className="mt-5">
              <p className="text-xs font-medium uppercase text-emerald-300">Gainers</p>
              <div className="mt-2">
                {stats?.topGainers.slice(0, 3).map((mover) => (
                  <MoverRow key={`gainer-${mover.symbol}`} mover={mover} tone="up" />
                )) ?? <p className="py-3 text-sm text-gray-500">Loading movers</p>}
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs font-medium uppercase text-rose-300">Losers</p>
              <div className="mt-2">
                {stats?.topLosers.slice(0, 3).map((mover) => (
                  <MoverRow key={`loser-${mover.symbol}`} mover={mover} tone="down" />
                )) ?? <p className="py-3 text-sm text-gray-500">Loading movers</p>}
              </div>
            </div>
          </aside>
        </section>

        <SectorHeatmap
          sectors={sectorData?.sectors}
          isLoading={isSectorLoading}
          error={sectorError}
          isMarketOpen={isMarketOpen}
        />

        <LiveSymbolsTable stats={stats} updatedAt={updatedAt} />
      </div>
    </main>
  );
}
