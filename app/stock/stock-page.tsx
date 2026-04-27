'use client';

import { useQuery } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { ArrowDownRight, ArrowLeft, ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import type { CompanyInfo, Dividend, Fundamentals, Kline, Tick, Timeframe } from '@/lib/types';

interface StockDetailResponse {
  tick: Tick;
  fundamentals: Fundamentals;
  company: CompanyInfo;
  dividends: Dividend[];
  klines: Kline[];
  timeframe: Timeframe;
  updatedAt: number;
}

interface TickResponse {
  tick: Tick;
  updatedAt: number;
}

interface KlinesResponse {
  klines: Kline[];
  timeframe: Timeframe;
  updatedAt: number;
}

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function commaNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function pkr(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    style: 'currency',
    currency: 'PKR',
  }).format(value);
}

function percentValue(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    style: 'percent',
  }).format(value);
}

function signedPercent(value: number) {
  const formatted = percentValue(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function plainPercent(value: number) {
  return `${commaNumber(value)}%`;
}

function marketStateClass(state: Tick['st']) {
  if (state === 'OPN') return 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200';
  if (state === 'CLS') return 'border-rose-400/40 bg-rose-400/15 text-rose-200';
  if (state === 'SUS') return 'border-amber-400/40 bg-amber-400/15 text-amber-200';
  return 'border-slate-400/40 bg-slate-400/15 text-slate-200';
}

async function fetchStockDetail(symbol: string, timeframe: Timeframe): Promise<StockDetailResponse> {
  const res = await fetch(`/api/stock/detail?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || `Unable to load ${symbol}`);
  }

  return res.json();
}

async function fetchTick(symbol: string): Promise<TickResponse> {
  const res = await fetch(`/api/stock/tick?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || `Unable to load ${symbol} tick`);
  }

  return res.json();
}

async function fetchKlines(symbol: string, timeframe: Timeframe): Promise<KlinesResponse> {
  const res = await fetch(`/api/stock/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || `Unable to load ${symbol} chart`);
  }

  return res.json();
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-black/10 p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-100">{value}</p>
    </div>
  );
}

interface FundamentalInsight {
  id: string;
  label: string;
  value: string;
  duration: string;
  source: string;
  detail: string;
  inputs: { label: string; value: string }[];
}

function ExplainedMetric({
  item,
  selected,
  onSelect,
}: {
  item: FundamentalInsight;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded border p-4 text-left transition ${
        selected
          ? 'border-cyan-300/70 bg-cyan-400/10'
          : 'border-line bg-black/10 hover:border-cyan-300/50 hover:bg-white/[0.03]'
      }`}
    >
      <p className="text-xs uppercase text-gray-500">{item.label}</p>
      <p className="mt-2 text-sm font-medium text-gray-100">{item.value}</p>
      <p className="mt-2 text-xs leading-5 text-gray-500">{item.duration}</p>
    </button>
  );
}

function StockHeader({
  symbol,
  tick,
  updatedAt,
  isMarketOpen,
  marketStatusLabel,
}: {
  symbol: string;
  tick?: Tick;
  updatedAt?: number;
  isMarketOpen: boolean;
  marketStatusLabel: string;
}) {
  const isPositive = (tick?.change ?? 0) >= 0;
  const toneClass = isPositive ? 'text-emerald-300' : 'text-rose-300';
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="rounded border border-line bg-panel p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-semibold text-white">{symbol}</h1>
            {tick ? (
              <span className={`rounded border px-3 py-1 text-xs font-semibold ${marketStateClass(tick.st)}`}>
                {tick.st}
              </span>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <p className="text-5xl font-semibold text-white">{tick ? tick.price.toFixed(2) : '--'}</p>
            <p className={`mb-2 flex items-center gap-1 text-lg font-semibold ${toneClass}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {tick ? `${tick.change.toFixed(2)} (${signedPercent(tick.changePercent)})` : '--'}
            </p>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {isMarketOpen ? 'Tick refreshes every 5s' : `${marketStatusLabel} - tick refresh paused`}
            {updatedAt ? ` - Last updated ${new Date(updatedAt).toLocaleTimeString()}` : ''}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          <Metric label="High" value={tick ? tick.high.toFixed(2) : '--'} />
          <Metric label="Low" value={tick ? tick.low.toFixed(2) : '--'} />
          <Metric label="Bid" value={tick ? tick.bid.toFixed(2) : '--'} />
          <Metric label="Ask" value={tick ? tick.ask.toFixed(2) : '--'} />
          <Metric label="Volume" value={tick ? compactNumber(tick.volume) : '--'} />
          <Metric label="Value" value={tick ? compactNumber(tick.value) : '--'} />
          <Metric label="Trades" value={tick ? compactNumber(tick.trades) : '--'} />
        </div>
      </div>
    </section>
  );
}

function PriceChart({
  symbol,
  klines,
  timeframe,
  onTimeframeChange,
  isLoading,
}: {
  symbol: string;
  klines: Kline[];
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
  isLoading: boolean;
}) {
  const chartData = useMemo(
    () =>
      klines.map((item) => ({
        ...item,
        label: format(new Date(item.timestamp), 'dd MMM'),
      })),
    [klines],
  );

  return (
    <section className="rounded border border-line bg-panel p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Price Chart</h2>
          <p className="mt-1 text-sm text-gray-500">{symbol} close price and volume</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {timeframes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onTimeframeChange(item)}
              className={`rounded border px-3 py-2 text-sm font-medium transition ${
                timeframe === item
                  ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-200'
                  : 'border-line bg-black/20 text-gray-400 hover:text-gray-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 h-80">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 8, right: 16, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#263244" strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}`} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #263244', borderRadius: 6 }}
                labelStyle={{ color: '#e5e7eb' }}
                formatter={(value) => [pkr(Number(value)), 'Close']}
              />
              <Area type="monotone" dataKey="close" stroke="#22d3ee" strokeWidth={2} fill="url(#priceGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center rounded border border-dashed border-gray-700 bg-black/10 text-sm text-gray-500">
            {isLoading ? 'Loading chart' : 'No chart data available'}
          </div>
        )}
      </div>

      <div className="mt-5 h-32">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid stroke="#263244" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(value) => compactNumber(Number(value))} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #263244', borderRadius: 6 }}
                labelStyle={{ color: '#e5e7eb' }}
                formatter={(value) => [compactNumber(Number(value)), 'Volume']}
              />
              <Bar dataKey="volume" fill="#2dd4bf" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </section>
  );
}

