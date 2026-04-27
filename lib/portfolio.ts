export const PORTFOLIO_STORAGE_KEY = 'psx_portfolio';
export const TAX_PROFILE_STORAGE_KEY = 'psx_tax_profile';

export type FilerStatus = 'filer' | 'non-filer';

export interface TaxProfile {
  filerStatus: FilerStatus;
  setAt: string;
}

export interface Holding {
  symbol: string;
  shares: number;
  avgBuyPrice: number;
  buyDate: string;
  drip: boolean;
  addedAt: string;
}

export function calculateDividendTax(
  grossAmount: number,
  filerStatus: FilerStatus,
  isExemptCompany = false,
) {
  const rates = {
    filer: { standard: 0.15, exempt: 0.25 },
    'non-filer': { standard: 0.30, exempt: 0.50 },
  };
  const rate = isExemptCompany
    ? rates[filerStatus].exempt
    : rates[filerStatus].standard;
  return {
    grossDividend: grossAmount,
    whtRate: rate,
    whtAmount: grossAmount * rate,
    netDividend: grossAmount * (1 - rate),
  };
}

export function calculateCapitalGainsTax(gainAmount: number, filerStatus: FilerStatus) {
  const rate = 0.15;
  return {
    gainAmount,
    filerStatus,
    cgtRate: rate,
    cgtAmount: Math.max(0, gainAmount) * rate,
    note:
      filerStatus === 'non-filer'
        ? '15% minimum floor; actual tax may be higher depending on income slab.'
        : '15% flat withholding rate for listed securities.',
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadPortfolio(): Holding[] {
  if (!canUseStorage()) return [];

  const holdings = parseJson<Holding[]>(window.localStorage.getItem(PORTFOLIO_STORAGE_KEY), []);

  return holdings
    .filter((holding) => holding.symbol && holding.shares > 0 && holding.avgBuyPrice > 0)
    .map((holding) => ({
      ...holding,
      symbol: holding.symbol.toUpperCase(),
    }));
}

export function savePortfolio(holdings: Holding[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(holdings));
  window.dispatchEvent(new Event('psx_portfolio_changed'));
}

export function loadTaxProfile(): TaxProfile | null {
  if (!canUseStorage()) return null;
  const profile = parseJson<TaxProfile | null>(window.localStorage.getItem(TAX_PROFILE_STORAGE_KEY), null);

  if (!profile || (profile.filerStatus !== 'filer' && profile.filerStatus !== 'non-filer')) return null;
  return profile;
}

export function saveTaxProfile(profile: TaxProfile) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(TAX_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event('psx_tax_profile_changed'));
}

export function portfolioHasSymbol(symbol: string) {
  return loadPortfolio().some((holding) => holding.symbol === symbol.toUpperCase());
}

export function upsertHolding(holdings: Holding[], nextHolding: Holding) {
  const symbol = nextHolding.symbol.toUpperCase();
  const existing = holdings.find((holding) => holding.symbol === symbol);

  if (!existing) {
    return [...holdings, { ...nextHolding, symbol }];
  }

  const totalShares = existing.shares + nextHolding.shares;
  const avgBuyPrice =
    ((existing.shares * existing.avgBuyPrice) + (nextHolding.shares * nextHolding.avgBuyPrice)) / totalShares;

  return holdings.map((holding) =>
    holding.symbol === symbol
      ? {
          ...holding,
          shares: totalShares,
          avgBuyPrice,
          buyDate: existing.buyDate <= nextHolding.buyDate ? existing.buyDate : nextHolding.buyDate,
          drip: holding.drip || nextHolding.drip,
        }
      : holding,
  );
}

export function makeHolding(symbol: string, shares: number, avgBuyPrice: number, buyDate: string, drip: boolean): Holding {
  return {
    symbol: symbol.toUpperCase(),
    shares,
    avgBuyPrice,
    buyDate,
    drip,
    addedAt: new Date().toISOString(),
  };
}

