'use client';

import { Star, X } from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useState } from 'react';
import {
  loadPortfolio,
  makeHolding,
  portfolioHasSymbol,
  savePortfolio,
  upsertHolding,
} from '@/lib/portfolio';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pkr(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    style: 'currency',
    currency: 'PKR',
  }).format(value);
}

export function PortfolioStarButton({
  symbol,
  currentPrice,
  compact = false,
}: {
  symbol: string;
  currentPrice?: number | null;
  compact?: boolean;
}) {
  const [isSaved, setIsSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState('1');
  const [price, setPrice] = useState(currentPrice ? currentPrice.toFixed(2) : '');
  const [drip, setDrip] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    function sync() {
      setIsSaved(portfolioHasSymbol(symbol));
    }

    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('psx_portfolio_changed', sync);

    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('psx_portfolio_changed', sync);
    };
  }, [symbol]);

  useEffect(() => {
    if (currentPrice && !price) {
      setPrice(currentPrice.toFixed(2));
    }
  }, [currentPrice, price]);

  function openModal(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setPrice(currentPrice ? currentPrice.toFixed(2) : price);
    setOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedShares = Number(shares);
    const parsedPrice = Number(price);

    if (!Number.isFinite(parsedShares) || parsedShares <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return;
    }

    const nextHolding = makeHolding(symbol, parsedShares, parsedPrice, today(), drip);
    savePortfolio(upsertHolding(loadPortfolio(), nextHolding));
    setIsSaved(true);
    setOpen(false);
    setToast(`${symbol} added - ${parsedShares} shares @ ${pkr(parsedPrice)}`);
    window.setTimeout(() => setToast(''), 3000);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`inline-flex items-center justify-center rounded border border-transparent text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 ${
          compact ? 'h-7 w-7' : 'h-9 w-9'
        }`}
        aria-label={`${isSaved ? 'Add more' : 'Add'} ${symbol} to portfolio`}
        title={`${isSaved ? 'Add more' : 'Add'} ${symbol} to portfolio`}
      >
        <Star className="h-4 w-4" fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded border border-line bg-[#101826] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase text-cyan-300">Add to Portfolio</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">{symbol}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-line p-2 text-gray-400 transition hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="text-sm text-gray-300">
                Shares
                <input
                  value={shares}
                  onChange={(event) => setShares(event.target.value)}
                  type="number"
                  min="1"
                  step="1"
                  className="mt-2 h-11 w-full rounded border border-line bg-black/20 px-3 text-white outline-none focus:border-cyan-300/70"
                />
              </label>
              <label className="text-sm text-gray-300">
                Price
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="mt-2 h-11 w-full rounded border border-line bg-black/20 px-3 text-white outline-none focus:border-cyan-300/70"
                />
              </label>
              <label className="flex items-start gap-3 rounded border border-line bg-black/20 p-3 text-sm text-gray-300">
                <input
                  checked={drip}
                  onChange={(event) => setDrip(event.target.checked)}
                  type="checkbox"
                  className="mt-1"
                />
                <span>
                  Reinvest dividends automatically
                  <span className="block text-xs text-gray-500">DRIP is enabled by default for quick adds.</span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="mt-5 w-full rounded border border-cyan-300/60 bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Add Position
            </button>
          </form>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 shadow-xl">
          {toast}
        </div>
      ) : null}
    </>
  );
}