function buildFundamentalInsights(fundamentals?: Fundamentals, company?: CompanyInfo): FundamentalInsight[] {
  const price = fundamentals?.price ?? 0;
  const peRatio = fundamentals?.peRatio ?? 0;
  const dividendYield = fundamentals?.dividendYield ?? 0;
  const impliedEps = peRatio ? price / peRatio : 0;
  const impliedDividendPerShare = price && dividendYield ? price * (dividendYield / 100) : 0;
  const snapshot = fundamentals?.timestamp
    ? `Snapshot: ${new Date(fundamentals.timestamp).toLocaleString()}`
    : 'Latest fundamentals snapshot from the PSX API';

  return [
    {
      id: 'peRatio',
      label: 'P/E Ratio',
      value: fundamentals ? commaNumber(fundamentals.peRatio) : '--',
      duration: 'Latest trailing earnings basis',
      source: '/api/fundamentals/{symbol}',
      detail:
        'Price-to-earnings compares current price with the earnings figure used by the PSX fundamentals feed. The feed does not expose the exact financial period, so this is shown as the latest available trailing snapshot.',
      inputs: [
        { label: 'Current price', value: fundamentals ? pkr(price) : '--' },
        { label: 'P/E ratio', value: fundamentals ? commaNumber(peRatio) : '--' },
        { label: 'Implied EPS', value: fundamentals && impliedEps ? pkr(impliedEps) : '--' },
        { label: 'Data timestamp', value: snapshot },
      ],
    },
    {
      id: 'dividendYield',
      label: 'Dividend Yield',
      value: fundamentals ? plainPercent(fundamentals.dividendYield) : '--',
      duration: 'Latest trailing dividend yield',
      source: '/api/fundamentals/{symbol}',
      detail:
        'Dividend yield is reported by the fundamentals feed as a percentage of price. The source does not expose the dividend period in this response.',
      inputs: [
        { label: 'Current price', value: fundamentals ? pkr(price) : '--' },
        { label: 'Yield', value: fundamentals ? plainPercent(dividendYield) : '--' },
        { label: 'Implied annual dividend/share', value: fundamentals && impliedDividendPerShare ? pkr(impliedDividendPerShare) : '--' },
        { label: 'Data timestamp', value: snapshot },
      ],
    },
    {
      id: 'marketCap',
      label: 'Market Cap',
      value: fundamentals?.marketCap ?? '--',
      duration: 'Current price based company size',
      source: '/api/fundamentals/{symbol} and /api/companies/{symbol}',
      detail: 'Market capitalization is the company value figure exposed by the fundamentals feed, cross-checked with company profile share data when available.',
      inputs: [
        { label: 'Market cap', value: fundamentals?.marketCap ?? '--' },
        { label: 'Company profile market cap', value: company?.financialStats.marketCap.raw ?? '--' },
        { label: 'Shares outstanding', value: company?.financialStats.shares.raw ?? '--' },
      ],
    },
    {
      id: 'yearChange',
      label: '1-Year Change %',
      value: fundamentals ? plainPercent(fundamentals.yearChange) : '--',
      duration: 'Trailing 12 months',
      source: '/api/fundamentals/{symbol}',
      detail: 'This is the one-year price change percentage reported by the fundamentals endpoint.',
      inputs: [
        { label: '1-year change', value: fundamentals ? plainPercent(fundamentals.yearChange) : '--' },
        { label: 'Data timestamp', value: snapshot },
      ],
    },
    {
      id: 'volume30Avg',
      label: '30-Day Avg Volume',
      value: fundamentals ? compactNumber(fundamentals.volume30Avg) : '--',
      duration: 'Last 30 trading days',
      source: '/api/fundamentals/{symbol}',
      detail: 'Average traded volume over the last 30 sessions as reported by the fundamentals feed.',
      inputs: [
        { label: '30-day average volume', value: fundamentals ? commaNumber(fundamentals.volume30Avg) : '--' },
        { label: 'Data timestamp', value: snapshot },
      ],
    },
    {
      id: 'freeFloat',
      label: 'Free Float',
      value: fundamentals?.freeFloat ?? '--',
      duration: 'Latest company profile snapshot',
      source: '/api/fundamentals/{symbol} and /api/companies/{symbol}',
      detail: 'Free float is the portion of shares generally available for public trading.',
      inputs: [
        { label: 'Fundamentals free float', value: fundamentals?.freeFloat ?? '--' },
        { label: 'Free float shares', value: company?.financialStats.freeFloat.raw ?? '--' },
        { label: 'Free float percent', value: company?.financialStats.freeFloatPercent.raw ?? '--' },
      ],
    },
    {
      id: 'listedIn',
      label: 'Listed In',
      value: fundamentals?.listedIn?.replace(/,/g, ', ') || '--',
      duration: 'Current index membership snapshot',
      source: '/api/fundamentals/{symbol}',
      detail: 'Shows the PSX indices and lists where this symbol appears in the fundamentals response.',
      inputs: [{ label: 'Listed in', value: fundamentals?.listedIn?.replace(/,/g, ', ') || '--' }],
    },
    {
      id: 'sector',
      label: 'Sector',
      value: fundamentals?.sector || '--',
      duration: 'Current sector classification snapshot',
      source: '/api/fundamentals/{symbol}',
      detail: 'Sector classification as returned by the fundamentals feed.',
      inputs: [{ label: 'Sector', value: fundamentals?.sector || '--' }],
    },
  ];
}

