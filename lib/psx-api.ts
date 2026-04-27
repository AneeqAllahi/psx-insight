import type {
  BreadthStats,
  CompanyInfo,
  Dividend,
  Fundamentals,
  Kline,
  MarketStats,
  SectorData,
  Tick,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_PSX_BASE_URL || 'https://psxterminal.com';

async function fetchPSX<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate: 0 },
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`PSX API error: ${res.status} on ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(`PSX API returned success:false on ${path}`);
  return json.data as T;
}

export const PSXApi = {
  getStatus: () => fetchPSX<{ status: string; timestamp: number }>('/api/status'),
  getSymbols: () => fetchPSX<string[]>('/api/symbols'),
  getTick: (type: string, symbol: string) => fetchPSX<Tick>(`/api/ticks/${type}/${symbol}`),
  getStats: (type: string) => fetchPSX<MarketStats | BreadthStats | Record<string, SectorData>>(`/api/stats/${type}`),
  getFundamentals: (symbol: string) => fetchPSX<Fundamentals>(`/api/fundamentals/${symbol}`),
  getCompany: (symbol: string) => fetchPSX<CompanyInfo>(`/api/companies/${symbol}`),
  getDividends: (symbol: string) => fetchPSX<Dividend[]>(`/api/dividends/${symbol}`),
  getKlines: (symbol: string, timeframe: string, params?: { start?: number; end?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.start) query.set('start', params.start.toString());
    if (params?.end) query.set('end', params.end.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    const qs = query.toString();
    return fetchPSX<Kline[]>(`/api/klines/${symbol}/${timeframe}${qs ? '?' + qs : ''}`);
  },
};