function FundamentalsCard({ fundamentals, company }: { fundamentals?: Fundamentals; company?: CompanyInfo }) {
  const insights = useMemo(() => buildFundamentalInsights(fundamentals, company), [company, fundamentals]);
  const [selectedId, setSelectedId] = useState('peRatio');
  const selected = insights.find((item) => item.id === selectedId) ?? insights[0];

  return (
    <section className="rounded border border-line bg-panel p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Fundamentals</h2>
        <p className="text-sm text-gray-500">Click any metric to see duration, source, and inputs</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((item) => (
          <ExplainedMetric
            key={item.id}
            item={item}
            selected={selected.id === item.id}
            onSelect={() => setSelectedId(item.id)}
          />
        ))}
      </div>

      <div className="mt-5 rounded border border-line bg-black/20 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{selected.label}</h3>
            <p className="mt-1 text-sm text-gray-500">{selected.duration}</p>
          </div>
          <span className="rounded border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            {selected.source}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-gray-300">{selected.detail}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {selected.inputs.map((input) => (
            <Metric key={`${selected.id}-${input.label}`} label={input.label} value={input.value} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CompanyInfoSection({ company }: { company?: CompanyInfo }) {
  return (
    <section className="rounded border border-line bg-panel p-6">
      <h2 className="text-lg font-semibold text-white">Company Info</h2>
      <p className="mt-4 max-w-5xl text-sm leading-7 text-gray-300">
        {company?.businessDescription || 'No business description available.'}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Key People</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-gray-500">
                  <th className="py-3 pr-4 font-medium">Name</th>
                  <th className="py-3 pl-4 font-medium">Position</th>
                </tr>
              </thead>
              <tbody>
                {company?.keyPeople?.length ? (
                  company.keyPeople.map((person) => (
                    <tr key={`${person.name}-${person.position}`} className="border-b border-line/80">
                      <td className="py-3 pr-4 text-white">{person.name}</td>
                      <td className="py-3 pl-4 text-gray-300">{person.position}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-4 text-gray-500" colSpan={2}>
                      No key people available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-200">Financial Stats</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Metric label="Total Shares" value={company?.financialStats.shares.raw ?? '--'} />
            <Metric label="Free Float Shares" value={company?.financialStats.freeFloat.raw ?? '--'} />
            <Metric label="Free Float Percent" value={company?.financialStats.freeFloatPercent.raw ?? '--'} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DividendHistory({ dividends }: { dividends?: Dividend[] }) {
  const recentDividends = useMemo(() => {
    const cutoff = subMonths(new Date(), 12);

    return (dividends ?? [])
      .filter((dividend) => new Date(dividend.ex_date) >= cutoff)
      .sort((current, next) => new Date(next.ex_date).getTime() - new Date(current.ex_date).getTime());
  }, [dividends]);

  return (
    <section className="rounded border border-line bg-panel p-6">
      <h2 className="text-lg font-semibold text-white">Dividend History</h2>
      <div className="mt-5 overflow-x-auto">
        {recentDividends.length > 0 ? (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-gray-500">
                <th className="py-3 pr-4 font-medium">Ex-Date</th>
                <th className="px-4 py-3 font-medium">Payment Date</th>
                <th className="px-4 py-3 font-medium">Record Date</th>
                <th className="py-3 pl-4 font-medium">Amount per Share (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {recentDividends.map((dividend) => (
                <tr key={`${dividend.symbol}-${dividend.ex_date}-${dividend.amount}`} className="border-b border-line/80">
                  <td className="py-3 pr-4 text-white">{dividend.ex_date}</td>
                  <td className="px-4 py-3 text-gray-300">{dividend.payment_date}</td>
                  <td className="px-4 py-3 text-gray-300">{dividend.record_date}</td>
                  <td className="py-3 pl-4 text-gray-300">{dividend.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No dividends declared in the last 12 months.</p>
        )}
      </div>
    </section>
  );
}

export function StockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const symbol = (searchParams.get('symbol') ?? '').toUpperCase();
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const marketStatusQuery = useMarketStatus();
  const isMarketOpen = marketStatusQuery.data?.isOpen ?? false;
  const marketStatusLabel = marketStatusQuery.data?.label ?? 'Market status unknown';

  const detailQuery = useQuery({
    queryKey: ['stock-detail', symbol],
    queryFn: () => fetchStockDetail(symbol, '1d'),
    enabled: Boolean(symbol),
    refetchOnWindowFocus: false,
  });
  const tickQuery = useQuery({
    queryKey: ['stock-tick', symbol],
    queryFn: () => fetchTick(symbol),
    refetchInterval: isMarketOpen ? 5_000 : false,
    initialData: detailQuery.data
      ? { tick: detailQuery.data.tick, updatedAt: detailQuery.data.updatedAt }
      : undefined,
    enabled: detailQuery.isSuccess,
    refetchOnWindowFocus: isMarketOpen,
  });
  const klineQuery = useQuery({
    queryKey: ['stock-klines', symbol, timeframe],
    queryFn: () => fetchKlines(symbol, timeframe),
    initialData:
      timeframe === '1d' && detailQuery.data
        ? {
            klines: detailQuery.data.klines,
            timeframe: detailQuery.data.timeframe,
            updatedAt: detailQuery.data.updatedAt,
          }
        : undefined,
    enabled: detailQuery.isSuccess,
    refetchOnWindowFocus: false,
  });

  const tick = tickQuery.data?.tick ?? detailQuery.data?.tick;
  const klines = klineQuery.data?.klines ?? detailQuery.data?.klines ?? [];
  const error = detailQuery.error || tickQuery.error || klineQuery.error;

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-gray-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex w-fit items-center gap-2 rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-cyan-300/70 hover:text-cyan-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        {!symbol ? (
          <div className="rounded border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100">
            Choose a symbol from the dashboard to open its detail page.
          </div>
        ) : null}

        {error ? (
          <div className="rounded border border-rose-400/30 bg-rose-400/10 p-5 text-sm text-rose-100">
            {error instanceof Error ? error.message : 'Unable to load stock detail'}
          </div>
        ) : null}

        {symbol ? (
          <StockHeader
            symbol={symbol}
            tick={tick}
            updatedAt={tickQuery.data?.updatedAt ?? detailQuery.data?.updatedAt}
            isMarketOpen={isMarketOpen}
            marketStatusLabel={marketStatusLabel}
          />
        ) : null}

        {symbol ? (
          <PriceChart
            symbol={symbol}
            klines={klines}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            isLoading={detailQuery.isLoading || klineQuery.isLoading}
          />
        ) : null}

        {symbol ? (
          <FundamentalsCard fundamentals={detailQuery.data?.fundamentals} company={detailQuery.data?.company} />
        ) : null}

        {symbol ? <CompanyInfoSection company={detailQuery.data?.company} /> : null}

        {symbol ? <DividendHistory dividends={detailQuery.data?.dividends} /> : null}
      </div>
    </main>
  );
}
